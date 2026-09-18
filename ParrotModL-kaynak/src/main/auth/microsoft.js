'use strict';
/**
 * Microsoft (MSA) -> Xbox Live -> XSTS -> Minecraft Services authentication.
 *
 * Uses the OAuth 2.0 Device Code flow, so no redirect URI / embedded browser is
 * needed: the user opens a short URL and types a code.
 *
 * The Azure "Application (client) ID" is supplied by the user in Settings.
 */
const net = require('../net');

const DEVICE_CODE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode';
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const XBL_URL = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const MC_LOGIN_URL = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const MC_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile';
const MC_ENTITLEMENTS = 'https://api.minecraftservices.com/entitlements/mcstore';
const SCOPE = 'XboxLive.signin offline_access';

function form(obj) {
  return Object.entries(obj)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
}

async function postForm(url, data) {
  const res = await net.requestRetry(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, attempts: 1 },
    form(data)
  );
  const text = res.body.toString('utf8');
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

/** Step 1: ask Microsoft for a device code. */
async function startDeviceCode(clientId) {
  if (!clientId) {
    throw new Error(
      'Microsoft giriş için Azure "Uygulama (istemci) kimliği" gerekli. Ayarlar > Hesap bölümünden ekleyin.'
    );
  }
  const { status, json, text } = await postForm(DEVICE_CODE_URL, { client_id: clientId, scope: SCOPE });
  if (status !== 200 || !json.device_code) {
    throw new Error('Microsoft cihaz kodu alınamadı: ' + (json.error_description || text.slice(0, 200)));
  }
  return {
    deviceCode: json.device_code,
    userCode: json.user_code,
    verificationUri: json.verification_uri || 'https://microsoft.com/link',
    expiresIn: json.expires_in,
    interval: json.interval || 5,
    message: json.message,
  };
}

/** Step 2: poll until the user finishes signing in. */
async function pollDeviceCode(clientId, deviceCode, { interval = 5, expiresIn = 900, signal } = {}) {
  const deadline = Date.now() + expiresIn * 1000;
  let wait = interval;
  while (Date.now() < deadline) {
    if (signal && signal.cancelled) throw new Error('Giriş iptal edildi.');
    await net.sleep(wait * 1000);
    const { json } = await postForm(TOKEN_URL, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId,
      device_code: deviceCode,
    });
    if (json.access_token) return json;
    if (json.error === 'authorization_pending') continue;
    if (json.error === 'slow_down') {
      wait += 5;
      continue;
    }
    if (json.error === 'expired_token') throw new Error('Giriş kodunun süresi doldu, tekrar deneyin.');
    if (json.error === 'authorization_declined') throw new Error('Giriş reddedildi.');
    if (json.error) throw new Error(json.error_description || json.error);
  }
  throw new Error('Giriş zaman aşımına uğradı.');
}

async function refresh(clientId, refreshToken) {
  const { json } = await postForm(TOKEN_URL, {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
    scope: SCOPE,
  });
  if (!json.access_token) throw new Error('Oturum yenilenemedi: ' + (json.error_description || json.error || ''));
  return json;
}

/** Steps 3-6: Xbox Live -> XSTS -> Minecraft token -> profile */
async function toMinecraft(msAccessToken) {
  const xbl = await net.postJson(XBL_URL, {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: 'd=' + msAccessToken,
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT',
  });
  const xblToken = xbl.Token;
  const uhs = xbl.DisplayClaims && xbl.DisplayClaims.xui && xbl.DisplayClaims.xui[0] && xbl.DisplayClaims.xui[0].uhs;
  if (!xblToken || !uhs) throw new Error('Xbox Live kimlik doğrulaması başarısız.');

  let xsts;
  try {
    xsts = await net.postJson(XSTS_URL, {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT',
    });
  } catch (e) {
    const body = e.bodyText || '';
    if (body.includes('2148916233')) {
      throw new Error('Bu Microsoft hesabına bağlı bir Xbox profili yok. Önce xbox.com üzerinden profil oluşturun.');
    }
    if (body.includes('2148916238')) {
      throw new Error('Bu hesap bir çocuk hesabı; bir aileye eklenmesi gerekiyor.');
    }
    if (body.includes('2148916235')) {
      throw new Error('Xbox Live bu ülkede kullanılamıyor.');
    }
    throw e;
  }
  const xstsToken = xsts.Token;
  const xuid = xsts.DisplayClaims && xsts.DisplayClaims.xui && xsts.DisplayClaims.xui[0] && xsts.DisplayClaims.xui[0].xid;

  let mc;
  try {
    mc = await net.postJson(MC_LOGIN_URL, { identityToken: `XBL3.0 x=${uhs};${xstsToken}` });
  } catch (e) {
    const body = e.bodyText || '';
    if (e.status === 403 && /invalid app registration/i.test(body)) {
      const err = new Error(
        'Azure uygulaman Minecraft tarafında henüz onaylı değil.\n\n' +
          'Microsoft hesabına ve Xbox Live’a giriş başarılı oldu — yani Azure ayarların doğru. ' +
          'Ancak Mojang, üçüncü taraf launcher’ların uygulama kimliğini ayrıca onaydan geçirmeni istiyor. ' +
          'Onay gelene kadar bu hesapla giriş yapılamaz; çevrimdışı hesap sorunsuz çalışır.'
      );
      err.code = 'APP_NOT_APPROVED';
      throw err;
    }
    throw e;
  }
  if (!mc.access_token) throw new Error('Minecraft oturumu alınamadı.');

  const profile = await getProfile(mc.access_token);
  return {
    accessToken: mc.access_token,
    expiresIn: mc.expires_in,
    xuid: xuid || '',
    profile,
  };
}

async function getProfile(mcAccessToken) {
  try {
    const p = await net.getJson(MC_PROFILE_URL, { headers: { Authorization: 'Bearer ' + mcAccessToken } });
    return {
      id: p.id,
      name: p.name,
      skins: p.skins || [],
      capes: p.capes || [],
    };
  } catch (e) {
    if (e.status === 404) {
      throw new Error('Bu hesapta Minecraft: Java Edition yok (satın alınmamış görünüyor).');
    }
    throw e;
  }
}

async function hasGame(mcAccessToken) {
  try {
    const r = await net.getJson(MC_ENTITLEMENTS, { headers: { Authorization: 'Bearer ' + mcAccessToken } });
    return (r.items || []).length > 0;
  } catch {
    return false;
  }
}

function dashUuid(id) {
  if (!id) return '';
  const s = id.replace(/-/g, '');
  if (s.length !== 32) return id;
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

module.exports = {
  startDeviceCode,
  pollDeviceCode,
  refresh,
  toMinecraft,
  getProfile,
  hasGame,
  dashUuid,
};
