'use strict';
/** Downloads everything a profile needs, then builds the launch command. */
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const AdmZip = require('adm-zip');
const net = require('../net');
const P = require('../paths');
const mojang = require('./mojang');
const loaders = require('./loaders');
const javaMgr = require('./java');

/**
 * Prepare a profile for launching.
 * @param {object} profile
 * @param {object} settings
 * @param {(p:{stage:string,percent:number,detail?:string})=>void} onProgress
 */
async function prepare(profile, settings, onProgress = () => {}) {
  const report = (stage, percent, detail) => onProgress({ stage, percent: Math.max(0, Math.min(100, percent)), detail });

  report('Sürüm bilgileri alınıyor', 2);
  const vanillaJson = await mojang.getVersionJson(profile.mcVersion);
  const neededJava = javaMgr.requiredMajor(vanillaJson);

  report('Java hazırlanıyor', 5);
  const java = await javaMgr.ensure(
    neededJava,
    { manualPath: settings.javaPath, autoDownload: settings.autoJava !== false },
    (p) => report(p.stage, 5 + (p.percent || 0) * 0.08)
  );

  // 1) loader install
  let versionIdToLaunch = profile.mcVersion;
  if (profile.loader && profile.loader !== 'vanilla') {
    report(`${profile.loader} kuruluyor`, 14);
    versionIdToLaunch = await loaders.installLoader(
      {
        loader: profile.loader,
        mcVersion: profile.mcVersion,
        loaderVersion: profile.loaderVersion,
        javaPath: java.path,
      },
      (msg) => report(`${profile.loader}: ${msg}`, 16)
    );
  }

  // 2) resolve merged version json
  report('Sürüm dosyaları çözümleniyor', 22);
  const version = await mojang.resolveVersionJson(versionIdToLaunch, (id) => loaders.readLocalVersion(id));

  // 3) client jar
  const clientJar = path.join(P.versionDir(profile.mcVersion), `${profile.mcVersion}.jar`);
  const clientInfo = (vanillaJson.downloads && vanillaJson.downloads.client) || null;

  // 4) libraries + assets plan
  report('İndirilecekler hesaplanıyor', 26);
  const libPlan = mojang.planLibraries(version);
  const assetPlan = await mojang.planAssets(version);

  const all = [];
  if (clientInfo) all.push({ url: clientInfo.url, dest: clientJar, sha1: clientInfo.sha1, size: clientInfo.size });
  all.push(...libPlan.downloads);
  all.push(...assetPlan.downloads);

  const totalBytes = all.reduce((s, d) => s + (d.size || 0), 0) || 1;
  let done = 0;
  let lastReport = 0;
  const concurrency = Math.max(2, Math.min(16, settings.downloadConcurrency || 8));

  report('Dosyalar indiriliyor', 30);
  const tasks = all.map((d) => async () => {
    try {
      await net.download(d, (n) => {
        done += n;
        const now = Date.now();
        if (now - lastReport > 120) {
          lastReport = now;
          report(
            'Dosyalar indiriliyor',
            30 + (done / totalBytes) * 55,
            `${(done / 1048576).toFixed(1)} MB / ${(totalBytes / 1048576).toFixed(1)} MB`
          );
        }
      });
    } catch (e) {
      if (!d.optional) throw new Error(`İndirilemedi: ${path.basename(d.dest)}\n${e.message}`);
    }
  });
  await net.pool(tasks, concurrency);

  // 5) natives
  report('Native kütüphaneler açılıyor', 88);
  const nativesDir = P.natives(versionIdToLaunch);
  await extractNatives(libPlan.natives, nativesDir);

  // 6) legacy assets (virtual resources)
  if (assetPlan.legacy && assetPlan.index) {
    report('Eski sürüm kaynakları hazırlanıyor', 92);
    await materializeLegacyAssets(assetPlan, profile);
  }

  report('Hazır', 100);
  return {
    java,
    version,
    versionId: versionIdToLaunch,
    clientJar,
    classpath: libPlan.classpath,
    nativesDir,
    assetIndexId: assetPlan.indexId || version.assets || 'legacy',
    legacyAssets: assetPlan.legacy,
  };
}

async function extractNatives(natives, dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const n of natives) {
    if (!fs.existsSync(n.file)) continue;
    let zip;
    try {
      zip = new AdmZip(n.file);
    } catch {
      continue;
    }
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      if (name.startsWith('META-INF/')) continue;
      if ((n.exclude || []).some((ex) => name.startsWith(ex))) continue;
      if (!/\.(dll|so|dylib|jnilib)$/i.test(name)) continue;
      const out = path.join(dir, path.basename(name));
      try {
        if (!fs.existsSync(out) || fs.statSync(out).size !== entry.header.size) {
          fs.writeFileSync(out, entry.getData());
        }
      } catch {}
    }
  }
}

