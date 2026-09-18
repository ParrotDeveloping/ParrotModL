'use strict';
/** Mod loader metadata + installation (Fabric, Quilt, Forge, NeoForge). */
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { spawn } = require('child_process');
const net = require('../net');
const P = require('../paths');
const mojang = require('./mojang');

const FABRIC_META = 'https://meta.fabricmc.net/v2';
const QUILT_META = 'https://meta.quiltmc.org/v3';
const FORGE_META = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml';
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const NEOFORGE_META = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';
const NEOFORGE_OLD_META = 'https://maven.neoforged.net/releases/net/neoforged/forge/maven-metadata.xml';

function parseMavenMetadata(xml) {
  const out = [];
  const re = /<version>([^<]+)<\/version>/g;
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

/** List available loader versions for a given Minecraft version. */
async function listLoaderVersions(loader, mcVersion) {
  switch (loader) {
    case 'vanilla':
      return [];
    case 'fabric': {
      const list = await net.getJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(mcVersion)}`);
      return list.map((l) => ({
        version: l.loader.version,
        stable: !!l.loader.stable,
        label: l.loader.version + (l.loader.stable ? '' : ' (beta)'),
      }));
    }
    case 'quilt': {
      const list = await net.getJson(`${QUILT_META}/versions/loader/${encodeURIComponent(mcVersion)}`);
      return list.map((l) => ({
        version: l.loader.version,
        stable: !/beta|pre|rc/i.test(l.loader.version),
        label: l.loader.version,
      }));
    }
    case 'forge': {
      const xml = await net.getText(FORGE_META);
      const all = parseMavenMetadata(xml).filter((v) => v.startsWith(mcVersion + '-'));
      let recommended = null;
      try {
        const promos = await net.getJson(FORGE_PROMOS);
        recommended = promos.promos[`${mcVersion}-recommended`] || promos.promos[`${mcVersion}-latest`] || null;
      } catch {}
      return all
        .reverse()
        .map((v) => {
          const short = v.slice(mcVersion.length + 1).split('-')[0];
          return {
            version: v,
            stable: recommended ? short === recommended : false,
            label: short + (recommended && short === recommended ? ' (önerilen)' : ''),
          };
        });
    }
    case 'neoforge': {
      const out = [];
      try {
        const xml = await net.getText(NEOFORGE_META);
        const prefix = neoPrefix(mcVersion);
        const all = parseMavenMetadata(xml).filter((v) => (prefix ? v.startsWith(prefix) : true));
        for (const v of all.reverse()) out.push({ version: v, stable: !/beta/i.test(v), label: v });
      } catch {}
      if (mcVersion === '1.20.1') {
        try {
          const xml = await net.getText(NEOFORGE_OLD_META);
          const all = parseMavenMetadata(xml).filter((v) => v.startsWith('1.20.1-'));
          for (const v of all.reverse()) out.push({ version: v, stable: true, label: v + ' (legacy)' });
        } catch {}
      }
      return out;
    }
    default:
      return [];
  }
}

/** NeoForge versions look like 20.4.190 for MC 1.20.4 */
function neoPrefix(mc) {
  const m = /^1\.(\d+)(?:\.(\d+))?$/.exec(mc);
  if (!m) return null;
  const minor = m[1];
  const patch = m[2] || '0';
  return `${minor}.${patch}.`;
}

/** Which Minecraft versions each loader supports (for the version picker). */
async function supportedGameVersions(loader) {
  if (loader === 'fabric') {
    const list = await net.getJson(`${FABRIC_META}/versions/game`);
    return list.map((v) => v.version);
  }
  if (loader === 'quilt') {
    const list = await net.getJson(`${QUILT_META}/versions/game`);
    return list.map((v) => v.version);
  }
  if (loader === 'forge') {
    const xml = await net.getText(FORGE_META);
    return [...new Set(parseMavenMetadata(xml).map((v) => v.split('-')[0]))];
  }
  if (loader === 'neoforge') {
    const xml = await net.getText(NEOFORGE_META);
    const versions = parseMavenMetadata(xml);
    const mcs = new Set();
    for (const v of versions) {
      const m = /^(\d+)\.(\d+)\./.exec(v);
      if (m) mcs.add(`1.${m[1]}${m[2] === '0' ? '' : '.' + m[2]}`);
    }
    return [...mcs];
  }
  return null; // vanilla: all
}

/** Human readable version id stored under meta/versions/<id> */
function versionId(loader, mcVersion, loaderVersion) {
  switch (loader) {
    case 'fabric':
      return `fabric-loader-${loaderVersion}-${mcVersion}`;
    case 'quilt':
      return `quilt-loader-${loaderVersion}-${mcVersion}`;
    case 'forge':
      // Forge kurulum dosyası sürümü "1.20.1-forge-47.2.20" olarak yazar
      return `${mcVersion}-forge-${String(loaderVersion).replace(mcVersion + '-', '')}`;
    case 'neoforge':
      return /^1\.20\.1-/.test(loaderVersion) ? `${loaderVersion}-neoforge` : `neoforge-${loaderVersion}`;
    default:
      return mcVersion;
  }
}

async function writeLocalVersion(id, json) {
  const file = path.join(P.versionDir(id), `${id}.json`);
  await fsp.writeFile(file, JSON.stringify(json, null, 2));
  return file;
}

async function readLocalVersion(id) {
  const file = path.join(P.versions(), id, `${id}.json`);
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Install a loader profile. Returns the version id to launch.
 * @param {(msg:string,pct?:number)=>void} log
 */
async function installLoader({ loader, mcVersion, loaderVersion, javaPath }, log = () => {}) {
  if (!loader || loader === 'vanilla') return mcVersion;
  const id = versionId(loader, mcVersion, loaderVersion);
  const existing = await readLocalVersion(id);
  if (existing) return id;

  if (loader === 'fabric' || loader === 'quilt') {
    const base = loader === 'fabric' ? FABRIC_META : QUILT_META;
    log(`${loader} profili indiriliyor...`);
    const json = await net.getJson(
      `${base}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
    );
    json.id = id;
    await writeLocalVersion(id, json);
    return id;
  }

  if (loader === 'forge' || loader === 'neoforge') {
    return installForgeLike({ loader, mcVersion, loaderVersion, javaPath, id }, log);
  }
  throw new Error('Bilinmeyen mod loader: ' + loader);
}

