'use strict';
/** Account store: Microsoft + offline accounts. */
const crypto = require('crypto');
const ms = require('./microsoft');

/** Mojang's offline UUID: md5 of "OfflinePlayer:<name>", version 3 */
function offlineUuid(name) {
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

class Accounts {
  constructor(store) {
    this.store = store;
  }

  list() {
    return this.store.accounts.list.map((a) => this.publicView(a));
  }

  publicView(a) {
    return {
      id: a.id,
      type: a.type,
      name: a.name,
      uuid: a.uuid,
      avatar: a.uuid ? `https://mc-heads.net/avatar/${a.uuid.replace(/-/g, '')}/64` : '',
      skins: a.skins || [],
      capes: a.capes || [],
      expiresAt: a.expiresAt || 0,
      active: this.store.accounts.active === a.id,
    };
  }

  active() {
    const id = this.store.accounts.active;
    return this.store.accounts.list.find((a) => a.id === id) || this.store.accounts.list[0] || null;
  }

  setActive(id) {
    if (!this.store.accounts.list.some((a) => a.id === id)) throw new Error('Hesap bulunamadı.');
    this.store.accounts.active = id;
    this.store.saveAccounts();
    return this.list();
  }

  remove(id) {
    this.store.accounts.list = this.store.accounts.list.filter((a) => a.id !== id);
    if (this.store.accounts.active === id) {
      this.store.accounts.active = this.store.accounts.list[0] ? this.store.accounts.list[0].id : null;
    }
    this.store.saveAccounts();
    return this.list();
  }

  addOffline(name) {
    const clean = String(name || '').trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(clean)) {
      throw new Error('Geçersiz isim. 3-16 karakter, sadece harf, rakam ve alt çizgi kullanın.');
    }
    const uuid = offlineUuid(clean);
    const existing = this.store.accounts.list.find((a) => a.type === 'offline' && a.name === clean);
    if (existing) {
      this.store.accounts.active = existing.id;
      this.store.saveAccounts();
      return this.list();
    }
    const acc = {
      id: 'off_' + uuid.slice(0, 8),
      type: 'offline',
      name: clean,
      uuid,
      accessToken: '0',
    };
    this.store.accounts.list.push(acc);
    this.store.accounts.active = acc.id;
    this.store.saveAccounts();
    return this.list();
  }

  upsertMicrosoft({ msToken, mcSession }) {
    const uuid = ms.dashUuid(mcSession.profile.id);
    const id = 'ms_' + mcSession.profile.id;
    const acc = {
      id,
      type: 'microsoft',
      name: mcSession.profile.name,
      uuid,
      accessToken: mcSession.accessToken,
      xuid: mcSession.xuid,
      expiresAt: Date.now() + (mcSession.expiresIn || 86400) * 1000 - 60000,
      refreshToken: msToken.refresh_token,
      skins: mcSession.profile.skins || [],
      capes: mcSession.profile.capes || [],
    };
    const idx = this.store.accounts.list.findIndex((a) => a.id === id);
    if (idx >= 0) this.store.accounts.list[idx] = acc;
    else this.store.accounts.list.push(acc);
    this.store.accounts.active = id;
    this.store.saveAccounts();
    return acc;
  }

  /** Ensures the active account has a valid token before launching. */
  async ensureValid(account, clientId) {
    if (!account) throw new Error('Hesap seçilmedi.');
    if (account.type !== 'microsoft') return account;
    if (account.expiresAt && Date.now() < account.expiresAt) return account;
    if (!account.refreshToken) throw new Error('Oturum süresi doldu, Microsoft hesabına tekrar giriş yapın.');
    const msToken = await ms.refresh(clientId, account.refreshToken);
    const mcSession = await ms.toMinecraft(msToken.access_token);
    return this.upsertMicrosoft({ msToken, mcSession });
  }

  async refreshProfile(account) {
    if (!account || account.type !== 'microsoft') return account;
    const p = await ms.getProfile(account.accessToken);
    account.skins = p.skins || [];
    account.capes = p.capes || [];
    account.name = p.name;
    this.store.saveAccounts();
    return account;
  }

  raw(id) {
    return this.store.accounts.list.find((a) => a.id === id) || null;
  }
}

module.exports = { Accounts, offlineUuid };
