'use strict';
/**
 * Minimal HTTP(S) helper: JSON requests, file downloads with progress,
 * redirect handling, retries and a small concurrency pool.
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const UA = 'ParrotModL/1.0.0 (launcher; +https://github.com/parrotmodl)';

function request(url, options = {}, body = null, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error('Çok fazla yönlendirme: ' + url));
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return reject(new Error('Geçersiz URL: ' + url));
    }
    const lib = u.protocol === 'http:' ? http : https;
    const headers = Object.assign({ 'User-Agent': UA, Accept: 'application/json' }, options.headers || {});
    if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers,
        timeout: options.timeout || 30000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return resolve(request(next, options, body, redirects + 1));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, headers: res.headers, body: buf });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Zaman aşımı: ' + url)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function requestRetry(url, options = {}, body = null) {
  const attempts = options.attempts || 3;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await request(url, options, body);
      if (res.status >= 500 && i < attempts - 1) {
        await sleep(400 * (i + 1));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(400 * (i + 1));
    }
  }
  throw lastErr;
}

async function getJson(url, options = {}) {
  const res = await requestRetry(url, options);
  const text = res.body.toString('utf8');
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`HTTP ${res.status} - ${url}\n${text.slice(0, 400)}`);
    err.status = res.status;
    err.bodyText = text;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Geçersiz JSON yanıtı: ' + url);
  }
}

async function postJson(url, payload, options = {}) {
  const res = await requestRetry(url, Object.assign({ method: 'POST' }, options), JSON.stringify(payload));
  const text = res.body.toString('utf8');
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`HTTP ${res.status} - ${url}\n${text.slice(0, 400)}`);
    err.status = res.status;
    err.bodyText = text;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

async function getBuffer(url, options = {}) {
  const res = await requestRetry(url, options);
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status} - ${url}`);
  return res.body;
}

function getText(url, options = {}) {
  return getBuffer(url, options).then((b) => b.toString('utf8'));
}

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    const s = fs.createReadStream(file);
    s.on('error', reject);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

async function fileOk(dest, sha1, size) {
  try {
    const st = await fsp.stat(dest);
    if (!st.isFile() || st.size === 0) return false;
    if (size && st.size !== size) return false;
    if (sha1) {
      const got = await sha1File(dest);
      return got.toLowerCase() === String(sha1).toLowerCase();
    }
    return true;
  } catch {
    return false;
  }
}

/** Stream download with redirect support + progress callback(bytesDelta) */
function streamTo(url, dest, onChunk, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error('Çok fazla yönlendirme: ' + url));
    let u;
    try {
      u = new URL(url);
    } catch {
      return reject(new Error('Geçersiz indirme adresi: ' + url));
    }
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        headers: { 'User-Agent': UA },
        timeout: 60000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return resolve(streamTo(next, dest, onChunk, redirects + 1));
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} - ${url}`));
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const tmp = dest + '.part';
        const out = fs.createWriteStream(tmp);
        res.on('data', (c) => onChunk && onChunk(c.length));
        res.pipe(out);
        out.on('error', reject);
        out.on('finish', () => {
          out.close(() => {
            try {
              fs.renameSync(tmp, dest);
              resolve(dest);
            } catch (e) {
              reject(e);
            }
          });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('İndirme zaman aşımı: ' + url)));
    req.on('error', reject);
  });
}

/**
 * Download a file if it is missing / hash mismatched.
 * @param {{url:string,dest:string,sha1?:string,size?:number}} spec
 */
async function download(spec, onChunk) {
  const { url, dest, sha1, size } = spec;
  if (await fileOk(dest, sha1, size)) {
    if (onChunk && size) onChunk(size);
    return { dest, skipped: true };
  }
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      await streamTo(url, dest, onChunk);
      if (sha1) {
        const got = await sha1File(dest);
        if (got.toLowerCase() !== String(sha1).toLowerCase()) throw new Error('Hash uyuşmadı: ' + dest);
      }
      return { dest, skipped: false };
    } catch (e) {
      lastErr = e;
      try {
        await fsp.unlink(dest + '.part');
      } catch {}
      await sleep(500 * (i + 1));
    }
  }
  throw lastErr;
}

/** Run tasks with limited concurrency. tasks = array of () => Promise */
async function pool(tasks, limit = 8, onDone) {
  const results = new Array(tasks.length);
  let index = 0;
  let done = 0;
  const workers = new Array(Math.min(limit, tasks.length || 1)).fill(0).map(async () => {
    while (true) {
      const i = index++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
      done++;
      if (onDone) onDone(done, tasks.length);
    }
  });
  await Promise.all(workers);
  return results;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  UA,
  request,
  requestRetry,
  getJson,
  postJson,
  getBuffer,
  getText,
  download,
  streamTo,
  pool,
  sleep,
  sha1File,
  fileOk,
};
