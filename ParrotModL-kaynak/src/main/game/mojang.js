'use strict';
/** Vanilla Minecraft metadata + asset/library installation. */
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const net = require('../net');
const P = require('../paths');

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const RESOURCES = 'https://resources.download.minecraft.net';

let manifestCache = null;
let manifestTime = 0;

async function getManifest(force = false) {
  if (!force && manifestCache && Date.now() - manifestTime < 10 * 60 * 1000) return manifestCache;
  manifestCache = await net.getJson(MANIFEST);
  manifestTime = Date.now();
  try {
    fs.writeFileSync(path.join(P.cache(), 'version_manifest.json'), JSON.stringify(manifestCache));
  } catch {}
  return manifestCache;
}

async function listVersions({ snapshots = false } = {}) {
  let m;
  try {
    m = await getManifest();
  } catch (e) {
    const cached = path.join(P.cache(), 'version_manifest.json');
    if (fs.existsSync(cached)) m = JSON.parse(fs.readFileSync(cached, 'utf8'));
    else throw e;
  }
  return m.versions
    .filter((v) => (snapshots ? true : v.type === 'release'))
    .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime, url: v.url, sha1: v.sha1 }));
}

async function latest() {
  const m = await getManifest();
  return m.latest;
}

/** Fetch (and cache) the version json for a vanilla version id. */
async function getVersionJson(id) {
  const dir = P.versionDir(id);
  const file = path.join(dir, `${id}.json`);
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(await fsp.readFile(file, 'utf8'));
    } catch {}
  }
  const m = await getManifest();
  const entry = m.versions.find((v) => v.id === id);
  if (!entry) throw new Error(`Minecraft sürümü bulunamadı: ${id}`);
  const json = await net.getJson(entry.url);
  await fsp.writeFile(file, JSON.stringify(json, null, 2));
  return json;
}

/** Merge a modded version json with its inheritsFrom parent chain. */
async function resolveVersionJson(id, loadLocal) {
  const chain = [];
  let cur = id;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    let json = await loadLocal(cur);
    if (!json) json = await getVersionJson(cur);
    chain.push(json);
    cur = json.inheritsFrom;
  }
  // merge child -> parent (child wins for scalars, libraries concatenated child-first)
  const merged = {};
  const libs = [];
  for (const j of chain) {
    for (const [k, v] of Object.entries(j)) {
      if (k === 'libraries') continue;
      if (k === 'arguments') {
        merged.arguments = merged.arguments || { game: [], jvm: [] };
        merged.arguments.game = (merged.arguments.game || []).concat(v.game || []);
        merged.arguments.jvm = (merged.arguments.jvm || []).concat(v.jvm || []);
        continue;
      }
      if (merged[k] === undefined) merged[k] = v;
    }
    libs.push(...(j.libraries || []));
  }
  merged.libraries = dedupeLibraries(libs);
  merged.id = id;
  return merged;
}

function libKey(name) {
  const parts = String(name).split(':');
  return parts.slice(0, 2).join(':') + (parts[3] ? ':' + parts[3] : '');
}

