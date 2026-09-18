'use strict';
/**
 * Ağ gerektirmeyen arka uç testleri.
 * Çalıştırma:  xvfb-run -a ./node_modules/.bin/electron test/backend-test.js --no-sandbox
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const results = [];
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => results.push({ name, ok: true }))
    .catch((e) => results.push({ name, ok: false, error: e.message + '\n' + (e.stack || '').split('\n')[1] }));
}

app.whenReady().then(async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'parrot-test-'));
  const src = path.join(__dirname, '..', 'src', 'main');

  const P = require(path.join(src, 'paths'));
  const { Store } = require(path.join(src, 'store'));
  const { Accounts, offlineUuid } = require(path.join(src, 'auth', 'accounts'));
  const { Profiles } = require(path.join(src, 'profiles'));
  const { Skins, validatePng } = require(path.join(src, 'skins'));
  const mojang = require(path.join(src, 'game', 'mojang'));
  const installer = require(path.join(src, 'game', 'installer'));

  const store = new Store();
  store.settings.dataDir = tmpRoot;
  P.setRoot(tmpRoot);
  store.load = null; // yükleme yerine doğrudan ayarla
  store.accounts = { active: null, list: [] };
  store.profiles = [];
  store.skins = [];
  store.saveSettings = () => {};
  store.saveAccounts = () => {};
  store.saveProfiles = () => {};
  store.saveSkins = () => {};

  const accounts = new Accounts(store);
  const profiles = new Profiles(store);
  const skins = new Skins(store);

  // ---------------------------------------------------------- offline uuid
  await test('Çevrimdışı UUID Mojang algoritmasıyla uyumlu', () => {
    // bilinen değer: "Notch" -> b50ad385-829d-3141-a216-7e7d7539ba7f
    assert.strictEqual(offlineUuid('Notch'), 'b50ad385-829d-3141-a216-7e7d7539ba7f');
    assert.strictEqual(offlineUuid('jeb_'), 'a762f560-4fce-3236-812a-b80efff0b62b');
    // sürüm 3 / varyant 2 bitleri doğru yerleşmeli
    assert.strictEqual(offlineUuid('Herhangi')[14], '3');
    assert.ok(['8', '9', 'a', 'b'].includes(offlineUuid('Herhangi')[19]));
  });

  await test('Çevrimdışı hesap eklenir ve aktif olur', () => {
    accounts.addOffline('TestOyuncu');
    const a = accounts.active();
    assert.strictEqual(a.name, 'TestOyuncu');
    assert.strictEqual(a.type, 'offline');
    assert.match(a.uuid, /^[0-9a-f-]{36}$/);
  });

  await test('Geçersiz isim reddedilir', () => {
    assert.throws(() => accounts.addOffline('ab'), /Geçersiz isim/);
    assert.throws(() => accounts.addOffline('çok uzun bir isim var burada'), /Geçersiz isim/);
  });

  // ---------------------------------------------------------- profil
  let profile;
  await test('Profil oluşturulur ve klasörleri açılır', () => {
    profile = profiles.create({ name: 'Test Profili', mcVersion: '1.20.1', loader: 'fabric', loaderVersion: '0.15.11' });
    assert.strictEqual(profile.id, 'test-profili');
    for (const d of ['mods', 'config', 'screenshots', 'resourcepacks', 'shaderpacks']) {
      assert.ok(fs.existsSync(path.join(tmpRoot, 'instances', profile.id, d)), d + ' yok');
    }
  });

  await test('Aynı isimde ikinci profil çakışmaz', () => {
    const p2 = profiles.create({ name: 'Test Profili', mcVersion: '1.20.1', loader: 'fabric', loaderVersion: '0.15.11' });
    assert.strictEqual(p2.id, 'test-profili-2');
    profiles.remove(p2.id, true);
  });

  await test('Uyumluluk kontrolü sürüm ve loader’a bakar', () => {
    const p = profiles.require(profile.id);
    assert.strictEqual(profiles.compatibility(p, { gameVersions: ['1.20.1'], loaders: ['fabric'] }, 'mod').ok, true);
    const bad1 = profiles.compatibility(p, { gameVersions: ['1.19.2'], loaders: ['fabric'] }, 'mod');
    assert.strictEqual(bad1.ok, false);
    assert.match(bad1.reason, /1\.20\.1/);
    const bad2 = profiles.compatibility(p, { gameVersions: ['1.20.1'], loaders: ['forge'] }, 'mod');
    assert.strictEqual(bad2.ok, false);
    // quilt fabric modlarını kabul eder
    const q = { ...p, loader: 'quilt' };
    assert.strictEqual(profiles.compatibility(q, { gameVersions: ['1.20.1'], loaders: ['fabric'] }, 'mod').ok, true);
    // vanilla profile mod kurulamaz
    const v = { ...p, loader: 'vanilla' };
    assert.strictEqual(profiles.compatibility(v, { gameVersions: ['1.20.1'], loaders: [] }, 'mod').ok, false);
    // kaynak paketi loader’a bakmaz
    assert.strictEqual(profiles.compatibility(v, { gameVersions: ['1.20.1'], loaders: [] }, 'resourcepack').ok, true);
  });

  // ---------------------------------------------------------- içerik ve export/import
  await test('İçerik aç/kapa dosyayı .disabled yapar', () => {
    const p = profiles.require(profile.id);
    const modFile = path.join(tmpRoot, 'instances', p.id, 'mods', 'ornek-mod.jar');
    fs.writeFileSync(modFile, 'JAR');
    p.content.push({
      uid: 'abc123',
      source: 'modrinth',
      type: 'mod',
      projectId: 'AANobbMI',
      versionId: 'v1',
      name: 'Sodium',
      fileName: 'ornek-mod.jar',
      file: 'mods/ornek-mod.jar',
      versionNumber: '0.5.3',
      size: 3,
      sha1: '0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a',
      url: 'https://cdn.modrinth.com/data/AANobbMI/versions/x/sodium.jar',
      disabled: false,
    });
    profiles.toggleContent(p.id, 'abc123');
    assert.ok(fs.existsSync(modFile + '.disabled'), 'devre dışı dosya yok');
    profiles.toggleContent(p.id, 'abc123');
    assert.ok(fs.existsSync(modFile), 'geri açılmadı');
  });

  await test('Profil .mrpack olarak dışa aktarılır', () => {
    const p = profiles.require(profile.id);
    fs.mkdirSync(path.join(tmpRoot, 'instances', p.id, 'config'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'instances', p.id, 'config', 'sodium.json'), '{"fps":true}');
    const dest = path.join(tmpRoot, 'disa.mrpack');
    const res = profiles.exportPack(p.id, { destFile: dest, includeConfigs: true });
    assert.ok(fs.existsSync(dest), 'mrpack yazılmadı');
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(dest);
    const index = JSON.parse(zip.getEntry('modrinth.index.json').getData().toString());
    assert.strictEqual(index.formatVersion, 1);
    assert.strictEqual(index.name, 'Test Profili');
    assert.strictEqual(index.dependencies.minecraft, '1.20.1');
    assert.strictEqual(index.dependencies['fabric-loader'], '0.15.11');
    assert.strictEqual(index.files.length, 1);
    assert.strictEqual(index.files[0].path, 'mods/ornek-mod.jar');
    assert.ok(zip.getEntry('parrotmodl.json'), 'parrotmodl.json yok');
    assert.ok(
      zip.getEntries().some((e) => e.entryName.includes('overrides/config/sodium.json')),
      'config override yok: ' + zip.getEntries().map((e) => e.entryName).join(',')
    );
  });

  await test('.mrpack içe aktarılır (indirilemeyen dosya testi atlar)', async () => {
    const dest = path.join(tmpRoot, 'import-test.mrpack');
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addFile(
      'modrinth.index.json',
      Buffer.from(
        JSON.stringify({
          formatVersion: 1,
          game: 'minecraft',
          versionId: '2.0.0',
          name: 'Aktarılan Paket',
          files: [],
          dependencies: { minecraft: '1.20.1', 'forge': '47.2.20' },
        })
      )
    );
    zip.addFile('overrides/config/ayar.txt', Buffer.from('merhaba'));
    zip.addFile('overrides/options.txt', Buffer.from('fov:80'));
    zip.writeZip(dest);

    const imported = await profiles.importPack(dest, {});
    assert.strictEqual(imported.name, 'Aktarılan Paket');
    assert.strictEqual(imported.mcVersion, '1.20.1');
    assert.strictEqual(imported.loader, 'forge');
    assert.strictEqual(imported.loaderVersion, '1.20.1-47.2.20');
    const cfg = path.join(tmpRoot, 'instances', imported.id, 'config', 'ayar.txt');
    assert.ok(fs.existsSync(cfg), 'override kopyalanmadı');
    assert.strictEqual(fs.readFileSync(cfg, 'utf8'), 'merhaba');
    assert.ok(fs.existsSync(path.join(tmpRoot, 'instances', imported.id, 'options.txt')));
  });

  await test('CurseForge paketi manifest’ten okunur', async () => {
    const AdmZip = require('adm-zip');
    const dest = path.join(tmpRoot, 'cf-test.zip');
    const zip = new AdmZip();
    zip.addFile(
      'manifest.json',
      Buffer.from(
        JSON.stringify({
          minecraft: { version: '1.19.2', modLoaders: [{ id: 'fabric-0.14.21', primary: true }] },
          name: 'CF Paketi',
          version: '1.2',
          author: 'birisi',
          files: [],
          overrides: 'overrides',
        })
      )
    );
    zip.addFile('overrides/config/x.cfg', Buffer.from('a=1'));
    zip.writeZip(dest);
    const p = await profiles.importPack(dest, {});
    assert.strictEqual(p.mcVersion, '1.19.2');
    assert.strictEqual(p.loader, 'fabric');
    assert.strictEqual(p.loaderVersion, '0.14.21');
    assert.ok(fs.existsSync(path.join(tmpRoot, 'instances', p.id, 'config', 'x.cfg')));
  });

  await test('Zip-slip saldırısı engellenir', async () => {
    const AdmZip = require('adm-zip');
    const dest = path.join(tmpRoot, 'evil.mrpack');
    const zip = new AdmZip();
    zip.addFile(
      'modrinth.index.json',
      Buffer.from(JSON.stringify({ formatVersion: 1, name: 'Kotu', files: [], dependencies: { minecraft: '1.20.1' } }))
    );
    zip.addFile('overrides/../../../kotu.txt', Buffer.from('hack'));
    zip.writeZip(dest);
    await profiles.importPack(dest, {});
    assert.ok(!fs.existsSync(path.join(tmpRoot, '..', '..', '..', 'kotu.txt')), 'zip-slip korumasız!');
  });

  // ---------------------------------------------------------- ekran görüntüleri
  await test('Ekran görüntüleri tüm profillerden toplanır', () => {
    const p = profiles.require(profile.id);
    const dir = path.join(tmpRoot, 'instances', p.id, 'screenshots');
    fs.writeFileSync(path.join(dir, '2026-01-01_12.00.00.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(dir, 'not-an-image.txt'), 'x');
    const shots = profiles.screenshots();
    assert.ok(shots.length >= 1);
    assert.ok(shots.every((s) => /\.(png|jpe?g)$/i.test(s.file)));
    assert.strictEqual(shots[0].profileName, 'Test Profili');
  });

  // ---------------------------------------------------------- skin
  await test('Skin PNG doğrulaması boyutları kontrol eder', () => {
    const mk = (w, h) => {
      const b = Buffer.alloc(24);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
      b.writeUInt32BE(w, 16);
      b.writeUInt32BE(h, 20);
      return b;
    };
    assert.deepStrictEqual(validatePng(mk(64, 64)), { width: 64, height: 64 });
    assert.deepStrictEqual(validatePng(mk(64, 32)), { width: 64, height: 32 });
    assert.throws(() => validatePng(mk(32, 32)), /64x64/);
    assert.throws(() => validatePng(Buffer.from('not a png')), /PNG değil/);
  });

  await test('Skin kütüphaneye eklenir ve silinir', async () => {
    const png = fs.readFileSync(path.join(__dirname, 'fixtures', 'skin.png'));
    const added = await skins.add({ name: 'Deneme', variant: 'slim', dataUrl: 'data:image/png;base64,' + png.toString('base64') });
    assert.strictEqual(added.variant, 'slim');
    assert.ok(added.dataUrl.startsWith('data:image/png;base64,'));
    assert.ok(fs.existsSync(path.join(tmpRoot, 'skins', added.file)));
    skins.remove(added.id);
    assert.strictEqual(skins.list().length, 0);
  });

  // ---------------------------------------------------------- sürüm/başlatma
  await test('Maven koordinatı dosya yoluna çevrilir', () => {
    assert.strictEqual(
      mojang.mavenToPath('net.fabricmc:fabric-loader:0.15.11'),
      path.join('net', 'fabricmc', 'fabric-loader', '0.15.11', 'fabric-loader-0.15.11.jar')
    );
    assert.strictEqual(
      mojang.mavenToPath('org.lwjgl:lwjgl:3.3.3:natives-windows'),
      path.join('org', 'lwjgl', 'lwjgl', '3.3.3', 'lwjgl-3.3.3-natives-windows.jar')
    );
    assert.strictEqual(
      mojang.mavenToPath('net.minecraftforge:forge:1.20.1-47.2.20:universal@zip'),
      path.join('net', 'minecraftforge', 'forge', '1.20.1-47.2.20', 'forge-1.20.1-47.2.20-universal.zip')
    );
  });

  await test('Kural değerlendirme işletim sistemine göre çalışır', () => {
    assert.strictEqual(mojang.matchRules([{ action: 'allow' }]), true);
    assert.strictEqual(mojang.matchRules([{ action: 'allow', os: { name: 'nosuchos' } }]), false);
    assert.strictEqual(mojang.matchRules([{ action: 'allow', os: { name: mojang.OS_NAME } }]), true);
    assert.strictEqual(
      mojang.matchRules([{ action: 'allow' }, { action: 'disallow', os: { name: mojang.OS_NAME } }]),
      false
    );
    assert.strictEqual(
      mojang.matchRules([{ action: 'allow', features: { has_custom_resolution: true } }], { has_custom_resolution: true }),
      true
    );
    assert.strictEqual(
      mojang.matchRules([{ action: 'allow', features: { is_demo_user: true } }], { is_demo_user: false }),
      false
    );
  });

  await test('Sürüm JSON birleştirme (inheritsFrom) doğru çalışır', async () => {
    // sahte vanilla + fabric sürümleri diske yaz
    const vdir = path.join(tmpRoot, 'versions', 'fake-1.20.1');
    fs.mkdirSync(vdir, { recursive: true });
    fs.writeFileSync(
      path.join(vdir, 'fake-1.20.1.json'),
      JSON.stringify({
        id: 'fake-1.20.1',
        mainClass: 'net.minecraft.client.main.Main',
        assets: '5',
        type: 'release',
        libraries: [{ name: 'com.mojang:logging:1.0' }, { name: 'org.lwjgl:lwjgl:3.3.1' }],
        arguments: { game: ['--username', '${auth_player_name}'], jvm: ['-Dfoo=bar', '-cp', '${classpath}'] },
      })
    );
    const fdir = path.join(tmpRoot, 'versions', 'fake-fabric');
    fs.mkdirSync(fdir, { recursive: true });
    fs.writeFileSync(
      path.join(fdir, 'fake-fabric.json'),
      JSON.stringify({
        id: 'fake-fabric',
        inheritsFrom: 'fake-1.20.1',
        mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
        libraries: [{ name: 'net.fabricmc:fabric-loader:0.15.11', url: 'https://maven.fabricmc.net/' }, { name: 'org.lwjgl:lwjgl:3.3.1' }],
        arguments: { jvm: ['-DfabricLoader=true'] },
      })
    );

    const loaders = require(path.join(src, 'game', 'loaders'));
    const merged = await mojang.resolveVersionJson('fake-fabric', (id) => loaders.readLocalVersion(id));
    assert.strictEqual(merged.mainClass, 'net.fabricmc.loader.impl.launch.knot.KnotClient', 'child mainClass kazanmalı');
    assert.strictEqual(merged.assets, '5', 'parent alanı miras alınmalı');
    // lwjgl iki kez geçiyor -> tek kalmalı, fabric-loader eklenmiş olmalı
    const names = merged.libraries.map((l) => l.name);
    assert.strictEqual(names.filter((n) => n.startsWith('org.lwjgl:lwjgl')).length, 1, 'kütüphane tekrarı silinmedi');
    assert.ok(names.includes('net.fabricmc:fabric-loader:0.15.11'));
    assert.ok(merged.arguments.jvm.includes('-DfabricLoader=true'));
    assert.ok(merged.arguments.jvm.includes('-cp'));
    return merged;
  });

  await test('Başlatma komutu doğru üretilir', async () => {
    const loaders = require(path.join(src, 'game', 'loaders'));
    const version = await mojang.resolveVersionJson('fake-fabric', (id) => loaders.readLocalVersion(id));
    const p = profiles.require(profile.id);
    const clientJar = path.join(tmpRoot, 'versions', '1.20.1', '1.20.1.jar');
    fs.mkdirSync(path.dirname(clientJar), { recursive: true });
    fs.writeFileSync(clientJar, 'JAR');
    const libFile = path.join(tmpRoot, 'libraries', 'fake.jar');
    fs.mkdirSync(path.dirname(libFile), { recursive: true });
    fs.writeFileSync(libFile, 'LIB');

    const prepared = {
      java: { path: '/usr/bin/java', major: 17 },
      version,
      versionId: 'fake-fabric',
      clientJar,
      classpath: [libFile],
      nativesDir: path.join(tmpRoot, 'natives'),
      assetIndexId: '5',
      legacyAssets: false,
    };
    const account = { name: 'TestOyuncu', uuid: '11111111-2222-3333-4444-555555555555', accessToken: 'TOKEN', type: 'offline' };
    const settings = { memoryMb: 4096, jvmArgs: '-XX:+UseG1GC', width: 1280, height: 720, showConsole: true };
    const cmd = installer.buildCommand(prepared, p, account, settings);

    const s = cmd.args.join(' ');
    assert.ok(cmd.args.includes('net.fabricmc.loader.impl.launch.knot.KnotClient'), 'mainClass yok');
    assert.ok(s.includes('--username TestOyuncu'), 'oyuncu adı yerleştirilmedi: ' + s);
    assert.ok(s.includes('-Xmx4096M'), 'bellek ayarı yok');
    assert.ok(s.includes('-XX:+UseG1GC'), 'kullanıcı JVM argümanı yok');
    assert.ok(s.includes('-DfabricLoader=true'), 'loader JVM argümanı yok');
    assert.ok(cmd.args.includes('-cp'), 'classpath bayrağı yok');
    const cpIndex = cmd.args.indexOf('-cp');
    const cp = cmd.args[cpIndex + 1];
    assert.ok(cp.includes(clientJar), 'client jar classpath’te yok');
    assert.ok(cp.includes(libFile), 'kütüphane classpath’te yok');
    assert.ok(s.includes('--width 1280'), 'çözünürlük yok');
    assert.strictEqual(cmd.cwd, path.join(tmpRoot, 'instances', p.id));
    // ${...} yer tutucusu kalmamalı
    assert.ok(!/\$\{(auth_player_name|classpath|natives_directory|version_name)\}/.test(s), 'yer tutucu kalmış: ' + s);
  });

  await test('Eski (legacy) minecraftArguments biçimi desteklenir', () => {
    const version = {
      id: 'legacy',
      mainClass: 'net.minecraft.client.Minecraft',
      minecraftArguments: '--username ${auth_player_name} --session ${auth_session} --gameDir ${game_directory}',
      libraries: [],
      type: 'release',
    };
    const p = profiles.require(profile.id);
    const prepared = {
      java: { path: '/usr/bin/java', major: 8 },
      version,
      versionId: 'legacy',
      clientJar: path.join(tmpRoot, 'versions', '1.20.1', '1.20.1.jar'),
      classpath: [],
      nativesDir: path.join(tmpRoot, 'natives'),
      assetIndexId: 'legacy',
      legacyAssets: true,
    };
    const cmd = installer.buildCommand(
      prepared,
      p,
      { name: 'Eski', uuid: 'abcd', accessToken: '0', type: 'offline' },
      { memoryMb: 2048, jvmArgs: '' }
    );
    const s = cmd.args.join(' ');
    assert.ok(s.includes('--username Eski'));
    assert.ok(s.includes('token:0:abcd'));
    assert.ok(!s.includes('${'), 'yer tutucu kalmış: ' + s);
  });

  await test('Kütüphane planlama indirme listesi ve classpath üretir', () => {
    const version = {
      libraries: [
        {
          name: 'com.example:lib:1.0',
          downloads: { artifact: { path: 'com/example/lib/1.0/lib-1.0.jar', url: 'https://example/lib.jar', sha1: 'abc', size: 10 } },
        },
        { name: 'only.name:dep:2.0', url: 'https://maven.example/' },
        {
          name: 'disallowed:lib:1.0',
          rules: [{ action: 'disallow', os: { name: mojang.OS_NAME } }],
          downloads: { artifact: { path: 'x/y.jar', url: 'https://example/x.jar' } },
        },
      ],
    };
    const plan = mojang.planLibraries(version);
    const urls = plan.downloads.map((d) => d.url);
    assert.ok(urls.includes('https://example/lib.jar'));
    assert.ok(urls.some((u) => u === 'https://maven.example/only/name/dep/2.0/dep-2.0.jar'), urls.join(','));
    assert.ok(!urls.includes('https://example/x.jar'), 'engellenen kütüphane eklendi');
    assert.strictEqual(plan.classpath.length, 2);
  });

  await test('Java sürüm gereksinimi sürüm JSON’undan okunur', () => {
    const javaMgr = require(path.join(src, 'game', 'java'));
    assert.strictEqual(javaMgr.requiredMajor({ javaVersion: { majorVersion: 21 } }), 21);
    assert.strictEqual(javaMgr.requiredMajor({}), 8);
  });

  await test('Modrinth arama sorgusu doğru kurulur', () => {
    // sorgu kurucuyu ağ olmadan doğrulamak için getJson’u geçici olarak değiştiriyoruz
    const net = require(path.join(src, 'net'));
    const modrinth = require(path.join(src, 'api', 'modrinth'));
    const orig = net.getJson;
    let captured = null;
    net.getJson = async (url) => {
      captured = url;
      return { total_hits: 0, offset: 0, hits: [] };
    };
    return modrinth
      .search({ query: 'sodium', type: 'mod', loader: 'fabric', gameVersion: '1.20.1', limit: 20 })
      .then(() => {
        net.getJson = orig;
        const decoded = decodeURIComponent(captured);
        assert.ok(decoded.includes('query=sodium'), captured);
        assert.ok(decoded.includes('"project_type:mod"'), decoded);
        assert.ok(decoded.includes('"categories:fabric"'), decoded);
        assert.ok(decoded.includes('"versions:1.20.1"'), decoded);
      })
      .catch((e) => {
        net.getJson = orig;
        throw e;
      });
  });

  await test('CurseForge sorgusu classId ve loader tipini gönderir', () => {
    const net = require(path.join(src, 'net'));
    const cf = require(path.join(src, 'api', 'curseforge'));
    const orig = net.getJson;
    let captured = null;
    net.getJson = async (url) => {
      captured = url;
      return { pagination: { totalCount: 0 }, data: [] };
    };
    return cf
      .search({ query: 'jei', type: 'mod', loader: 'forge', gameVersion: '1.20.1' })
      .then(() => {
        net.getJson = orig;
        assert.ok(captured.includes('gameId=432'), captured);
        assert.ok(captured.includes('classId=6'), captured);
        assert.ok(captured.includes('modLoaderType=1'), captured);
        assert.ok(captured.includes('gameVersion=1.20.1'), captured);
      })
      .catch((e) => {
        net.getJson = orig;
        throw e;
      });
  });

  await test('Bağımlılık çözümleyici zincirleme çalışır ve döngüye girmez', async () => {
    const content = require(path.join(src, 'api', 'content'));
    const modrinth = require(path.join(src, 'api', 'modrinth'));
    const origBest = modrinth.bestVersion;
    const origProj = modrinth.getProject;
    const graph = {
      A: { id: 'vA', projectId: 'A', file: { url: 'u/a', name: 'a.jar' }, dependencies: [{ projectId: 'B', type: 'required' }] },
      B: { id: 'vB', projectId: 'B', file: { url: 'u/b', name: 'b.jar' }, dependencies: [{ projectId: 'C', type: 'required' }, { projectId: 'D', type: 'optional' }] },
      C: { id: 'vC', projectId: 'C', file: { url: 'u/c', name: 'c.jar' }, dependencies: [{ projectId: 'A', type: 'required' }] },
      D: { id: 'vD', projectId: 'D', file: { url: 'u/d', name: 'd.jar' }, dependencies: [] },
    };
    modrinth.bestVersion = async (id) => graph[id] || null;
    modrinth.getProject = async (id) => ({ id, title: 'Proje ' + id });
    try {
      const res = await content.resolveWithDependencies('modrinth', graph.A, { loader: 'fabric', gameVersion: '1.20.1' });
      const ids = res.deps.map((d) => d.version.projectId).sort();
      assert.deepStrictEqual(ids, ['B', 'C'], 'zorunlu bağımlılıklar yanlış: ' + ids.join(','));
      assert.strictEqual(res.missing.length, 0);
    } finally {
      modrinth.bestVersion = origBest;
      modrinth.getProject = origProj;
    }
  });

  await test('Bulunamayan bağımlılık raporlanır', async () => {
    const content = require(path.join(src, 'api', 'content'));
    const modrinth = require(path.join(src, 'api', 'modrinth'));
    const origBest = modrinth.bestVersion;
    modrinth.bestVersion = async () => null;
    try {
      const root = { id: 'v1', projectId: 'X', file: { url: 'u', name: 'x.jar' }, dependencies: [{ projectId: 'Y', type: 'required' }] };
      const res = await content.resolveWithDependencies('modrinth', root, {});
      assert.strictEqual(res.deps.length, 0);
      assert.strictEqual(res.missing.length, 1);
      assert.strictEqual(res.missing[0].projectId, 'Y');
    } finally {
      modrinth.bestVersion = origBest;
    }
  });

  await test('Profil silinince klasörü de gider', async () => {
    const p = profiles.create({ name: 'Silinecek', mcVersion: '1.20.1', loader: 'vanilla' });
    const dir = path.join(tmpRoot, 'instances', p.id);
    assert.ok(fs.existsSync(dir));
    await profiles.remove(p.id, true);
    assert.ok(!fs.existsSync(dir), 'klasör silinmedi');
    assert.ok(!profiles.get(p.id), 'profil listede kaldı');
  });

  // ---------------------------------------------------------- rapor
  const failed = results.filter((r) => !r.ok);
  console.log('\n===== ARKA UÇ TESTLERİ =====');
  for (const r of results) {
    console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + (r.ok ? '' : '\n         ' + r.error));
  }
  console.log(`\n${results.length - failed.length}/${results.length} test geçti\n`);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {}
  app.exit(failed.length ? 1 : 0);
});
