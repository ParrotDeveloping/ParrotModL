'use strict';
/** Tiny JSON store with atomic writes. */
const fs = require('fs');
const path = require('path');
const P = require('./paths');

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

const DEFAULT_SETTINGS = {
  // görünüm
  accent: '#2f7bff',
  theme: 'dark', // dark | midnight | light
  bgImage: '',
  compactCards: false,
  animations: true,
  fontScale: 100,
  language: 'tr',
  // oyun
  dataDir: '',
  javaPath: '',
  memoryMb: 4096,
  jvmArgs: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:MaxGCPauseMillis=50',
  width: 1280,
  height: 720,
  fullscreen: false,
  afterLaunch: 'minimize', // minimize | close | keep
  showConsole: false,
  autoJava: true,
  // içerik
  downloadConcurrency: 8,
  curseforgeKey: '',
  defaultProvider: 'both', // modrinth | curseforge | both
  showSnapshots: false,
  // hesap
  // ParrotModL'ün kendi Azure uygulama kimliği. Gizli bir değer değildir:
  // açık istemci (public client) akışında her launcher bunu dağıtır.
  msClientId: '45456fc3-3626-4845-9d06-96b2e920c052',
};

class Store {
  constructor() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS);
    this.accounts = { active: null, list: [] };
    this.profiles = [];
    this.skins = [];
  }

  load() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, readJson(P.configFile('settings.json'), {}));
    P.setRoot(this.settings.dataDir);
    this.accounts = readJson(P.configFile('accounts.json'), { active: null, list: [] });
    if (!Array.isArray(this.accounts.list)) this.accounts = { active: null, list: [] };
    this.profiles = readJson(path.join(P.root(), 'profiles.json'), []);
    if (!Array.isArray(this.profiles)) this.profiles = [];
    this.skins = readJson(path.join(P.root(), 'skins.json'), []);
    if (!Array.isArray(this.skins)) this.skins = [];
    return this;
  }

  saveSettings() {
    writeJson(P.configFile('settings.json'), this.settings);
  }
  saveAccounts() {
    writeJson(P.configFile('accounts.json'), this.accounts);
  }
  saveProfiles() {
    writeJson(path.join(P.root(), 'profiles.json'), this.profiles);
  }
  saveSkins() {
    writeJson(path.join(P.root(), 'skins.json'), this.skins);
  }
}

module.exports = { Store, DEFAULT_SETTINGS, readJson, writeJson };
