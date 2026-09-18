'use strict';
/** Modrinth API v2 client */
const net = require('../net');

const BASE = 'https://api.modrinth.com/v2';

const PROJECT_TYPES = {
  mod: 'mod',
  modpack: 'modpack',
  resourcepack: 'resourcepack',
  shader: 'shader',
  datapack: 'datapack',
  plugin: 'plugin',
};

function q(obj) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v)));
  }
  return parts.length ? '?' + parts.join('&') : '';
}

/**
 * @param {{query?:string,type?:string,loader?:string,gameVersion?:string,
 *          categories?:string[],sort?:string,offset?:number,limit?:number}} opts
 */
async function search(opts = {}) {
  const facets = [];
  const type = opts.type || 'mod';
  facets.push([`project_type:${type}`]);
  if (opts.loader && type !== 'resourcepack' && type !== 'shader') facets.push([`categories:${opts.loader}`]);
  if (opts.gameVersion) facets.push([`versions:${opts.gameVersion}`]);
  if (opts.categories && opts.categories.length) {
    for (const c of opts.categories) facets.push([`categories:${c}`]);
  }
  const url =
    BASE +
    '/search' +
    q({
      query: opts.query || '',
      facets: facets,
      index: opts.sort || 'relevance',
      offset: opts.offset || 0,
      limit: Math.min(opts.limit || 20, 100),
    });
  const data = await net.getJson(url);
  return {
    total: data.total_hits,
    offset: data.offset,
    hits: (data.hits || []).map(normalizeHit),
  };
}

function normalizeHit(h) {
  return {
    source: 'modrinth',
    id: h.project_id || h.id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    icon: h.icon_url || '',
    downloads: h.downloads || 0,
    follows: h.follows || 0,
    author: h.author || '',
    categories: h.categories || [],
    loaders: (h.categories || []).filter((c) =>
      ['fabric', 'forge', 'neoforge', 'quilt', 'liteloader', 'rift'].includes(c)
    ),
    gameVersions: h.versions || [],
    latestVersion: h.latest_version || '',
    projectType: h.project_type || 'mod',
    clientSide: h.client_side,
    serverSide: h.server_side,
    updated: h.date_modified,
    url: `https://modrinth.com/${h.project_type || 'mod'}/${h.slug}`,
    gallery: h.gallery || [],
    license: h.license || '',
  };
}

async function getProject(idOrSlug) {
  const p = await net.getJson(`${BASE}/project/${encodeURIComponent(idOrSlug)}`);
  return {
    source: 'modrinth',
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    body: p.body,
    icon: p.icon_url || '',
    downloads: p.downloads,
    follows: p.followers,
    categories: p.categories || [],
    loaders: p.loaders || [],
    gameVersions: p.game_versions || [],
    projectType: p.project_type,
    gallery: (p.gallery || []).map((g) => ({ url: g.url, title: g.title, featured: g.featured })),
    issues: p.issues_url,
    source_url: p.source_url,
    discord: p.discord_url,
    license: p.license && p.license.id,
    url: `https://modrinth.com/${p.project_type}/${p.slug}`,
  };
}

/** Versions of a project, newest first. */
async function getVersions(projectId, { loader, gameVersion } = {}) {
  const params = {};
  if (loader) params.loaders = [loader];
  if (gameVersion) params.game_versions = [gameVersion];
  const list = await net.getJson(`${BASE}/project/${encodeURIComponent(projectId)}/version` + q(params));
  return (list || []).map(normalizeVersion);
}

async function getVersion(versionId) {
  return normalizeVersion(await net.getJson(`${BASE}/version/${encodeURIComponent(versionId)}`));
}

function normalizeVersion(v) {
  const primary = (v.files || []).find((f) => f.primary) || (v.files || [])[0] || {};
  return {
    source: 'modrinth',
    id: v.id,
    projectId: v.project_id,
    name: v.name,
    versionNumber: v.version_number,
    changelog: v.changelog,
    date: v.date_published,
    downloads: v.downloads,
    type: v.version_type,
    loaders: v.loaders || [],
    gameVersions: v.game_versions || [],
    file: primary.url
      ? {
          name: primary.filename,
          url: primary.url,
          size: primary.size,
          sha1: primary.hashes && primary.hashes.sha1,
          sha512: primary.hashes && primary.hashes.sha512,
        }
      : null,
    files: (v.files || []).map((f) => ({
      name: f.filename,
      url: f.url,
      size: f.size,
      primary: !!f.primary,
      sha1: f.hashes && f.hashes.sha1,
      sha512: f.hashes && f.hashes.sha512,
    })),
    dependencies: (v.dependencies || []).map((d) => ({
      projectId: d.project_id,
      versionId: d.version_id,
      type: d.dependency_type, // required | optional | incompatible | embedded
      fileName: d.file_name,
    })),
  };
}

/** Pick the newest version matching loader + game version. */
async function bestVersion(projectId, { loader, gameVersion, allowLooseLoader = true } = {}) {
  let list = await getVersions(projectId, { loader, gameVersion });
  if (!list.length && allowLooseLoader) {
    // Resource packs / shaders / datapacks have no loader facet on versions
    list = await getVersions(projectId, { gameVersion });
  }
  if (!list.length) return null;
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  return list[0];
}

/** Modpack index resolution helpers */
async function getVersionsBulk(ids) {
  if (!ids.length) return [];
  const url = `${BASE}/versions?ids=${encodeURIComponent(JSON.stringify(ids))}`;
  const list = await net.getJson(url);
  return (list || []).map(normalizeVersion);
}

async function categories() {
  return net.getJson(`${BASE}/tag/category`);
}

async function gameVersions() {
  return net.getJson(`${BASE}/tag/game_version`);
}

module.exports = {
  BASE,
  PROJECT_TYPES,
  search,
  getProject,
  getVersions,
  getVersion,
  getVersionsBulk,
  bestVersion,
  categories,
  gameVersions,
};
