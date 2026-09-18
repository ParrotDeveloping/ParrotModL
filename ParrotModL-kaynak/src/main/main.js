'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const P = require('./paths');
const { Store } = require('./store');
const { Accounts } = require('./auth/accounts');
const ms = require('./auth/microsoft');
const { Profiles } = require('./profiles');
const { Skins } = require('./skins');
const contentApi = require('./api/content');
const modrinth = require('./api/modrinth');
const curseforge = require('./api/curseforge');
const mojang = require('./game/mojang');
const loaders = require('./game/loaders');
const javaMgr = require('./game/java');
const launcher = require('./game/launcher');
const net = require('./net');

let win = null;
let store = null;
let accounts = null;
let profiles = null;
let skins = null;
const loginSessions = new Map();

app.setAppUserModelId('app.parrotmodl.launcher');
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    backgroundColor: '#0d1526',
    title: 'ParrotModL',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'logo.png'),
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  if (process.env.PARROTMODL_SMOKE) runSmokeTest();
  if (process.env.PARROTMODL_SHOT) runShots(process.env.PARROTMODL_SHOT);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('maximize', () => send('window:state', { maximized: true }));
  win.on('unmaximize', () => send('window:state', { maximized: false }));
  win.on('closed', () => (win = null));
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** Tasarım kontrolü için her sekmenin ekran görüntüsünü alır. */
function runShots(outDir) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  win.webContents.once('did-finish-load', async () => {
    fs.mkdirSync(outDir, { recursive: true });
    await wait(1200);
    const shot = async (name) => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG());
    };
    try {
      await win.webContents.executeJavaScript(
        `(async()=>{const w=(m)=>new Promise(r=>setTimeout(r,m));
         window.Views.accounts.offlineFlow(); await w(300);
         const i=document.querySelector('.overlay .modal input'); if(i){i.value='ParrotUser';[...document.querySelectorAll('.modal-foot .btn')].pop().click();}
         await w(400);
         for (const d of [
           {name:'Survival Dünyam',mcVersion:'1.20.1',loader:'fabric',loaderVersion:'0.15.11'},
           {name:'Teknik Modpack',mcVersion:'1.20.1',loader:'forge',loaderVersion:'1.20.1-47.2.20'},
           {name:'Shader Vitrini',mcVersion:'1.21.1',loader:'vanilla',loaderVersion:''}]) {
           try { await window.api.profiles.create(d); } catch(e) {}
         }
         await window.UI.loadProfiles(); await window.UI.go('home'); await w(400);
        })()`,
        true
      );
      await wait(900);
      await shot('01-home');
      if (process.env.PARROTMODL_TEST_SKIN) {
        const buf = fs.readFileSync(process.env.PARROTMODL_TEST_SKIN);
        skins.add({ name: 'Test Skin', variant: 'classic', dataUrl: 'data:image/png;base64,' + buf.toString('base64') });
        if (process.env.PARROTMODL_TEST_CAPE) {
          const cbuf = fs.readFileSync(process.env.PARROTMODL_TEST_CAPE);
          await win.webContents.executeJavaScript(
            `window.__testCape = 'data:image/png;base64,${cbuf.toString('base64')}';`,
            true
          );
        }
      }
      await win.webContents.executeJavaScript(`window.UI.go('skins')`, true);
      await wait(2200);
      await shot('02-skins');
      await win.webContents.executeJavaScript(`window.UI.go('discover')`, true);
      await wait(1600);
      await shot('03-discover');
      await win.webContents.executeJavaScript(`window.UI.go('screenshots')`, true);
      await wait(900);
      await shot('04-screenshots');
      await win.webContents.executeJavaScript(`window.UI.go('settings')`, true);
      await wait(900);
      await shot('05-settings');
      await win.webContents.executeJavaScript(
        `(async()=>{const w=(m)=>new Promise(r=>setTimeout(r,m));
         const b=[...document.querySelectorAll('.settings-nav button')].find(x=>x.dataset.s==='account'); if(b)b.click(); await w(500);})()`,
        true
      );
      await wait(700);
      await shot('06-settings-account');
      await win.webContents.executeJavaScript(
        `(async()=>{const w=(m)=>new Promise(r=>setTimeout(r,m)); await window.UI.go('home'); await w(400); window.Views.home.createProfileDialog(); await w(700);})()`,
        true
      );
      await wait(900);
      await shot('07-create-profile');
      await win.webContents.executeJavaScript(
        `(async()=>{const w=(m)=>new Promise(r=>setTimeout(r,m));
         document.querySelector('.overlay .modal-head button').click(); await w(200);
         const id=window.State.profiles[0]&&window.State.profiles[0].id; if(id) await window.UI.go('profile', id); await w(600);})()`,
        true
      );
      await wait(1000);
      await shot('08-profile');
      console.log('SHOTS_DONE');
    } catch (e) {
      console.log('SHOTS_ERROR ' + e.message);
    }
    setTimeout(() => app.exit(0), 300);
  });
}

