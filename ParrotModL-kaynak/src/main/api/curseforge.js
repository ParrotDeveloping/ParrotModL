'use strict';
/**
 * CurseForge API client.
 *
 * Two transports:
 *  - Official api.curseforge.com  (needs a personal API key -> Settings)
 *  - api.curse.tools public mirror (no key required) - used by default
 */
const net = require('../net');

const OFFICIAL = 'https://api.curseforge.com/v1';
const MIRROR = 'https://api.curse.tools/v1/cf';

const GAME_ID = 432;
const CLASS = {
  mod: 6,
  modpack: 4471,
  resourcepack: 12,
  shader: 6552,
  world: 17,
  datapack: 6945,
};
const LOADER = { any: 0, forge: 1, cauldron: 2, liteloader: 3, fabric: 4, quilt: 5, neoforge: 6 };
const LOADER_NAME = { 0: 'any', 1: 'forge', 2: 'cauldron', 3: 'liteloader', 4: 'fabric', 5: 'quilt', 6: 'neoforge' };

let apiKey = '';
function setApiKey(k) {
  apiKey = (k || '').trim();
}
function hasKey() {
  return !!apiKey;
}

function base() {
  return apiKey ? OFFICIAL : MIRROR;
}
function headers() {
  return apiKey ? { 'x-api-key': apiKey } : {};
}

function q(obj) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  }
  return parts.length ? '?' + parts.join('&') : '';
}

async function call(pathname, params) {
  const url = base() + pathname + q(params || {});
  const data = await net.getJson(url, { headers: headers() });
  return data;
}

/**
 * @param {{query?:string,type?:string,loader?:string,gameVersion?:string,
 *          sort?:string,offset?:number,limit?:number,categoryId?:number}} opts
 */
async function search(opts = {}) {
  const type = opts.type || 'mod';
  const sortMap = {
    relevance: 1, // Featured
    downloads: 6, // TotalDownloads
    follows: 2, // Popularity
    newest: 11, // ReleaseDate
    updated: 3, // LastUpdated
    name: 4,
  };
  const params = {
    gameId: GAME_ID,
    classId: CLASS[type] != null ? CLASS[type] : CLASS.mod,
    searchFilter: opts.query || '',
    sortField: sortMap[opts.sort] || 1,
    sortOrder: 'desc',
    index: opts.offset || 0,
    pageSize: Math.min(opts.limit || 20, 50),
  };
  if (opts.gameVersion) params.gameVersion = opts.gameVersion;
  if (opts.loader && LOADER[opts.loader] != null && type === 'mod') params.modLoaderType = LOADER[opts.loader];
  if (opts.categoryId) params.categoryId = opts.categoryId;

  const data = await call('/mods/search', params);
  return {
    total: (data.pagination && data.pagination.totalCount) || 0,
    offset: params.index,
    hits: (data.data || []).map((m) => normalizeMod(m, type)),
  };
}

function normalizeMod(m, type) {
  const loaders = new Set();
  for (const f of m.latestFilesIndexes || []) {
    const n = LOADER_NAME[f.modLoader];
    if (n && n !== 'any') loaders.add(n);
  }
  const gv = new Set();
  for (const f of m.latestFilesIndexes || []) if (f.gameVersion) gv.add(f.gameVersion);
  return {
    source: 'curseforge',
    id: String(m.id),
    slug: m.slug,
    title: m.name,
    description: m.summary,
    icon: (m.logo && m.logo.thumbnailUrl) || (m.logo && m.logo.url) || '',
    downloads: m.downloadCount || 0,
    follows: m.thumbsUpCount || 0,
    author: (m.authors && m.authors[0] && m.authors[0].name) || '',
    categories: (m.categories || []).map((c) => c.name),
    loaders: [...loaders],
    gameVersions: [...gv],
    projectType: type || 'mod',
    updated: m.dateModified,
    url: (m.links && m.links.websiteUrl) || `https://www.curseforge.com/minecraft/mc-mods/${m.slug}`,
    gallery: (m.screenshots || []).map((s) => ({ url: s.url, title: s.title })),
    allowDistribution: m.allowModDistribution !== false,
  };
}