function dedupeLibraries(libs) {
  const out = [];
  const seen = new Set();
  for (const l of libs) {
    if (!l || !l.name) continue;
    const k = libKey(l.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

const OS_NAME = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
const OS_ARCH = process.arch === 'x64' ? 'x86_64' : process.arch === 'ia32' ? 'x86' : process.arch;

function matchRules(rules, features = {}) {
  if (!rules || !rules.length) return true;
  let allow = false;
  for (const rule of rules) {
    let ok = true;
    if (rule.os) {
      if (rule.os.name && rule.os.name !== OS_NAME) ok = false;
      if (rule.os.arch) {
        const a = rule.os.arch;
        if (a === 'x86' && process.arch !== 'ia32') ok = false;
        if (a === 'x86_64' && process.arch !== 'x64') ok = false;
        if (a === 'arm64' && process.arch !== 'arm64') ok = false;
      }
      if (rule.os.version) {
        try {
          if (!new RegExp(rule.os.version).test(require('os').release())) ok = false;
        } catch {}
      }
    }
    if (rule.features) {
      for (const [k, v] of Object.entries(rule.features)) {
        if (!!features[k] !== !!v) ok = false;
      }
    }
    if (ok) allow = rule.action === 'allow';
  }
  return allow;
}

function mavenToPath(name) {
  // group:artifact:version[:classifier][@ext]
  let ext = 'jar';
  let n = name;
  const at = n.indexOf('@');
  if (at >= 0) {
    ext = n.slice(at + 1);
    n = n.slice(0, at);
  }
  const parts = n.split(':');
  const [group, artifact, version] = parts;
  const classifier = parts[3];
  const file = `${artifact}-${version}${classifier ? '-' + classifier : ''}.${ext}`;
  return path.join(...group.split('.'), artifact, version, file);
}

function nativeClassifier(lib) {
  if (!lib.natives) return null;
  const tpl = lib.natives[OS_NAME];
  if (!tpl) return null;
  return tpl.replace('${arch}', process.arch === 'x64' ? '64' : '32');
}

/**
 * Build the download list for all libraries of a (resolved) version json.
 * Returns { downloads:[{url,dest,sha1,size}], classpath:[files], natives:[{file}] }
 */
function planLibraries(version) {
  const downloads = [];
  const classpath = [];
  const natives = [];
  const libRoot = P.libraries();

  for (const lib of version.libraries || []) {
    if (!matchRules(lib.rules)) continue;
    const dl = lib.downloads || {};

    // classic artifact
    if (dl.artifact) {
      const dest = path.join(libRoot, dl.artifact.path || mavenToPath(lib.name));
      if (dl.artifact.url) downloads.push({ url: dl.artifact.url, dest, sha1: dl.artifact.sha1, size: dl.artifact.size });
      if (!lib.natives) classpath.push(dest);
    } else if (!lib.natives) {
      // Forge/Fabric style: name + optional repo url
      const rel = mavenToPath(lib.name);
      const dest = path.join(libRoot, rel);
      const repo = lib.url || 'https://libraries.minecraft.net/';
      downloads.push({ url: repo.replace(/\/?$/, '/') + rel.split(path.sep).join('/'), dest, optional: !lib.url });
      classpath.push(dest);
    }

    // natives
    const cls = nativeClassifier(lib);
    if (cls) {
      const nat = (dl.classifiers && dl.classifiers[cls]) || null;
      if (nat) {
        const dest = path.join(libRoot, nat.path || mavenToPath(lib.name + ':' + cls));
        downloads.push({ url: nat.url, dest, sha1: nat.sha1, size: nat.size });
        natives.push({ file: dest, exclude: (lib.extract && lib.extract.exclude) || [] });
      }
    }
    // modern natives (1.19+ ismin sonuna ":natives-windows" ekler)
    if (!cls && /:natives-/.test(lib.name || '') && dl.artifact) {
      const tag = lib.name.split(':natives-')[1].split('-')[0];
      const wanted = { windows: 'windows', linux: 'linux', macos: 'osx', osx: 'osx' }[tag];
      if (wanted === OS_NAME) {
        natives.push({ file: path.join(libRoot, dl.artifact.path), exclude: [] });
      }
    }
  }
  return { downloads, classpath, natives };
}

/** Assets */
async function planAssets(version) {
  const idx = version.assetIndex;
  if (!idx) return { downloads: [], index: null, legacy: false };
  const indexFile = path.join(P.assetIndexes(), `${idx.id}.json`);
  await net.download({ url: idx.url, dest: indexFile, sha1: idx.sha1, size: idx.size });
  const json = JSON.parse(await fsp.readFile(indexFile, 'utf8'));
  const downloads = [];
  for (const [name, obj] of Object.entries(json.objects || {})) {
    const sub = obj.hash.slice(0, 2);
    downloads.push({
      url: `${RESOURCES}/${sub}/${obj.hash}`,
      dest: path.join(P.assetObjects(), sub, obj.hash),
      sha1: obj.hash,
      size: obj.size,
      assetName: name,
    });
  }
  return { downloads, index: json, indexId: idx.id, legacy: !!(json.map_to_resources || version.assets === 'pre-1.6') };
}

module.exports = {
  MANIFEST,
  getManifest,
  listVersions,
  latest,
  getVersionJson,
  resolveVersionJson,
  planLibraries,
  planAssets,
  matchRules,
  mavenToPath,
  OS_NAME,
  OS_ARCH,
};
