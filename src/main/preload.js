'use strict';
const { contextBridge, ipcRenderer } = require('electron');

function call(channel, payload) {
  return ipcRenderer.invoke(channel, payload).then((res) => {
    if (!res) throw new Error('Yanıt alınamadı.');
    if (!res.ok) throw new Error(res.error);
    return res.data;
  });
}

const listeners = new Map();
function on(channel, cb) {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, fn);
  listeners.set(cb, { channel, fn });
  return () => off(channel, cb);
}
function off(channel, cb) {
  const l = listeners.get(cb);
  if (l) {
    ipcRenderer.removeListener(l.channel, l.fn);
    listeners.delete(cb);
  }
}

contextBridge.exposeInMainWorld('api', {
  on,
  off,

  window: {
    minimize: () => call('window:minimize'),
    maximize: () => call('window:maximize'),
    close: () => call('window:close'),
    isMaximized: () => call('window:isMaximized'),
  },

  app: {
    info: () => call('app:info'),
    openExternal: (url) => call('app:openExternal', { url }),
    openPath: (target) => call('app:openPath', { target }),
    showItem: (target) => call('app:showItem', { target }),
    copy: (text) => call('app:copy', { text }),
  },

  settings: {
    get: () => call('settings:get'),
    set: (patch) => call('settings:set', { patch }),
    reset: () => call('settings:reset'),
    pickFolder: (title) => call('settings:pickFolder', { title }),
    pickFile: (title, filters) => call('settings:pickFile', { title, filters }),
  },

  accounts: {
    list: () => call('accounts:list'),
    active: () => call('accounts:active'),
    addOffline: (name) => call('accounts:addOffline', { name }),
    setActive: (id) => call('accounts:setActive', { id }),
    remove: (id) => call('accounts:remove', { id }),
    msStart: () => call('accounts:msStart'),
    msCancel: (sessionId) => call('accounts:msCancel', { sessionId }),
    refresh: (id) => call('accounts:refresh', { id }),
  },

  mc: {
    versions: (snapshots) => call('mc:versions', { snapshots }),
    loaderVersions: (loader, mcVersion) => call('mc:loaderVersions', { loader, mcVersion }),
    loaderGameVersions: (loader) => call('mc:loaderGameVersions', { loader }),
  },

  java: {
    scan: () => call('java:scan'),
    install: (major) => call('java:install', { major }),
  },

  content: {
    search: (opts) => call('content:search', { opts }),
    project: (source, id) => call('content:project', { source, id }),
    versions: (source, id, loader, gameVersion) => call('content:versions', { source, id, loader, gameVersion }),
    downloadToFolder: (spec) => call('content:downloadToFolder', { spec }),
  },

  profiles: {
    list: () => call('profiles:list'),
    get: (id) => call('profiles:get', { id }),
    create: (data) => call('profiles:create', { data }),
    update: (id, patch) => call('profiles:update', { id, patch }),
    remove: (id, deleteFiles) => call('profiles:delete', { id, deleteFiles }),
    duplicate: (id, name) => call('profiles:duplicate', { id, name }),
    openFolder: (id) => call('profiles:openFolder', { id }),
    content: (id) => call('profiles:content', { id }),
    toggleContent: (id, uid) => call('profiles:toggleContent', { id, uid }),
    removeContent: (id, uid) => call('profiles:removeContent', { id, uid }),
    checkUpdates: (id) => call('profiles:checkUpdates', { id }),
    updateContent: (id, uid, versionId) => call('profiles:updateContent', { id, uid, versionId }),
    install: (id, spec) => call('profiles:install', { id, spec }),
    compatibility: (id, source, projectId, type) => call('profiles:compatibility', { id, source, projectId, type }),
    installModpack: (spec) => call('profiles:installModpack', { spec }),
    exportPack: (id, options) => call('profiles:export', { id, options }),
    importPack: (filePath) => call('profiles:import', { filePath }),
  },

  game: {
    launch: (id) => call('game:launch', { id }),
    stop: (id) => call('game:stop', { id }),
    running: () => call('game:running'),
  },

  skins: {
    list: () => call('skins:list'),
    add: (data) => call('skins:add', data || {}),
    addFromUsername: (username) => call('skins:addFromUsername', { username }),
    rename: (id, name) => call('skins:rename', { id, name }),
    variant: (id, variant) => call('skins:variant', { id, variant }),
    remove: (id) => call('skins:remove', { id }),
    apply: (id) => call('skins:apply', { id }),
    reset: () => call('skins:reset'),
    setCape: (capeId) => call('skins:setCape', { capeId }),
    fetchImage: (url) => call('skins:fetchImage', { url }),
  },

  shots: {
    list: () => call('shots:list'),
    read: (target) => call('shots:read', { target }),
    remove: (id) => call('shots:delete', { id }),
    copy: (target) => call('shots:copy', { target }),
    saveAs: (target) => call('shots:saveAs', { target }),
  },
});
