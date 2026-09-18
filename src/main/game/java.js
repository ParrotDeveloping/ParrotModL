'use strict';
/** Java detection + automatic JRE provisioning via Adoptium. */
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const { execFile } = require('child_process');
const net = require('../net');
const P = require('../paths');

const EXE = process.platform === 'win32' ? 'java.exe' : 'java';
const EXE_W = process.platform === 'win32' ? 'javaw.exe' : 'java';

function version(javaPath) {
  return new Promise((resolve) => {
    execFile(javaPath, ['-version'], { timeout: 8000, windowsHide: true }, (err, stdout, stderr) => {
      const out = String(stderr || stdout || '');
      const m = /version "(\d+)(?:\.(\d+))?[^"]*"/.exec(out);
      if (!m) return resolve(null);
      let major = parseInt(m[1], 10);
      if (major === 1 && m[2]) major = parseInt(m[2], 10);
      resolve({ path: javaPath, major, raw: out.split('\n')[0].trim() });
    });
  });
}

function candidateDirs() {
  const dirs = [];
  if (process.env.JAVA_HOME) dirs.push(path.join(process.env.JAVA_HOME, 'bin', EXE));
  if (process.platform === 'win32') {
    const roots = [
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'),
    ].filter(Boolean);
    const vendors = ['Java', 'Eclipse Adoptium', 'Eclipse Foundation', 'AdoptOpenJDK', 'Zulu', 'Microsoft', 'Amazon Corretto', 'BellSoft', 'Semeru'];
    for (const r of roots) {
      for (const v of vendors) {
        const base = path.join(r, v);
        try {
          for (const d of fs.readdirSync(base)) {
            dirs.push(path.join(base, d, 'bin', EXE));
            dirs.push(path.join(base, d, 'jre', 'bin', EXE));
          }
        } catch {}
      }
    }
    // Runtimes shipped with the official Minecraft launcher
    const officialRoots = [
      path.join(process.env.ProgramFiles || '', 'Minecraft Launcher', 'runtime'),
      path.join(process.env.LOCALAPPDATA || '', 'Packages'),
    ];
    for (const rootDir of officialRoots) {
      try {
        for (const d of fs.readdirSync(rootDir)) {
          const p1 = path.join(rootDir, d, 'windows-x64');
          try {
            for (const e of fs.readdirSync(p1)) dirs.push(path.join(p1, e, 'bin', EXE));
          } catch {}
        }
      } catch {}
    }
  } else {
    dirs.push('/usr/bin/java', '/usr/local/bin/java');
    try {
      const base = '/usr/lib/jvm';
      for (const d of fs.readdirSync(base)) dirs.push(path.join(base, d, 'bin', EXE));
    } catch {}
    if (process.platform === 'darwin') {
      try {
        const base = '/Library/Java/JavaVirtualMachines';
        for (const d of fs.readdirSync(base)) dirs.push(path.join(base, d, 'Contents', 'Home', 'bin', EXE));
      } catch {}
    }
  }
  // managed runtimes downloaded by ParrotModL
  try {
    const base = P.java();
    for (const d of fs.readdirSync(base)) {
      dirs.push(path.join(base, d, 'bin', EXE));
      try {
        for (const inner of fs.readdirSync(path.join(base, d))) {
          dirs.push(path.join(base, d, inner, 'bin', EXE));
        }
      } catch {}
    }
  } catch {}
  dirs.push(EXE); // PATH
  return [...new Set(dirs)];
}

let scanCache = null;
async function scan(force = false) {
  if (scanCache && !force) return scanCache;
  const found = [];
  const seen = new Set();
  for (const c of candidateDirs()) {
    if (c !== EXE && !fs.existsSync(c)) continue;
    const real = c === EXE ? c : path.resolve(c);
    if (seen.has(real)) continue;
    seen.add(real);
    const v = await version(real);
    if (v && v.major) found.push(v);
  }
  found.sort((a, b) => b.major - a.major);
  scanCache = found;
  return found;
}

/** Which Java major a Minecraft version needs. */
function requiredMajor(versionJson) {
  if (versionJson && versionJson.javaVersion && versionJson.javaVersion.majorVersion) {
    return versionJson.javaVersion.majorVersion;
  }
  return 8;
}

