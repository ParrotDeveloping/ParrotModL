'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');

let rootDir = null;

function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function defaultRoot() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '.parrotmodl');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'parrotmodl');
  }
  return path.join(os.homedir(), '.parrotmodl');
}

/** Called once at startup (after settings are loaded) */
function setRoot(dir) {
  rootDir = dir && dir.trim() ? dir : defaultRoot();
  ensure(rootDir);
  return rootDir;
}

function root() {
  if (!rootDir) rootDir = ensure(defaultRoot());
  return rootDir;
}

const P = {
  ensure,
  defaultRoot,
  setRoot,
  root,
  /** launcher config (never moves with data dir) */
  configDir: () => ensure(app.getPath('userData')),
  configFile: (name) => path.join(ensure(app.getPath('userData')), name),

  instances: () => ensure(path.join(root(), 'instances')),
  instance: (id) => ensure(path.join(root(), 'instances', id)),
  /**
   * Sürümler, kütüphaneler ve assets resmi launcher ile aynı düzende tutulur.
   * Forge/NeoForge kurulum dosyaları tam olarak bu düzeni beklediği için şart.
   */
  meta: () => ensure(path.join(root(), 'meta')),
  versions: () => ensure(path.join(root(), 'versions')),
  versionDir: (id) => ensure(path.join(root(), 'versions', id)),
  libraries: () => ensure(path.join(root(), 'libraries')),
  assets: () => ensure(path.join(root(), 'assets')),
  assetIndexes: () => ensure(path.join(root(), 'assets', 'indexes')),
  assetObjects: () => ensure(path.join(root(), 'assets', 'objects')),
  natives: (id) => ensure(path.join(root(), 'natives', id)),
  java: () => ensure(path.join(root(), 'java')),
  skins: () => ensure(path.join(root(), 'skins')),
  icons: () => ensure(path.join(root(), 'icons')),
  cache: () => ensure(path.join(root(), 'cache')),
  temp: () => ensure(path.join(root(), 'temp')),
  logs: () => ensure(path.join(root(), 'logs')),
};

module.exports = P;