/**
 * Geliştirme sırasında arayüzü baştan sona gezip hata toplayan kendi kendine test.
 * Sadece PARROTMODL_SMOKE ortam değişkeni ile çalışır.
 */
function runSmokeTest() {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) errors.push(`[console] ${message} (${source}:${line})`);
  });
  win.webContents.on('render-process-gone', (_e, d) => errors.push('[renderer gone] ' + JSON.stringify(d)));

  win.webContents.once('did-finish-load', async () => {
    const script = `(async () => {
      const out = { steps: [], errors: [] };
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      window.onerror = (m, s, l) => out.errors.push(m + ' @' + s + ':' + l);
      window.addEventListener('unhandledrejection', (e) => out.errors.push('promise: ' + (e.reason && e.reason.message)));
      try {
        await wait(700);
        out.steps.push('boot:' + (document.querySelector('.nav-item') ? 'ok' : 'FAIL'));
        for (const r of ['home','skins','discover','screenshots','settings']) {
          await window.UI.go(r);
          await wait(450);
          const v = document.querySelector('#view');
          out.steps.push(r + ':' + (v && v.children.length ? 'ok(' + v.children.length + ')' : 'EMPTY'));
        }
        await window.UI.go('settings');
        await wait(300);
        for (const id of ['appearance','game','java','content','account','storage','about']) {
          const b = [...document.querySelectorAll('.settings-nav button')].find((x) => x.dataset.s === id);
          if (!b) { out.steps.push('settings/' + id + ':MISSING'); continue; }
          b.click();
          await wait(320);
          out.steps.push('settings/' + id + ':' + (document.querySelector('.settings-section').children.length ? 'ok' : 'EMPTY'));
        }
        await window.UI.go('home');
        await wait(250);
        window.Views.home.createProfileDialog();
        await wait(600);
        out.steps.push('createDialog:' + (document.querySelector('.modal') ? 'ok' : 'FAIL'));
        document.querySelector('.overlay .modal-head button').click();
        await wait(150);
        window.Views.accounts.open();
        await wait(300);
        out.steps.push('accountsDialog:' + (document.querySelector('.modal') ? 'ok' : 'FAIL'));
        document.querySelector('.overlay .modal-head button').click();
        await wait(120);
        window.Views.accounts.offlineFlow();
        await wait(250);
        const inp = document.querySelector('.overlay .modal input');
        if (inp) { inp.value = 'TestOyuncu'; [...document.querySelectorAll('.modal-foot .btn')].pop().click(); }
        await wait(500);
        out.steps.push('offlineAccount:' + (window.State.account ? window.State.account.name : 'FAIL'));
        await window.UI.go('skins');
        await wait(500);
        out.steps.push('skinsAfterAccount:' + (document.querySelector('.skin-layout') ? 'ok' : 'FAIL'));
      } catch (e) {
        out.errors.push('fatal: ' + e.message + '\\n' + e.stack);
      }
      return out;
    })()`;
    let result = null;
    try {
      result = await win.webContents.executeJavaScript(script, true);
    } catch (e) {
      errors.push('executeJavaScript: ' + e.message);
    }
    console.log('SMOKE_RESULT ' + JSON.stringify({ result, mainErrors: errors }));
    setTimeout(() => app.exit(0), 300);
  });
}

