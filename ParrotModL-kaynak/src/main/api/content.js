'use strict';
/** Unified content layer over Modrinth + CurseForge. */
const modrinth = require('./modrinth');
const curseforge = require('./curseforge');

const PROVIDERS = { modrinth, curseforge };

function provider(name) {
  return PROVIDERS[name] || modrinth;
}

/**
 * Search one or both providers and merge results.
 * @param {{provider:'modrinth'|'curseforge'|'both'}} opts
 */
async function search(opts = {}) {
  const which = opts.provider || 'both';
  const limit = opts.limit || 20;
  if (which !== 'both') {
    const r = await provider(which).search(opts);
    return { total: r.total, hits: r.hits, errors: [] };
  }
  const half = Math.max(5, Math.ceil(limit / 2));
  const errors = [];
  const [a, b] = await Promise.all([
    modrinth.search({ ...opts, limit: half }).catch((e) => {
      errors.push({ provider: 'modrinth', message: e.message });
      return { total: 0, hits: [] };
    }),
    curseforge.search({ ...opts, limit: half }).catch((e) => {
      errors.push({ provider: 'curseforge', message: e.message });
      return { total: 0, hits: [] };
    }),
  ]);
  // interleave so both sources are visible
  const hits = [];
  const max = Math.max(a.hits.length, b.hits.length);
  for (let i = 0; i < max; i++) {
    if (a.hits[i]) hits.push(a.hits[i]);
    if (b.hits[i]) hits.push(b.hits[i]);
  }
  return { total: (a.total || 0) + (b.total || 0), hits, errors };
}

function getProject(source, id) {
  return provider(source).getProject(id);
}

function getVersions(source, id, opts) {
  return provider(source).getVersions(id, opts);
}

function bestVersion(source, id, opts) {
  return provider(source).bestVersion(id, opts);
}

/**
 * Resolve a version + all required dependencies (recursively).
 * Returns { root, deps:[], missing:[] }
 */
async function resolveWithDependencies(source, version, { loader, gameVersion, maxDepth = 4 } = {}) {
  const api = provider(source);
  const seen = new Set([String(version.projectId)]);
  const deps = [];
  const missing = [];

  async function walk(ver, depth) {
    if (depth > maxDepth) return;
    for (const d of ver.dependencies || []) {
      if (d.type !== 'required') continue;
      const key = String(d.projectId || d.versionId);
      if (!key || key === 'null' || seen.has(key)) continue;
      seen.add(key);
      try {
        let dv = null;
        if (d.versionId && source === 'modrinth') {
          dv = await modrinth.getVersion(d.versionId);
        } else if (d.projectId) {
          dv = await api.bestVersion(d.projectId, { loader, gameVersion });
        }
        if (!dv || !dv.file || !dv.file.url) {
          missing.push({ projectId: d.projectId, reason: 'uygun sürüm bulunamadı' });
          continue;
        }
        let meta = null;
        try {
          meta = await api.getProject(d.projectId || dv.projectId);
        } catch {}
        deps.push({ version: dv, project: meta });
        await walk(dv, depth + 1);
      } catch (e) {
        missing.push({ projectId: d.projectId, reason: e.message });
      }
    }
  }

  await walk(version, 0);
  return { root: version, deps, missing };
}

module.exports = { search, getProject, getVersions, bestVersion, resolveWithDependencies, provider };
