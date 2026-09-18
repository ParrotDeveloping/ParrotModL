'use strict';
/** Spawns the game and tracks running instances. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const P = require('../paths');
const installer = require('./installer');

const running = new Map(); // profileId -> { child, startedAt, logFile }

function isRunning(profileId) {
  return running.has(profileId);
}

function listRunning() {
  return [...running.keys()];
}

/**
 * @param {(evt:{type:string,[k:string]:any})=>void} emit
 */
async function launch({ profile, account, settings }, emit) {
  if (running.has(profile.id)) throw new Error('Bu profil zaten çalışıyor.');
  if (!account) throw new Error('Önce bir hesap ekleyin.');

  emit({ type: 'status', profileId: profile.id, state: 'preparing', stage: 'Başlatılıyor', percent: 0 });

  const prepared = await installer.prepare(profile, settings, (p) => {
    emit({ type: 'status', profileId: profile.id, state: 'preparing', ...p });
  });

  const cmd = installer.buildCommand(prepared, profile, account, settings);

  const logFile = path.join(P.logs(), `${profile.id}-${Date.now()}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.write(`# ParrotModL\n# ${cmd.javaPath}\n# ${cmd.args.join(' ')}\n\n`);

  emit({ type: 'status', profileId: profile.id, state: 'launching', stage: 'Oyun açılıyor', percent: 100 });

  const child = spawn(cmd.javaPath, cmd.args, {
    cwd: cmd.cwd,
    windowsHide: true,
    detached: false,
    env: Object.assign({}, process.env),
  });

  const entry = { child, startedAt: Date.now(), logFile, crashed: false };
  running.set(profile.id, entry);

  let sawWindow = false;
  const onLine = (line) => {
    logStream.write(line + '\n');
    emit({ type: 'log', profileId: profile.id, line: line.slice(0, 2000) });
    if (!sawWindow && /(Setting user:|LWJGL Version|Created:|OpenAL initialized|Backend library)/i.test(line)) {
      sawWindow = true;
      emit({ type: 'status', profileId: profile.id, state: 'running', stage: 'Oyun çalışıyor', percent: 100 });
    }
  };

  attachLines(child.stdout, onLine);
  attachLines(child.stderr, onLine);

  child.on('error', (e) => {
    emit({ type: 'status', profileId: profile.id, state: 'error', stage: e.message, percent: 0 });
    running.delete(profile.id);
    logStream.end();
  });

  child.on('close', (code) => {
    running.delete(profile.id);
    logStream.end();
    emit({
      type: 'exit',
      profileId: profile.id,
      code,
      logFile,
      state: code === 0 ? 'exited' : 'crashed',
    });
  });

  // Fallback: treat as running after a few seconds even without log markers
  setTimeout(() => {
    if (running.has(profile.id) && !sawWindow) {
      emit({ type: 'status', profileId: profile.id, state: 'running', stage: 'Oyun çalışıyor', percent: 100 });
    }
  }, 6000);

  return { pid: child.pid, logFile };
}

function attachLines(stream, cb) {
  if (!stream) return;
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      cb(buf.slice(0, i).replace(/\r$/, ''));
      buf = buf.slice(i + 1);
    }
    if (buf.length > 16384) {
      cb(buf);
      buf = '';
    }
  });
}

function stop(profileId) {
  const entry = running.get(profileId);
  if (!entry) return false;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(entry.child.pid), '/f', '/t'], { windowsHide: true });
    } else {
      entry.child.kill('SIGTERM');
    }
  } catch {}
  return true;
}

module.exports = { launch, stop, isRunning, listRunning };