async function pick(required, manualPath) {
  if (manualPath && fs.existsSync(manualPath)) {
    const v = await version(manualPath);
    if (v) return v;
  }
  const all = await scan();
  const exact = all.find((j) => j.major === required);
  if (exact) return exact;
  const higher = all.filter((j) => j.major > required).sort((a, b) => a.major - b.major)[0];
  if (higher && required >= 17) return higher;
  if (higher && required === 8 && higher.major <= 8) return higher;
  return null;
}

const ADOPTIUM = 'https://api.adoptium.net/v3';

function osName() {
  return process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
}
function archName() {
  return process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'aarch64' : 'x32';
}

/** Download a JRE from Adoptium into <root>/java/<major>. */
async function install(major, onProgress = () => {}) {
  const extractZip = require('extract-zip');
  const dir = path.join(P.java(), `jre-${major}`);
  const existing = path.join(dir, 'bin', EXE);
  if (fs.existsSync(existing)) {
    const v = await version(existing);
    if (v) return v;
  }
  onProgress({ stage: 'Java sürümü sorgulanıyor', percent: 2 });
  const info = await net.getJson(
    `${ADOPTIUM}/assets/latest/${major}/hotspot?os=${osName()}&architecture=${archName()}&image_type=jre&vendor=eclipse`
  );
  const asset = Array.isArray(info) ? info[0] : null;
  if (!asset || !asset.binary || !asset.binary.package) throw new Error(`Java ${major} indirilemedi.`);
  const pkg = asset.binary.package;
  const archive = path.join(P.temp(), pkg.name);
  let received = 0;
  await net.download({ url: pkg.link, dest: archive, size: pkg.size, sha1: null }, (n) => {
    received += n;
    onProgress({
      stage: `Java ${major} indiriliyor`,
      percent: Math.min(85, Math.round((received / (pkg.size || 1)) * 85)),
    });
  });
  onProgress({ stage: `Java ${major} açılıyor`, percent: 90 });
  fs.mkdirSync(dir, { recursive: true });
  if (archive.endsWith('.zip')) {
    await extractZip(archive, { dir });
  } else {
    await new Promise((resolve, reject) => {
      execFile('tar', ['-xzf', archive, '-C', dir], (e) => (e ? reject(e) : resolve()));
    });
  }
  try {
    await fsp.unlink(archive);
  } catch {}
  // Adoptium archives contain a single top level folder
  let bin = path.join(dir, 'bin', EXE);
  if (!fs.existsSync(bin)) {
    for (const d of fs.readdirSync(dir)) {
      const cand = path.join(dir, d, 'bin', EXE);
      const candMac = path.join(dir, d, 'Contents', 'Home', 'bin', EXE);
      if (fs.existsSync(cand)) {
        bin = cand;
        break;
      }
      if (fs.existsSync(candMac)) {
        bin = candMac;
        break;
      }
    }
  }
  if (!fs.existsSync(bin)) throw new Error('Java arşivi açıldı ama çalıştırılabilir bulunamadı.');
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(bin, 0o755);
    } catch {}
  }
  scanCache = null;
  onProgress({ stage: `Java ${major} hazır`, percent: 100 });
  return await version(bin);
}

/** Returns a java path, downloading a runtime when allowed. */
async function ensure(required, { manualPath, autoDownload = true } = {}, onProgress = () => {}) {
  const found = await pick(required, manualPath);
  if (found) return found;
  if (!autoDownload) {
    throw new Error(
      `Java ${required} bulunamadı. Ayarlar > Java bölümünden bir yol seçin veya otomatik indirmeyi açın.`
    );
  }
  return install(required, onProgress);
}

/** javaw.exe next to java.exe (no console window on Windows) */
function windowless(javaPath) {
  if (process.platform !== 'win32') return javaPath;
  const w = path.join(path.dirname(javaPath), EXE_W);
  return fs.existsSync(w) ? w : javaPath;
}

function totalMemoryMb() {
  return Math.floor(os.totalmem() / 1024 / 1024);
}

module.exports = { scan, version, pick, install, ensure, requiredMajor, windowless, totalMemoryMb, EXE };