async function materializeLegacyAssets(assetPlan, profile) {
  const virtualDir = path.join(P.assets(), 'virtual', 'legacy');
  for (const [name, obj] of Object.entries(assetPlan.index.objects || {})) {
    const src = path.join(P.assetObjects(), obj.hash.slice(0, 2), obj.hash);
    const dst = path.join(virtualDir, name);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dst)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    try {
      fs.copyFileSync(src, dst);
    } catch {}
  }
  if (assetPlan.index.map_to_resources) {
    const res = path.join(P.instance(profile.id), 'resources');
    fs.mkdirSync(res, { recursive: true });
  }
}

/** Build the full java command line. */
function buildCommand(prepared, profile, account, settings) {
  const { version, clientJar, classpath, nativesDir, assetIndexId, legacyAssets } = prepared;
  const gameDir = P.instance(profile.id);
  fs.mkdirSync(gameDir, { recursive: true });

  const cp = [...classpath, clientJar].filter((f, i, a) => a.indexOf(f) === i && fs.existsSync(f));
  const sep = process.platform === 'win32' ? ';' : ':';

  const memory = profile.memoryMb || settings.memoryMb || 4096;
  const width = profile.width || settings.width || 1280;
  const height = profile.height || settings.height || 720;

  const assetsDir = legacyAssets ? path.join(P.assets(), 'virtual', 'legacy') : P.assets();

  const vars = {
    auth_player_name: account.name,
    auth_uuid: (account.uuid || '').replace(/-/g, ''),
    auth_access_token: account.accessToken || '0',
    auth_session: 'token:' + (account.accessToken || '0') + ':' + (account.uuid || '').replace(/-/g, ''),
    auth_xuid: account.xuid || '',
    user_type: account.type === 'microsoft' ? 'msa' : 'legacy',
    clientid: account.clientId || 'ParrotModL',
    version_name: prepared.versionId,
    version_type: profile.loader && profile.loader !== 'vanilla' ? 'ParrotModL' : version.type || 'release',
    game_directory: gameDir,
    assets_root: P.assets(),
    game_assets: assetsDir,
    assets_index_name: assetIndexId,
    natives_directory: nativesDir,
    launcher_name: 'ParrotModL',
    launcher_version: '1.0.0',
    classpath: cp.join(sep),
    classpath_separator: sep,
    library_directory: P.libraries(),
    user_properties: '{}',
    resolution_width: String(width),
    resolution_height: String(height),
  };

  const subst = (s) =>
    String(s).replace(/\$\{([a-zA-Z0-9_]+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

  const features = { has_custom_resolution: true, is_demo_user: false };

  const jvmArgs = [];
  const gameArgs = [];

  if (version.arguments) {
    for (const a of version.arguments.jvm || []) collectArg(a, jvmArgs, features);
    for (const a of version.arguments.game || []) collectArg(a, gameArgs, features);
  } else {
    jvmArgs.push('-Djava.library.path=${natives_directory}', '-cp', '${classpath}');
    for (const a of String(version.minecraftArguments || '').split(/\s+/).filter(Boolean)) gameArgs.push(a);
  }

  const userJvm = [];
  if (process.platform === 'win32') {
    userJvm.push('-Dos.name=Windows 10', '-Dos.version=10.0');
  }
  userJvm.push(`-Xmx${memory}M`, `-Xms${Math.min(1024, memory)}M`);
  userJvm.push('-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8');
  userJvm.push('-Djava.rmi.server.useCodebaseOnly=true');
  userJvm.push('-Dminecraft.launcher.brand=ParrotModL', '-Dminecraft.launcher.version=1.0.0');
  const extra = (profile.jvmArgs !== undefined && profile.jvmArgs !== null && profile.jvmArgs !== ''
    ? profile.jvmArgs
    : settings.jvmArgs || ''
  )
    .split(/\s+/)
    .filter(Boolean);
  userJvm.push(...extra);

  const finalJvm = jvmArgs.map(subst).concat(userJvm);
  if (!finalJvm.some((a) => a === '-cp' || a === '-classpath')) {
    finalJvm.push('-cp', vars.classpath);
  }

  const finalGame = gameArgs.map(subst);
  if (!finalGame.includes('--width') && (profile.fullscreen ?? settings.fullscreen) !== true) {
    finalGame.push('--width', String(width), '--height', String(height));
  }
  if ((profile.fullscreen ?? settings.fullscreen) === true && !finalGame.includes('--fullscreen')) {
    finalGame.push('--fullscreen');
  }
  if (profile.quickPlayServer) {
    finalGame.push('--quickPlayMultiplayer', profile.quickPlayServer);
  }

  const mainClass = version.mainClass || 'net.minecraft.client.main.Main';
  return {
    javaPath: settings.showConsole ? prepared.java.path : javaMgr.windowless(prepared.java.path),
    args: [...finalJvm, mainClass, ...finalGame],
    cwd: gameDir,
  };

  function collectArg(a, out, feats) {
    if (typeof a === 'string') return out.push(a);
    if (!a || !a.value) return;
    if (!mojang.matchRules(a.rules, feats)) return;
    if (Array.isArray(a.value)) out.push(...a.value);
    else out.push(a.value);
  }
}

module.exports = { prepare, buildCommand };
