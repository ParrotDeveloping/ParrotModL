'use strict';
/** Profile (instance) management: CRUD, content install, import/export. */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const net = require('./net');
const P = require('./paths');
const content = require('./api/content');
const modrinth = require('./api/modrinth');
const curseforge = require('./api/curseforge');

const CONTENT_DIRS = {
  mod: 'mods',
  modpack: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
  datapack: 'datapacks',
  world: 'saves',
};

function slug(s) {
  return (
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'profil'
  );
}

class Profiles {
  constructor(store) {
    this.store = store;
  }

  list() {
    return this.store.profiles.map((p) => this.view(p));
  }

  view(p) {
    const dir = path.join(P.instances(), p.id);
    return {
      ...p,
      dir,
      modCount: (p.content || []).filter((c) => c.type === 'mod').length,
      totalContent: (p.content || []).length,
    };
  }

  get(id) {
    return this.store.profiles.find((p) => p.id === id) || null;
  }

  require(id) {
    const p = this.get(id);
    if (!p) throw new Error('Profil bulunamadı.');
    return p;
  }

  create(data) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Profil adı gerekli.');
    if (!data.mcVersion) throw new Error('Minecraft sürümü seçin.');
    let id = slug(name);
    let n = 1;
    while (this.store.profiles.some((p) => p.id === id)) id = slug(name) + '-' + ++n;