function forgeInstallerUrl(loader, loaderVersion) {
  if (loader === 'forge') {
    return `https://maven.minecraftforge.net/net/minecraftforge/forge/${loaderVersion}/forge-${loaderVersion}-installer.jar`;
  }
  if (/^1\.20\.1-/.test(loaderVersion)) {
    return `https://maven.neoforged.net/releases/net/neoforged/forge/${loaderVersion}/forge-${loaderVersion}-installer.jar`;
  }
  return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;
}

/**
 * Forge / NeoForge ship an installer jar that runs "processors" (deobfuscation,
 * binary patching). Running the official installer in client mode is the only
 * reliable way to reproduce that, so that is what we do.
 */
async function installForgeLike({ loader, mcVersion, loaderVersion, javaPath, id }, log) {
  if (!javaPath) throw new Error('Forge/NeoForge kurulumu için Java gerekli.');

  // The installer expects a vanilla-launcher style directory.
  const mcDir = P.root();
  const versionsDir = P.versions();
  // ensure vanilla base is present (installer needs the client jar for patching)
  log('Vanilla temel sürüm hazırlanıyor...');
  const vanilla = await mojang.getVersionJson(mcVersion);
  const clientJar = path.join(P.versionDir(mcVersion), `${mcVersion}.jar`);
  if (vanilla.downloads && vanilla.downloads.client) {
    await net.download({
      url: vanilla.downloads.client.url,
      dest: clientJar,
      sha1: vanilla.downloads.client.sha1,
      size: vanilla.downloads.client.size,
    });
  }

  const profilesFile = path.join(mcDir, 'launcher_profiles.json');
  if (!fs.existsSync(profilesFile)) {
    fs.writeFileSync(
      profilesFile,
      JSON.stringify({ profiles: {}, settings: {}, version: 3 }, null, 2)
    );
  }
  const msaFile = path.join(mcDir, 'launcher_profiles_microsoft_store.json');
  if (!fs.existsSync(msaFile)) fs.writeFileSync(msaFile, JSON.stringify({ profiles: {} }));

  const installer = path.join(P.temp(), `${loader}-${loaderVersion}-installer.jar`);
  log(`${loader} kurulum dosyası indiriliyor...`);
  await net.download({ url: forgeInstallerUrl(loader, loaderVersion), dest: installer });

  log(`${loader} kuruluyor (bu biraz sürebilir)...`);
  // Forge "--installClient", NeoForge'un bazı sürümleri "--install-client" bekliyor.
  try {
    await runJava(javaPath, ['-jar', installer, '--installClient', mcDir], log);
  } catch (e) {
    log('Alternatif kurulum parametresi deneniyor...');
    await runJava(javaPath, ['-jar', installer, '--install-client', mcDir], log);
  }

  // The installer writes versions/<id>/<id>.json - find it.
  const candidates = fs.readdirSync(versionsDir).filter((d) => {
    const lower = d.toLowerCase();
    if (loader === 'forge') return lower.includes('forge') && lower.includes(mcVersion) && !lower.includes('neoforge');
    return lower.includes('neoforge') || (lower.includes('forge') && lower.includes(loaderVersion.toLowerCase()));
  });
  let found = candidates.find((c) => c === id);
  if (!found) {
    // installer naming differs between versions; pick the newest matching folder
    let newest = null;
    let newestTime = 0;
    for (const c of candidates) {
      const f = path.join(versionsDir, c, `${c}.json`);
      if (!fs.existsSync(f)) continue;
      const t = fs.statSync(f).mtimeMs;
      if (t > newestTime) {
        newestTime = t;
        newest = c;
      }
    }
    found = newest;
  }
  if (!found) throw new Error(`${loader} kurulumu tamamlanamadı (sürüm klasörü bulunamadı).`);
  try {
    fs.unlinkSync(installer);
  } catch {}
  return found;
}

function runJava(javaPath, args, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(javaPath, args, { cwd: P.root(), windowsHide: true });
    let err = '';
    child.stdout.on('data', (d) => log(String(d).trim().slice(0, 200)));
    child.stderr.on('data', (d) => {
      err += d;
      log(String(d).trim().slice(0, 200));
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Kurulum başarısız (çıkış kodu ${code})\n${err.slice(-800)}`));
    });
  });
}

module.exports = {
  listLoaderVersions,
  supportedGameVersions,
  installLoader,
  versionId,
  readLocalVersion,
  writeLocalVersion,
  LOADERS: ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'],
};