app.whenReady().then(() => {
  store = new Store().load();
  curseforge.setApiKey(store.settings.curseforgeKey);
  accounts = new Accounts(store);
  profiles = new Profiles(store);
  skins = new Skins(store);
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --------------------------------------------------------------------- IPC

function handle(channel, fn) {
  ipcMain.handle(channel, async (evt, payload) => {
    try {
      const data = await fn(payload || {}, evt);
      return { ok: true, data };
    } catch (e) {
      console.error('[' + channel + ']', e);
      return { ok: false, error: e.message || String(e) };
    }
  });
}

function registerIpc() {
  // ---- window controls
  handle('window:minimize', () => win && win.minimize());
  handle('window:maximize', () => {
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  handle('window:close', () => win && win.close());
  handle('window:isMaximized', () => !!(win && win.isMaximized()));

  // ---- app info
  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    dataDir: P.root(),
    totalMemoryMb: javaMgr.totalMemoryMb(),
  }));

  handle('app:openExternal', ({ url }) => shell.openExternal(url));
  handle('app:openPath', ({ target }) => shell.openPath(target));
  handle('app:showItem', ({ target }) => shell.showItemInFolder(target));
  handle('app:copy', ({ text }) => clipboard.writeText(String(text || '')));

  // ---- settings
  handle('settings:get', () => store.settings);
  handle('settings:set', ({ patch }) => {
    const needsRestart = patch.dataDir !== undefined && patch.dataDir !== store.settings.dataDir;
    Object.assign(store.settings, patch);
    store.saveSettings();
    if (patch.curseforgeKey !== undefined) curseforge.setApiKey(patch.curseforgeKey);
    return { settings: store.settings, needsRestart };
  });
  handle('settings:reset', () => {
    const { DEFAULT_SETTINGS } = require('./store');
    store.settings = Object.assign({}, DEFAULT_SETTINGS);
    store.saveSettings();
    return store.settings;
  });
  handle('settings:pickFolder', async ({ title }) => {
    const r = await dialog.showOpenDialog(win, { title: title || 'Klasör seç', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('settings:pickFile', async ({ title, filters }) => {
    const r = await dialog.showOpenDialog(win, { title: title || 'Dosya seç', properties: ['openFile'], filters });
    return r.canceled ? null : r.filePaths[0];
  });

  // ---- accounts
  handle('accounts:list', () => accounts.list());
  handle('accounts:addOffline', ({ name }) => accounts.addOffline(name));
  handle('accounts:setActive', ({ id }) => accounts.setActive(id));
  handle('accounts:remove', ({ id }) => accounts.remove(id));
  handle('accounts:active', () => {
    const a = accounts.active();
    return a ? accounts.publicView(a) : null;
  });

  handle('accounts:msStart', async () => {
    const clientId = store.settings.msClientId;
    const dc = await ms.startDeviceCode(clientId);
    const sessionId = Math.random().toString(36).slice(2);
    const signal = { cancelled: false };
    loginSessions.set(sessionId, signal);
    // poll in the background and report through events
    (async () => {
      try {
        const token = await ms.pollDeviceCode(clientId, dc.deviceCode, {
          interval: dc.interval,
          expiresIn: dc.expiresIn,
          signal,
        });
        send('accounts:msProgress', { sessionId, stage: 'Xbox Live doğrulanıyor' });
        const mcSession = await ms.toMinecraft(token.access_token);
        const acc = accounts.upsertMicrosoft({ msToken: token, mcSession });
        send('accounts:msDone', { sessionId, account: accounts.publicView(acc), accounts: accounts.list() });
      } catch (e) {
        send('accounts:msError', { sessionId, error: e.message, code: e.code || null });
      } finally {
        loginSessions.delete(sessionId);
      }
    })();
    return { sessionId, userCode: dc.userCode, verificationUri: dc.verificationUri, expiresIn: dc.expiresIn };
  });

  handle('accounts:msCancel', ({ sessionId }) => {
    const s = loginSessions.get(sessionId);
    if (s) s.cancelled = true;
    return true;
  });

  handle('accounts:refresh', async ({ id }) => {
    const raw = accounts.raw(id) || accounts.active();
    if (!raw) throw new Error('Hesap yok.');
    const valid = await accounts.ensureValid(raw, store.settings.msClientId);
    await accounts.refreshProfile(valid);
    return accounts.publicView(valid);
  });

  // ---- minecraft metadata
  handle('mc:versions', async ({ snapshots }) =>
    mojang.listVersions({ snapshots: snapshots ?? store.settings.showSnapshots })
  );
  handle('mc:loaderVersions', ({ loader, mcVersion }) => loaders.listLoaderVersions(loader, mcVersion));
  handle('mc:loaderGameVersions', ({ loader }) => loaders.supportedGameVersions(loader));

  // ---- java
  handle('java:scan', () => javaMgr.scan(true));
  handle('java:install', async ({ major }) => javaMgr.install(major, (p) => send('java:progress', p)));

  // ---- content search
  handle('content:search', ({ opts }) => {
    const o = Object.assign({}, opts);
    if (!o.provider || o.provider === 'default') o.provider = store.settings.defaultProvider;
    return contentApi.search(o);
  });
  handle('content:project', ({ source, id }) => contentApi.getProject(source, id));
  handle('content:versions', ({ source, id, loader, gameVersion }) =>
    contentApi.getVersions(source, id, { loader, gameVersion })
  );

  // ---- profiles
  handle('profiles:list', () =>
    profiles.list().map((p) => ({ ...p, iconUrl: profiles.iconDataUrl(p.icon) }))
  );
  handle('profiles:get', ({ id }) => {
    const p = profiles.view(profiles.require(id));
    return { ...p, iconUrl: profiles.iconDataUrl(p.icon) };
  });
  handle('profiles:create', ({ data }) => {
    const p = profiles.create(data);
    return { ...p, iconUrl: profiles.iconDataUrl(p.icon) };
  });
  handle('profiles:update', ({ id, patch }) => {
    const p = profiles.update(id, patch);
    return { ...p, iconUrl: profiles.iconDataUrl(p.icon) };
  });
  handle('profiles:delete', ({ id, deleteFiles }) => profiles.remove(id, deleteFiles !== false));
  handle('profiles:duplicate', ({ id, name }) => profiles.duplicate(id, name));
  handle('profiles:openFolder', ({ id }) => shell.openPath(P.instance(id)));

  handle('profiles:content', ({ id }) => profiles.listContent(id));
  handle('profiles:toggleContent', ({ id, uid }) => profiles.toggleContent(id, uid));
  handle('profiles:removeContent', ({ id, uid }) => profiles.removeContent(id, uid));
  handle('profiles:checkUpdates', ({ id }) => profiles.checkUpdates(id));
  handle('profiles:updateContent', ({ id, uid, versionId }) => profiles.updateContent(id, uid, versionId));

  handle('profiles:install', async ({ id, spec }) => {
    const taskId = spec.taskId || Math.random().toString(36).slice(2);
    const res = await profiles.installContent(id, spec, (p) =>
      send('task:progress', { taskId, profileId: id, ...p })
    );
    send('task:done', { taskId, profileId: id });
    return res;
  });

  handle('profiles:compatibility', async ({ id, source, projectId, type }) => {
    const p = profiles.require(id);
    const api = contentApi.provider(source);
    const version = await api.bestVersion(projectId, {
      loader: type === 'mod' && p.loader !== 'vanilla' ? p.loader : null,
      gameVersion: p.mcVersion,
    });
    if (!version) return { ok: false, reason: `Bu profile uygun sürüm yok (${p.mcVersion} / ${p.loader}).` };
    const c = profiles.compatibility(p, version, type || 'mod');
    return { ...c, version };
  });

  handle('content:downloadToFolder', async ({ spec }) => {
    const r = await dialog.showOpenDialog(win, {
      title: 'İndirme klasörünü seç',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled) return null;
    const taskId = Math.random().toString(36).slice(2);
    const out = await profiles.downloadToFolder({ ...spec, targetDir: r.filePaths[0] }, (p) =>
      send('task:progress', { taskId, ...p })
    );
    send('task:done', { taskId });
    return out;
  });

  // ---- modpacks & import/export
  handle('profiles:installModpack', async ({ spec }) => {
    const taskId = Math.random().toString(36).slice(2);
    const p = await profiles.installModpack(spec, (x) => send('task:progress', { taskId, ...x }));
    send('task:done', { taskId });
    return p;
  });

  handle('profiles:export', async ({ id, options }) => {
    const p = profiles.require(id);
    const r = await dialog.showSaveDialog(win, {
      title: 'Profili dışa aktar',
      defaultPath: `${p.name.replace(/[^\w\-. ]/g, '_')}.mrpack`,
      filters: [{ name: 'Modrinth paketi', extensions: ['mrpack'] }],
    });
    if (r.canceled) return null;
    return profiles.exportPack(id, { destFile: r.filePath, ...(options || {}) });
  });

  handle('profiles:import', async ({ filePath }) => {
    let file = filePath;
    if (!file) {
      const r = await dialog.showOpenDialog(win, {
        title: 'Paket seç',
        properties: ['openFile'],
        filters: [{ name: 'Mod paketi', extensions: ['mrpack', 'zip'] }],
      });
      if (r.canceled) return null;
      file = r.filePaths[0];
    }
    const taskId = Math.random().toString(36).slice(2);
    const p = await profiles.importPack(file, {}, (x) => send('task:progress', { taskId, ...x }));
    send('task:done', { taskId });
    return p;
  });

  // ---- launching
  handle('game:launch', async ({ id }) => {
    const profile = profiles.require(id);
    let account = accounts.active();
    if (!account) throw new Error('Önce bir hesap ekleyin (Microsoft veya çevrimdışı).');
    account = await accounts.ensureValid(account, store.settings.msClientId);
    profiles.markPlayed(id);
    const startedAt = Date.now();
    const res = await launcher.launch({ profile, account, settings: store.settings }, (evt) => {
      if (evt.type === 'exit') {
        profiles.addPlayTime(id, (Date.now() - startedAt) / 1000);
        if (win && store.settings.afterLaunch === 'minimize') win.restore();
      }
      send('game:event', evt);
    });
    if (store.settings.afterLaunch === 'minimize' && win) win.minimize();
    if (store.settings.afterLaunch === 'close' && win) win.hide();
    return res;
  });

  handle('game:stop', ({ id }) => launcher.stop(id));
  handle('game:running', () => launcher.listRunning());

  // ---- skins
  handle('skins:list', () => skins.list());
  handle('skins:add', async ({ name, variant, dataUrl }) => {
    if (!dataUrl) {
      const r = await dialog.showOpenDialog(win, {
        title: 'Skin PNG seç',
        properties: ['openFile'],
        filters: [{ name: 'PNG', extensions: ['png'] }],
      });
      if (r.canceled) return null;
      return skins.add({ name, variant, filePath: r.filePaths[0] });
    }
    return skins.add({ name, variant, dataUrl });
  });
  handle('skins:addFromUsername', ({ username }) => skins.addFromUsername(username));
  handle('skins:rename', ({ id, name }) => skins.rename(id, name));
  handle('skins:variant', ({ id, variant }) => skins.setVariant(id, variant));
  handle('skins:remove', ({ id }) => skins.remove(id));
  handle('skins:apply', async ({ id }) => {
    let acc = accounts.active();
    if (!acc) throw new Error('Hesap yok.');
    if (acc.type !== 'microsoft') throw new Error('Skin değiştirmek için Microsoft hesabı gerekli.');
    acc = await accounts.ensureValid(acc, store.settings.msClientId);
    await skins.apply(acc.accessToken, id);
    await accounts.refreshProfile(acc);
    return accounts.publicView(acc);
  });
  handle('skins:reset', async () => {
    let acc = accounts.active();
    if (!acc || acc.type !== 'microsoft') throw new Error('Microsoft hesabı gerekli.');
    acc = await accounts.ensureValid(acc, store.settings.msClientId);
    await skins.resetSkin(acc.accessToken);
    await accounts.refreshProfile(acc);
    return accounts.publicView(acc);
  });
  handle('skins:setCape', async ({ capeId }) => {
    let acc = accounts.active();
    if (!acc || acc.type !== 'microsoft') throw new Error('Pelerin seçmek için Microsoft hesabı gerekli.');
    acc = await accounts.ensureValid(acc, store.settings.msClientId);
    await skins.setCape(acc.accessToken, capeId);
    await accounts.refreshProfile(acc);
    return accounts.publicView(acc);
  });
  handle('skins:fetchImage', async ({ url }) => {
    const buf = await net.getBuffer(url);
    return 'data:image/png;base64,' + buf.toString('base64');
  });

  // ---- screenshots
  handle('shots:list', () => profiles.screenshots());
  handle('shots:read', ({ target }) => {
    const buf = fs.readFileSync(target);
    const ext = path.extname(target).slice(1).toLowerCase();
    return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + buf.toString('base64');
  });
  handle('shots:delete', ({ id }) => profiles.deleteScreenshot(id));
  handle('shots:copy', ({ target }) => {
    const img = nativeImage.createFromPath(target);
    clipboard.writeImage(img);
    return true;
  });
  handle('shots:saveAs', async ({ target }) => {
    const r = await dialog.showSaveDialog(win, {
      title: 'Ekran görüntüsünü kaydet',
      defaultPath: path.basename(target),
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (r.canceled) return null;
    fs.copyFileSync(target, r.filePath);
    return r.filePath;
  });
}