async function getProject(modId) {
  const data = await call(`/mods/${encodeURIComponent(modId)}`);
  const m = data.data || data;
  const out = normalizeMod(m, null);
  out.body = '';
  try {
    const d = await call(`/mods/${encodeURIComponent(modId)}/description`);
    out.body = d.data || '';
  } catch {}
  return out;
}

async function getVersions(modId, { loader, gameVersion, limit = 50, offset = 0 } = {}) {
  const params = { pageSize: Math.min(limit, 50), index: offset };
  if (gameVersion) params.gameVersion = gameVersion;
  if (loader && LOADER[loader] != null) params.modLoaderType = LOADER[loader];
  const data = await call(`/mods/${encodeURIComponent(modId)}/files`, params);
  return (data.data || []).map(normalizeFile).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function normalizeFile(f) {
  const loaders = [];
  for (const v of f.gameVersions || []) {
    const l = String(v).toLowerCase();
    if (['forge', 'fabric', 'quilt', 'neoforge'].includes(l)) loaders.push(l);
  }
  const gameVersions = (f.gameVersions || []).filter((v) => /^\d/.test(v));
  // CurseForge sometimes omits downloadUrl for projects that block 3rd party downloads.
  let url = f.downloadUrl;
  if (!url && f.id && f.fileName) {
    const id = String(f.id);
    url = `https://mediafilez.forgecdn.net/files/${id.slice(0, 4)}/${Number(id.slice(4))}/${encodeURIComponent(
      f.fileName
    )}`;
  }
  return {
    source: 'curseforge',
    id: String(f.id),
    projectId: String(f.modId),
    name: f.displayName,
    versionNumber: f.displayName,
    date: f.fileDate,
    downloads: f.downloadCount,
    type: f.releaseType === 1 ? 'release' : f.releaseType === 2 ? 'beta' : 'alpha',
    loaders,
    gameVersions,
    changelog: '',
    file: {
      name: f.fileName,
      url,
      size: f.fileLength,
      sha1: (f.hashes || []).find((h) => h.algo === 1)?.value || null,
    },
    files: [
      {
        name: f.fileName,
        url,
        size: f.fileLength,
        primary: true,
        sha1: (f.hashes || []).find((h) => h.algo === 1)?.value || null,
      },
    ],
    dependencies: (f.dependencies || [])
      .map((d) => ({
        projectId: String(d.modId),
        versionId: null,
        // 1 EmbeddedLibrary 2 OptionalDependency 3 RequiredDependency 4 Tool 5 Incompatible 6 Include
        type: d.relationType === 3 ? 'required' : d.relationType === 2 ? 'optional' : 'other',
      }))
      .filter((d) => d.type !== 'other'),
  };
}

async function getVersion(fileId, modId) {
  const data = await call(`/mods/${encodeURIComponent(modId)}/files/${encodeURIComponent(fileId)}`);
  return normalizeFile(data.data || data);
}

async function getFilesBulk(fileIds) {
  if (!fileIds.length) return [];
  const url = base() + '/mods/files';
  const res = await net.postJson(url, { fileIds: fileIds.map((n) => Number(n)) }, { headers: headers() });
  return (res.data || []).map(normalizeFile);
}

async function getModsBulk(modIds) {
  if (!modIds.length) return [];
  const url = base() + '/mods';
  const res = await net.postJson(url, { modIds: modIds.map((n) => Number(n)) }, { headers: headers() });
  return (res.data || []).map((m) => normalizeMod(m, null));
}

async function bestVersion(modId, { loader, gameVersion } = {}) {
  let list = await getVersions(modId, { loader, gameVersion });
  if (!list.length) list = await getVersions(modId, { gameVersion });
  if (!list.length) return null;
  const release = list.filter((v) => v.type === 'release');
  return (release[0] || list[0]) ?? null;
}

module.exports = {
  CLASS,
  LOADER,
  GAME_ID,
  setApiKey,
  hasKey,
  search,
  getProject,
  getVersions,
  getVersion,
  getFilesBulk,
  getModsBulk,
  bestVersion,
};
