'use strict';
/** Skin library + Minecraft Services skin/cape API. */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const net = require('./net');
const P = require('./paths');

const SKIN_URL = 'https://api.minecraftservices.com/minecraft/profile/skins';
const ACTIVE_SKIN = 'https://api.minecraftservices.com/minecraft/profile/skins/active';
const ACTIVE_CAPE = 'https://api.minecraftservices.com/minecraft/profile/capes/active';

class Skins {
  constructor(store) {
    this.store = store;
  }

  list() {
    return this.store.skins.map((s) => ({
      ...s,
      dataUrl: this.readDataUrl(s.file),
    }));
  }

  readDataUrl(file) {
    try {
      const buf = fs.readFileSync(path.join(P.skins(), file));
      return 'data:image/png;base64,' + buf.toString('base64');
    } catch {
      return '';
    }
  }

  /** Add a skin from a local PNG file or a base64 data url. */
  async add({ name, variant = 'classic', filePath, dataUrl }) {
    let buf;
    if (filePath) buf = await fsp.readFile(filePath);
    else if (dataUrl) buf = Buffer.from(String(dataUrl).split(',').pop(), 'base64');
    else throw new Error('Skin dosyası gerekli.');

    validatePng(buf);
    const id = crypto.randomBytes(6).toString('hex');
    const file = `${id}.png`;
    await fsp.writeFile(path.join(P.skins(), file), buf);
    const entry = {
      id,
      name: name || (filePath ? path.basename(filePath, path.extname(filePath)) : 'Skin'),
      variant,
      file,
      addedAt: Date.now(),
    };
    this.store.skins.unshift(entry);
    this.store.saveSkins();
    return { ...entry, dataUrl: this.readDataUrl(file) };
  }

  async addFromUsername(username) {
    const clean = String(username || '').trim();
    if (!clean) throw new Error('Kullanıcı adı gerekli.');
    const buf = await net.getBuffer(`https://mc-heads.net/skin/${encodeURIComponent(clean)}`);
    validatePng(buf);
    return this.add({ name: clean, dataUrl: 'data:image/png;base64,' + buf.toString('base64') });
  }

  rename(id, name) {
    const s = this.store.skins.find((x) => x.id === id);
    if (!s) throw new Error('Skin bulunamadı.');
    s.name = name;
    this.store.saveSkins();
    return this.list();
  }

  setVariant(id, variant) {
    const s = this.store.skins.find((x) => x.id === id);
    if (!s) throw new Error('Skin bulunamadı.');
    s.variant = variant === 'slim' ? 'slim' : 'classic';
    this.store.saveSkins();
    return this.list();
  }

  remove(id) {
    const s = this.store.skins.find((x) => x.id === id);
    if (s) {
      try {
        fs.unlinkSync(path.join(P.skins(), s.file));
      } catch {}
    }
    this.store.skins = this.store.skins.filter((x) => x.id !== id);
    this.store.saveSkins();
    return this.list();
  }

  /** Upload a stored skin to the signed-in Microsoft account. */
  async apply(accessToken, skinId) {
    const s = this.store.skins.find((x) => x.id === skinId);
    if (!s) throw new Error('Skin bulunamadı.');
    const buf = await fsp.readFile(path.join(P.skins(), s.file));
    return uploadSkin(accessToken, buf, s.variant, s.file);
  }

  async resetSkin(accessToken) {
    const res = await net.requestRetry(ACTIVE_SKIN, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + accessToken },
      attempts: 1,
    });
    if (res.status >= 300) throw new Error('Skin sıfırlanamadı (HTTP ' + res.status + ').');
    return true;
  }

  async setCape(accessToken, capeId) {
    if (!capeId) {
      const res = await net.requestRetry(ACTIVE_CAPE, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + accessToken },
        attempts: 1,
      });
      if (res.status >= 300) throw new Error('Pelerin kaldırılamadı (HTTP ' + res.status + ').');
      return true;
    }
    const res = await net.requestRetry(
      ACTIVE_CAPE,
      {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        attempts: 1,
      },
      JSON.stringify({ capeId })
    );
    if (res.status >= 300) throw new Error('Pelerin ayarlanamadı (HTTP ' + res.status + ').');
    return true;
  }
}

/** multipart/form-data upload to Minecraft Services */
function uploadSkin(accessToken, pngBuffer, variant, filename = 'skin.png') {
  const boundary = '----ParrotModL' + crypto.randomBytes(12).toString('hex');
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="variant"\r\n\r\n${variant}\r\n`));
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: image/png\r\n\r\n`
    )
  );
  parts.push(pngBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const https = require('https');
    const req = https.request(
      {
        hostname: 'api.minecraftservices.com',
        path: '/minecraft/profile/skins',
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'multipart/form-data; boundary=' + boundary,
          'Content-Length': body.length,
          'User-Agent': net.UA,
        },
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 300) {
            return reject(new Error(`Skin yüklenemedi (HTTP ${res.statusCode}): ${text.slice(0, 200)}`));
          }
          try {
            resolve(JSON.parse(text));
          } catch {
            resolve({ ok: true });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Skin yükleme zaman aşımı.')));
    req.write(body);
    req.end();
  });
}

function validatePng(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf || buf.length < 24 || !buf.subarray(0, 8).equals(sig)) throw new Error('Dosya geçerli bir PNG değil.');
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const ok = (w === 64 && (h === 64 || h === 32)) || (w === 128 && h === 128);
  if (!ok) throw new Error(`Skin boyutu 64x64 olmalı (bulunan: ${w}x${h}).`);
  return { width: w, height: h };
}

module.exports = { Skins, uploadSkin, validatePng, SKIN_URL };