    const profile = {
      id,
      name,
      mcVersion: data.mcVersion,
      loader: data.loader || 'vanilla',
      loaderVersion: data.loaderVersion || '',
      icon: data.icon || '',
      group: data.group || '',
      created: Date.now(),
      lastPlayed: 0,
      playTime: 0,
      memoryMb: data.memoryMb || null,
      jvmArgs: data.jvmArgs || '',
      width: data.width || null,
      height: data.height || null,
      fullscreen: data.fullscreen ?? null,
      content: [],
      source: data.source || 'manual',
      packInfo: data.packInfo || null,
    };
    P.instance(id);
    for (const d of ['mods', 'resourcepacks', 'shaderpacks', 'config', 'screenshots', 'saves']) {
      fs.mkdirSync(path.join(P.instance(id), d), { recursive: true });
    }
    if (data.iconData) profile.icon = this.saveIcon(id, data.iconData);
    this.store.profiles.unshift(profile);
    this.store.saveProfiles();
    return this.view(profile);
  }

  saveIcon(profileId, dataUrl) {
    try {
      const buf = Buffer.from(String(dataUrl).split(',').pop(), 'base64');
      const file = `${profileId}-${Date.now()}.png`;
      fs.writeFileSync(path.join(P.icons(), file), buf);
      return 'local:' + file;
    } catch {
      return '';
    }
  }

  iconDataUrl(icon) {
    if (!icon) return '';
    if (!icon.startsWith('local:')) return icon;
    try {
      const buf = fs.readFileSync(path.join(P.icons(), icon.slice(6)));
      return 'data:image/png;base64,' + buf.toString('base64');
    } catch {
      return '';
    }
  }

  update(id, patch) {
    const p = this.require(id);
    const allowed = [
      'name',
      'icon',
      'group',
      'memoryMb',
      'jvmArgs',
      'width',
      'height',
      'fullscreen',
      'loaderVersion',
      'quickPlayServer',
    ];
    for (const k of allowed) if (patch[k] !== undefined) p[k] = patch[k];
    if (patch.iconData) p.icon = this.saveIcon(id, patch.iconData);
    this.store.saveProfiles();
    return this.view(p);
  }

  async remove(id, deleteFiles = true) {
    const p = this.require(id);
    this.store.profiles = this.store.profiles.filter((x) => x.id !== id);
    this.store.saveProfiles();
    if (deleteFiles) {
      try {
        await fsp.rm(path.join(P.instances(), p.id), { recursive: true, force: true });
      } catch {}
    }
    return this.list();
  }

  async duplicate(id, newName) {
    const src = this.require(id);
    const copy = this.create({
      name: newName || src.name + ' kopya',
      mcVersion: src.mcVersion,
      loader: src.loader,
      loaderVersion: src.loaderVersion,
      icon: src.icon,
      group: src.group,
      memoryMb: src.memoryMb,
      jvmArgs: src.jvmArgs,
    });
    await fsp.cp(path.join(P.instances(), src.id), path.join(P.instances(), copy.id), {
      recursive: true,
      force: true,
    });
    const target = this.require(copy.id);
    target.content = JSON.parse(JSON.stringify(src.content || []));
    this.store.saveProfiles();
    return this.view(target);
  }

  markPlayed(id) {
    const p = this.get(id);
    if (!p) return;
    p.lastPlayed = Date.now();
    this.store.saveProfiles();
  }

  addPlayTime(id, seconds) {
    const p = this.get(id);
    if (!p) return;
    p.playTime = (p.playTime || 0) + Math.max(0, Math.round(seconds));
    this.store.saveProfiles();
  }

  // ---------------------------------------------------------------- content

  contentDir(profile, type) {
    return path.join(P.instance(profile.id), CONTENT_DIRS[type] || 'mods');
  }

  /**
   * Check whether a project version fits a profile.
   * @returns {{ok:boolean,reason?:string}}
   */
  compatibility(profile, version, type = 'mod') {
    if (!version) return { ok: false, reason: 'Sürüm bulunamadı.' };
    const gv = version.gameVersions || [];
    if (gv.length && !gv.includes(profile.mcVersion)) {
      return { ok: false, reason: `Bu dosya ${profile.mcVersion} sürümünü desteklemiyor (${gv.slice(0, 4).join(', ')}).` };
    }
    if (type === 'mod') {
      const ls = (version.loaders || []).map((l) => l.toLowerCase());
      if (ls.length && !ls.includes(profile.loader)) {
        // Quilt can load Fabric mods
        if (!(profile.loader === 'quilt' && ls.includes('fabric'))) {
          return { ok: false, reason: `Bu dosya ${profile.loader} için değil (${ls.join(', ')}).` };
        }
      }
      if (profile.loader === 'vanilla') {
        return { ok: false, reason: 'Vanilla profile mod kurulamaz. Fabric/Forge/Quilt/NeoForge profili kullanın.' };
      }
    }
    return { ok: true };
  }

  /**
   * Install a project version (plus required dependencies) into a profile.
   */
  async installContent(profileId, { source, projectId, versionId, type = 'mod', withDependencies = true }, onProgress = () => {}) {
    const profile = this.require(profileId);
    const api = content.provider(source);
    const loader = profile.loader === 'vanilla' ? null : profile.loader;

    onProgress({ stage: 'Sürüm seçiliyor', percent: 5 });
    let version;
    if (versionId) {
      version = source === 'modrinth' ? await modrinth.getVersion(versionId) : await curseforge.getVersion(versionId, projectId);
    } else {
      version = await api.bestVersion(projectId, {
        loader: type === 'mod' ? loader : null,
        gameVersion: profile.mcVersion,
      });
    }
    if (!version) throw new Error(`Bu profile uygun sürüm bulunamadı (${profile.mcVersion} / ${profile.loader}).`);

    const compat = this.compatibility(profile, version, type);
    if (!compat.ok) throw new Error(compat.reason);
    if (!version.file || !version.file.url) {
      throw new Error('Bu dosya doğrudan indirilemiyor (yazar üçüncü taraf indirmeyi kapatmış). Proje sayfasından indirin.');
    }

    let deps = [];
    let missing = [];
    if (withDependencies && type === 'mod') {
      onProgress({ stage: 'Bağımlılıklar çözümleniyor', percent: 15 });
      const res = await content.resolveWithDependencies(source, version, {
        loader,
        gameVersion: profile.mcVersion,
      });
      deps = res.deps;
      missing = res.missing;
    }

    let project = null;
    try {
      project = await api.getProject(projectId || version.projectId);
    } catch {}

    const targets = [{ version, project, type }, ...deps.map((d) => ({ version: d.version, project: d.project, type: 'mod' }))];
    const dir = this.contentDir(profile, type);
    fs.mkdirSync(dir, { recursive: true });

    const installed = [];
    let i = 0;
    for (const t of targets) {
      i++;
      const pct = 25 + (i / targets.length) * 70;
      const fname = t.version.file.name || `${t.version.id}.jar`;
      onProgress({ stage: `İndiriliyor: ${fname}`, percent: pct });
      const destDir = t === targets[0] ? dir : this.contentDir(profile, 'mod');
      const dest = path.join(destDir, sanitize(fname));
      await net.download({
        url: t.version.file.url,
        dest,
        sha1: t.version.file.sha1 || null,
        size: t.version.file.size || null,
      });
      const entry = {
        uid: crypto.randomBytes(6).toString('hex'),
        source,
        type: t.type,
        projectId: String(t.version.projectId || (t.project && t.project.id) || ''),
        versionId: String(t.version.id),
        name: (t.project && t.project.title) || t.version.name,
        icon: (t.project && t.project.icon) || '',
        fileName: path.basename(dest),
        file: path.relative(P.instance(profile.id), dest).split(path.sep).join('/'),
        versionNumber: t.version.versionNumber,
        size: t.version.file.size || 0,
        sha1: t.version.file.sha1 || null,
        url: t.version.file.url,
        disabled: false,
        installedAt: Date.now(),
        isDependency: t !== targets[0],
      };
      profile.content = (profile.content || []).filter(
        (c) => !(c.projectId === entry.projectId && c.source === entry.source && c.type === entry.type)
      );
      profile.content.push(entry);
      installed.push(entry);
    }

    this.store.saveProfiles();
    onProgress({ stage: 'Tamamlandı', percent: 100 });
    return { installed, missing };
  }

  /** Download a single file to an arbitrary folder (Discover -> "dosya olarak indir"). */
  async downloadToFolder({ source, projectId, versionId, gameVersion, loader, targetDir }, onProgress = () => {}) {
    const api = content.provider(source);
    let version;
    if (versionId) {
      version = source === 'modrinth' ? await modrinth.getVersion(versionId) : await curseforge.getVersion(versionId, projectId);
    } else {
      version = await api.bestVersion(projectId, { loader, gameVersion });
    }
    if (!version || !version.file || !version.file.url) throw new Error('İndirilebilir dosya bulunamadı.');
    const dest = path.join(targetDir, sanitize(version.file.name));
    let got = 0;
    await net.download({ url: version.file.url, dest, sha1: version.file.sha1, size: version.file.size }, (n) => {
      got += n;
      onProgress({ stage: version.file.name, percent: version.file.size ? (got / version.file.size) * 100 : 50 });
    });
    return { path: dest, name: version.file.name };
  }

  listContent(profileId) {
    const p = this.require(profileId);
    const dir = P.instance(p.id);
    return (p.content || []).map((c) => ({
      ...c,
      exists: fs.existsSync(path.join(dir, c.file)) || fs.existsSync(path.join(dir, c.file + '.disabled')),
    }));
  }

  toggleContent(profileId, uid) {
    const p = this.require(profileId);
    const c = (p.content || []).find((x) => x.uid === uid);
    if (!c) throw new Error('İçerik bulunamadı.');
    const dir = P.instance(p.id);
    const active = path.join(dir, c.file);
    const disabled = active + '.disabled';
    try {
      if (c.disabled && fs.existsSync(disabled)) fs.renameSync(disabled, active);
      else if (!c.disabled && fs.existsSync(active)) fs.renameSync(active, disabled);
    } catch (e) {
      throw new Error('Dosya durumu değiştirilemedi: ' + e.message);
    }
    c.disabled = !c.disabled;
    this.store.saveProfiles();
    return this.listContent(profileId);
  }

  removeContent(profileId, uid) {
    const p = this.require(profileId);
    const c = (p.content || []).find((x) => x.uid === uid);
    if (!c) throw new Error('İçerik bulunamadı.');
    const dir = P.instance(p.id);
    for (const f of [path.join(dir, c.file), path.join(dir, c.file + '.disabled')]) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
    p.content = p.content.filter((x) => x.uid !== uid);
    this.store.saveProfiles();
    return this.listContent(profileId);
  }

  /** Check every installed mod for a newer version. */
  async checkUpdates(profileId) {
    const p = this.require(profileId);
    const out = [];
    for (const c of p.content || []) {
      try {
        const api = content.provider(c.source);
        const v = await api.bestVersion(c.projectId, {
          loader: c.type === 'mod' && p.loader !== 'vanilla' ? p.loader : null,
          gameVersion: p.mcVersion,
        });
        if (v && String(v.id) !== String(c.versionId)) {
          out.push({ uid: c.uid, name: c.name, current: c.versionNumber, latest: v.versionNumber, versionId: v.id });
        }
      } catch {}
    }
    return out;
  }

  async updateContent(profileId, uid, versionId) {
    const p = this.require(profileId);
    const c = (p.content || []).find((x) => x.uid === uid);
    if (!c) throw new Error('İçerik bulunamadı.');
    this.removeContent(profileId, uid);
    return this.installContent(profileId, {
      source: c.source,
      projectId: c.projectId,
      versionId,
      type: c.type,
      withDependencies: true,
    });
  }

  // ----------------------------------------------------------- import/export

  /** Export a profile as a .mrpack (Modrinth modpack format). */
  async exportPack(profileId, { destFile, includeConfigs = true, includeSaves = false, version = '1.0.0', extraOverrides = [] } = {}) {
    const p = this.require(profileId);
    const dir = P.instance(p.id);
    const zip = new AdmZip();

    const files = [];
    const embedded = new Set();
    for (const c of p.content || []) {
      if (c.disabled) continue;
      if (c.url && c.sha1) {
        files.push({
          path: c.file,
          hashes: { sha1: c.sha1 },
          env: { client: 'required', server: 'required' },
          downloads: [c.url],
          fileSize: c.size || 0,
        });
      } else {
        embedded.add(c.file);
      }
    }

    const deps = { minecraft: p.mcVersion };
    if (p.loader === 'fabric') deps['fabric-loader'] = p.loaderVersion;
    if (p.loader === 'quilt') deps['quilt-loader'] = p.loaderVersion;
    if (p.loader === 'forge') deps.forge = String(p.loaderVersion).replace(p.mcVersion + '-', '');
    if (p.loader === 'neoforge') deps.neoforge = p.loaderVersion;

    const index = {
      formatVersion: 1,
      game: 'minecraft',
      versionId: version,
      name: p.name,
      summary: `ParrotModL ile dışa aktarıldı - ${p.mcVersion} ${p.loader}`,
      files,
      dependencies: deps,
    };
    zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2), 'utf8'));

    // ParrotModL specific metadata so re-import keeps icon/settings
    zip.addFile(
      'parrotmodl.json',
      Buffer.from(
        JSON.stringify(
          {
            name: p.name,
            mcVersion: p.mcVersion,
            loader: p.loader,
            loaderVersion: p.loaderVersion,
            memoryMb: p.memoryMb,
            jvmArgs: p.jvmArgs,
            group: p.group,
            content: p.content,
            iconData: this.iconDataUrl(p.icon) || '',
          },
          null,
          2
        ),
        'utf8'
      )
    );

    const addDir = (rel) => {
      const abs = path.join(dir, rel);
      if (!fs.existsSync(abs)) return;
      addFolderToZip(zip, abs, 'overrides/' + rel);
    };
    if (includeConfigs) {
      addDir('config');
      addDir('options.txt');
    }
    if (includeSaves) addDir('saves');
    for (const rel of extraOverrides) addDir(rel);
    for (const rel of embedded) {
      const abs = path.join(dir, rel);
      if (fs.existsSync(abs)) zip.addLocalFile(abs, 'overrides/' + path.dirname(rel));
    }
    // options.txt is a file not a dir
    const opts = path.join(dir, 'options.txt');
    if (includeConfigs && fs.existsSync(opts)) zip.addLocalFile(opts, 'overrides');

    zip.writeZip(destFile);
    return { path: destFile, files: files.length, overrides: embedded.size };
  }

  /**
   * Import a .mrpack (Modrinth) or CurseForge modpack .zip into a new profile.
   */
  async importPack(zipPath, { name } = {}, onProgress = () => {}) {
    onProgress({ stage: 'Paket okunuyor', percent: 3 });
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const byName = (n) => entries.find((e) => e.entryName.replace(/\\/g, '/') === n);

    const mrIndex = byName('modrinth.index.json');
    const cfManifest = byName('manifest.json');
    if (mrIndex) return this.importMrpack(zip, mrIndex, { name }, onProgress);
    if (cfManifest) return this.importCursePack(zip, cfManifest, { name }, onProgress);
    throw new Error('Desteklenmeyen paket. .mrpack veya CurseForge .zip bekleniyor.');
  }

  async importMrpack(zip, indexEntry, { name }, onProgress) {
    const index = JSON.parse(indexEntry.getData().toString('utf8'));
    const deps = index.dependencies || {};
    const mcVersion = deps.minecraft;
    let loader = 'vanilla';
    let loaderVersion = '';
    if (deps['fabric-loader']) {
      loader = 'fabric';
      loaderVersion = deps['fabric-loader'];
    } else if (deps['quilt-loader']) {
      loader = 'quilt';
      loaderVersion = deps['quilt-loader'];
    } else if (deps.forge) {
      loader = 'forge';
      loaderVersion = String(deps.forge).includes('-') ? deps.forge : `${mcVersion}-${deps.forge}`;
    } else if (deps.neoforge) {
      loader = 'neoforge';
      loaderVersion = deps.neoforge;
    }

    const pmEntry = zip.getEntries().find((e) => e.entryName === 'parrotmodl.json');
    let pm = null;
    if (pmEntry) {
      try {
        pm = JSON.parse(pmEntry.getData().toString('utf8'));
      } catch {}
    }

    onProgress({ stage: 'Profil oluşturuluyor', percent: 8 });
    const profile = this.create({
      name: name || index.name || (pm && pm.name) || 'İçe aktarılan paket',
      mcVersion,
      loader,
      loaderVersion,
      iconData: pm && pm.iconData ? pm.iconData : undefined,
      memoryMb: pm ? pm.memoryMb : null,
      jvmArgs: pm ? pm.jvmArgs : '',
      source: 'import',
      packInfo: { format: 'mrpack', version: index.versionId, name: index.name },
    });
    const dir = P.instance(profile.id);

    onProgress({ stage: 'Ek dosyalar açılıyor', percent: 14 });
    extractOverrides(zip, dir, ['overrides/', 'client-overrides/']);

    const files = (index.files || []).filter((f) => {
      const env = f.env || {};
      return env.client !== 'unsupported';
    });
    const total = files.length || 1;
    let n = 0;
    const p = this.require(profile.id);
    p.content = [];

    const tasks = files.map((f) => async () => {
      const dest = path.join(dir, f.path);
      try {
        await net.download({
          url: f.downloads[0],
          dest,
          sha1: (f.hashes && f.hashes.sha1) || null,
          size: f.fileSize || null,
        });
        p.content.push({
          uid: crypto.randomBytes(6).toString('hex'),
          source: /modrinth/.test(f.downloads[0]) ? 'modrinth' : 'curseforge',
          type: f.path.startsWith('mods') ? 'mod' : f.path.startsWith('resourcepacks') ? 'resourcepack' : f.path.startsWith('shaderpacks') ? 'shader' : 'mod',
          projectId: '',
          versionId: '',
          name: path.basename(f.path),
          fileName: path.basename(f.path),
          file: f.path,
          versionNumber: '',
          size: f.fileSize || 0,
          sha1: (f.hashes && f.hashes.sha1) || null,
          url: f.downloads[0],
          disabled: false,
          installedAt: Date.now(),
        });
      } catch (e) {
        // keep going; report at the end
        p.content.push({
          uid: crypto.randomBytes(6).toString('hex'),
          source: 'unknown',
          type: 'mod',
          name: path.basename(f.path) + ' (indirilemedi)',
          fileName: path.basename(f.path),
          file: f.path,
          failed: true,
          error: e.message,
          disabled: true,
          installedAt: Date.now(),
        });
      }
      n++;
      onProgress({ stage: `Modlar indiriliyor (${n}/${total})`, percent: 15 + (n / total) * 80 });
    });
    await net.pool(tasks, 8);

    // restore rich metadata when the pack came from ParrotModL
    if (pm && Array.isArray(pm.content) && pm.content.length) {
      for (const saved of pm.content) {
        const match = p.content.find((c) => c.file === saved.file);
        if (match) Object.assign(match, { projectId: saved.projectId, versionId: saved.versionId, name: saved.name, icon: saved.icon, source: saved.source, type: saved.type, versionNumber: saved.versionNumber });
      }
    }
    this.store.saveProfiles();
    onProgress({ stage: 'Tamamlandı', percent: 100 });
    return this.view(p);
  }

  async importCursePack(zip, manifestEntry, { name }, onProgress) {
    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
    const mcVersion = manifest.minecraft && manifest.minecraft.version;
    let loader = 'vanilla';
    let loaderVersion = '';
    const ml = (manifest.minecraft && manifest.minecraft.modLoaders && manifest.minecraft.modLoaders[0]) || null;
    if (ml && ml.id) {
      const [kind, ver] = ml.id.split('-');
      if (kind === 'forge') {
        loader = 'forge';
        loaderVersion = `${mcVersion}-${ver}`;
      } else if (kind === 'fabric') {
        loader = 'fabric';
        loaderVersion = ver;
      } else if (kind === 'quilt') {
        loader = 'quilt';
        loaderVersion = ver;
      } else if (kind === 'neoforge') {
        loader = 'neoforge';
        loaderVersion = ver;
      }
    }

    onProgress({ stage: 'Profil oluşturuluyor', percent: 8 });
    const profile = this.create({
      name: name || manifest.name || 'CurseForge paketi',
      mcVersion,
      loader,
      loaderVersion,
      source: 'import',
      packInfo: { format: 'curseforge', version: manifest.version, name: manifest.name, author: manifest.author },
    });
    const dir = P.instance(profile.id);

    onProgress({ stage: 'Ek dosyalar açılıyor', percent: 14 });
    const overridesDir = manifest.overrides || 'overrides';
    extractOverrides(zip, dir, [overridesDir.replace(/\/?$/, '/')]);

    const fileIds = (manifest.files || []).map((f) => f.fileID);
    onProgress({ stage: 'Mod bilgileri alınıyor', percent: 18 });
    let cfFiles = [];
    try {
      cfFiles = await curseforge.getFilesBulk(fileIds);
    } catch (e) {
      // fall back to one-by-one
      for (const f of manifest.files || []) {
        try {
          cfFiles.push(await curseforge.getVersion(f.fileID, f.projectID));
        } catch {}
      }
    }

    const p = this.require(profile.id);
    p.content = [];
    const total = cfFiles.length || 1;
    let n = 0;
    const tasks = cfFiles.map((cf) => async () => {
      const rel = 'mods/' + sanitize(cf.file.name);
      const dest = path.join(dir, rel);
      try {
        if (!cf.file.url) throw new Error('Yazar üçüncü taraf indirmeye izin vermiyor.');
        await net.download({ url: cf.file.url, dest, sha1: cf.file.sha1, size: cf.file.size });
        p.content.push({
          uid: crypto.randomBytes(6).toString('hex'),
          source: 'curseforge',
          type: 'mod',
          projectId: String(cf.projectId),
          versionId: String(cf.id),
          name: cf.name,
          fileName: cf.file.name,
          file: rel,
          versionNumber: cf.versionNumber,
          size: cf.file.size,
          sha1: cf.file.sha1,
          url: cf.file.url,
          disabled: false,
          installedAt: Date.now(),
        });
      } catch (e) {
        p.content.push({
          uid: crypto.randomBytes(6).toString('hex'),
          source: 'curseforge',
          type: 'mod',
          name: cf.name + ' (indirilemedi)',
          fileName: cf.file.name,
          file: rel,
          failed: true,
          error: e.message,
          disabled: true,
          installedAt: Date.now(),
        });
      }
      n++;
      onProgress({ stage: `Modlar indiriliyor (${n}/${total})`, percent: 20 + (n / total) * 75 });
    });
    await net.pool(tasks, 8);
    this.store.saveProfiles();
    onProgress({ stage: 'Tamamlandı', percent: 100 });
    return this.view(p);
  }

  /** Install a modpack straight from Modrinth / CurseForge search results. */
  async installModpack({ source, projectId, versionId, name }, onProgress = () => {}) {
    onProgress({ stage: 'Paket sürümü seçiliyor', percent: 3 });
    const api = content.provider(source);
    let version;
    if (versionId) {
      version = source === 'modrinth' ? await modrinth.getVersion(versionId) : await curseforge.getVersion(versionId, projectId);
    } else {
      const list = await api.getVersions(projectId, {});
      version = list[0];
    }
    if (!version || !version.file || !version.file.url) throw new Error('Paket dosyası indirilemiyor.');

    const tmp = path.join(P.temp(), sanitize(version.file.name));
    let got = 0;
    await net.download({ url: version.file.url, dest: tmp, sha1: version.file.sha1, size: version.file.size }, (n) => {
      got += n;
      onProgress({
        stage: 'Paket indiriliyor',
        percent: 3 + (version.file.size ? (got / version.file.size) * 12 : 5),
      });
    });
    const result = await this.importPack(tmp, { name }, (p) =>
      onProgress({ stage: p.stage, percent: 15 + (p.percent || 0) * 0.85 })
    );
    try {
      await fsp.unlink(tmp);
    } catch {}
    return result;
  }

  // -------------------------------------------------------------- screenshots

  screenshots() {
    const out = [];
    for (const p of this.store.profiles) {
      const dir = path.join(P.instances(), p.id, 'screenshots');
      let files = [];
      try {
        files = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!/\.(png|jpg|jpeg)$/i.test(f)) continue;
        const abs = path.join(dir, f);
        let st;
        try {
          st = fs.statSync(abs);
        } catch {
          continue;
        }
        out.push({
          id: p.id + '/' + f,
          profileId: p.id,
          profileName: p.name,
          file: f,
          path: abs,
          size: st.size,
          time: st.mtimeMs,
        });
      }
    }
    out.sort((a, b) => b.time - a.time);
    return out;
  }

  deleteScreenshot(id) {
    const [profileId, ...rest] = id.split('/');
    const file = rest.join('/');
    const abs = path.join(P.instances(), profileId, 'screenshots', path.basename(file));
    fs.unlinkSync(abs);
    return true;
  }
}

function sanitize(name) {
  return String(name || 'dosya')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .slice(0, 180);
}

function addFolderToZip(zip, absPath, zipPath) {
  const st = fs.statSync(absPath);
  if (st.isFile()) {
    zip.addLocalFile(absPath, path.dirname(zipPath));
    return;
  }
  for (const entry of fs.readdirSync(absPath)) {
    addFolderToZip(zip, path.join(absPath, entry), zipPath + '/' + entry);
  }
}

function extractOverrides(zip, destDir, prefixes) {
  for (const e of zip.getEntries()) {
    const name = e.entryName.replace(/\\/g, '/');
    const prefix = prefixes.find((p) => name.startsWith(p));
    if (!prefix) continue;
    const rel = name.slice(prefix.length);
    if (!rel || e.isDirectory) continue;
    const dest = path.join(destDir, rel);
    if (!path.resolve(dest).startsWith(path.resolve(destDir))) continue; // zip-slip guard
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      fs.writeFileSync(dest, e.getData());
    } catch {}
  }
}

module.exports = { Profiles, CONTENT_DIRS, sanitize };
