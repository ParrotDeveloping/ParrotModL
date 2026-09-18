/* ParrotModL - shared renderer runtime: state, router, UI helpers */
(function () {
  const api = window.api;

  const State = {
    settings: {},
    accounts: [],
    account: null,
    profiles: [],
    running: new Set(),
    progress: new Map(), // profileId -> {stage, percent}
    appInfo: {},
    route: 'home',
    routeParam: null,
    versionsCache: null,
  };
  window.State = State;

  // ------------------------------------------------------------- utilities
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return node;
  };
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const esc = (s) =>
    String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));

  const fmtNum = (n) => {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + 'Mr';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'B';
    return String(n);
  };

  const fmtBytes = (b) => {
    b = Number(b) || 0;
    if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
  };

  const fmtDate = (t) => {
    if (!t) return '-';
    const d = new Date(t);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const fmtAgo = (t) => {
    if (!t) return 'hiç';
    const s = (Date.now() - new Date(t).getTime()) / 1000;
    if (s < 60) return 'az önce';
    if (s < 3600) return Math.floor(s / 60) + ' dk önce';
    if (s < 86400) return Math.floor(s / 3600) + ' sa önce';
    if (s < 2592000) return Math.floor(s / 86400) + ' gün önce';
    if (s < 31536000) return Math.floor(s / 2592000) + ' ay önce';
    return Math.floor(s / 31536000) + ' yıl önce';
  };

  const fmtPlaytime = (sec) => {
    sec = Number(sec) || 0;
    if (sec < 60) return '0 dk';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h ? `${h} sa ${m} dk` : `${m} dk`;
  };

  const LOADER_LABEL = {
    vanilla: 'Vanilla',
    fabric: 'Fabric',
    forge: 'Forge',
    neoforge: 'NeoForge',
    quilt: 'Quilt',
  };
  const LOADER_COLOR = {
    vanilla: '#7f8fae',
    fabric: '#d4b483',
    forge: '#9aa7c7',
    neoforge: '#f07a3f',
    quilt: '#bb7fd4',
  };
  const TYPE_LABEL = {
    mod: 'Mod',
    modpack: 'Mod paketi',
    resourcepack: 'Kaynak paketi',
    shader: 'Shader',
    datapack: 'Veri paketi',
    world: 'Dünya',
  };

  // ------------------------------------------------------------- toasts
  function toast(message, kind = 'info', title = null, ms = 4200) {
    const root = $('#toasts');
    const icon = kind === 'ok' ? Icons.check : kind === 'err' ? Icons.alert : Icons.info;
    const node = el(
      'div',
      { class: `toast ${kind}` },
      el('div', { class: 'ic', html: icon }),
      el('div', { class: 'tx', html: (title ? `<b>${esc(title)}</b>` : '') + esc(message) })
    );
    root.appendChild(node);
    const kill = () => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 220);
    };
    node.addEventListener('click', kill);
    setTimeout(kill, ms);
    return kill;
  }

  // ------------------------------------------------------------- modal
  function modal({ title, subtitle, body, footer, width = '', onClose, closeOnBackdrop = true }) {
    const root = $('#modal-root');
    const overlay = el('div', { class: 'overlay' });
    const box = el('div', { class: 'modal ' + width });
    const head = el(
      'div',
      { class: 'modal-head' },
      el('div', {}, el('h2', { text: title }), subtitle ? el('p', { text: subtitle }) : null),
      el('button', { class: 'btn icon ghost', html: Icons.x, onClick: () => close() })
    );
    const bodyEl = el('div', { class: 'modal-body' });
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);

    box.appendChild(head);
    box.appendChild(bodyEl);
    if (footer) {
      const f = el('div', { class: 'modal-foot' });
      (Array.isArray(footer) ? footer : [footer]).forEach((b) => f.appendChild(b));
      box.appendChild(f);
    }
    overlay.appendChild(box);
    root.appendChild(overlay);

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    if (closeOnBackdrop) {
      overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) close();
      });
    }
    return { close, body: bodyEl, box, overlay };
  }

  function confirmDialog({ title, message, confirmText = 'Evet', danger = false }) {
    return new Promise((resolve) => {
      let done = false;
      const m = modal({
        title,
        body: el('p', { text: message, style: { color: 'var(--text-2)' } }),
        footer: [
          el('button', {
            class: 'btn',
            text: 'Vazgeç',
            onClick: () => {
              done = true;
              m.close();
              resolve(false);
            },
          }),
          el('button', {
            class: 'btn ' + (danger ? 'danger' : 'primary'),
            text: confirmText,
            onClick: () => {
              done = true;
              m.close();
              resolve(true);
            },
          }),
        ],
        onClose: () => {
          if (!done) resolve(false);
        },
      });
    });
  }

  function promptDialog({ title, label, value = '', placeholder = '', confirmText = 'Kaydet' }) {
    return new Promise((resolve) => {
      let done = false;
      const input = el('input', { class: 'input', value, placeholder });
      const m = modal({
        title,
        body: el('div', { class: 'field' }, el('label', { text: label }), input),
        footer: [
          el('button', {
            class: 'btn',
            text: 'Vazgeç',
            onClick: () => {
              done = true;
              m.close();
              resolve(null);
            },
          }),
          el('button', {
            class: 'btn primary',
            text: confirmText,
            onClick: () => {
              done = true;
              m.close();
              resolve(input.value.trim());
            },
          }),
        ],
        onClose: () => {
          if (!done) resolve(null);
        },
      });
      setTimeout(() => input.focus(), 40);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          done = true;
          m.close();
          resolve(input.value.trim());
        }
      });
    });
  }

  // ------------------------------------------------------------- context menu
  function contextMenu(x, y, items) {
    $$('.ctx').forEach((c) => c.remove());
    const menu = el('div', { class: 'ctx' });
    for (const it of items) {
      if (it === '-') {
        menu.appendChild(el('hr'));
        continue;
      }
      menu.appendChild(
        el(
          'button',
          {
            class: it.danger ? 'danger' : '',
            onClick: () => {
              menu.remove();
              it.onClick();
            },
          },
          it.icon ? el('span', { html: it.icon, style: { display: 'flex' } }) : null,
          it.label
        )
      );
    }
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
    const off = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('mousedown', off);
        document.removeEventListener('wheel', off);
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', off);
      document.addEventListener('wheel', off);
    }, 0);
    return menu;
  }

  // ------------------------------------------------------------- theme
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [47, 123, 255];
  }
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt))).toString(16).padStart(2, '0');
    return `#${f(r)}${f(g)}${f(b)}`;
  }

  function applyTheme(s) {
    const root = document.documentElement;
    const accent = s.accent || '#2f7bff';
    const [r, g, b] = hexToRgb(accent);
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-700', shade(accent, -34));
    root.style.setProperty('--accent-soft', `rgba(${r},${g},${b},0.14)`);
    root.style.setProperty('--accent-soft-2', `rgba(${r},${g},${b},0.26)`);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    root.style.setProperty('--accent-text', lum > 0.62 ? '#0b1220' : '#ffffff');
    root.setAttribute('data-theme', s.theme || 'dark');
    root.setAttribute('data-anim', s.animations === false ? 'off' : 'on');
    root.setAttribute('data-compact', s.compactCards ? 'on' : 'off');
    root.style.fontSize = (s.fontScale || 100) / 100 * 16 + 'px';
    const bg = $('#bg-layer');
    if (s.bgImage) {
      bg.style.backgroundImage = `url("${s.bgImage.replace(/"/g, '\\"')}")`;
      bg.classList.add('on');
    } else {
      bg.classList.remove('on');
      bg.style.backgroundImage = '';
    }
  }

  // ------------------------------------------------------------- router
  const NAV = [
    { id: 'home', label: 'Ana Sayfa', icon: () => Icons.home },
    { id: 'skins', label: 'Skin Seçici', icon: () => Icons.skin },
    { id: 'discover', label: 'Keşfet', icon: () => Icons.compass },
    { id: 'screenshots', label: 'Ekran Görüntüleri', icon: () => Icons.image },
    { id: 'settings', label: 'Ayarlar', icon: () => Icons.settings },
  ];

  function renderNav() {
    const nav = $('#nav');
    nav.innerHTML = '';
    for (const item of NAV) {
      nav.appendChild(
        el(
          'button',
          {
            class: 'nav-item' + (State.route === item.id ? ' active' : ''),
            onClick: () => go(item.id),
          },
          el('span', { html: item.icon(), style: { display: 'flex' } }),
          item.label
        )
      );
    }
  }

  const Views = {};
  window.Views = Views;

  let currentCleanup = null;
  async function go(route, param = null) {
    if (currentCleanup) {
      try {
        currentCleanup();
      } catch {}
      currentCleanup = null;
    }
    State.route = route;
    State.routeParam = param;
    renderNav();
    const host = $('#view');
    host.innerHTML = '';
    // geçiş animasyonunu yeniden tetikle
    host.classList.remove('view');
    void host.offsetWidth;
    host.classList.add('view');
    const view = Views[route];
    if (!view) {
      host.appendChild(el('div', { class: 'empty' }, el('h3', { text: 'Sayfa bulunamadı' })));
      return;
    }
    try {
      const res = await view.render(host, param);
      if (typeof res === 'function') currentCleanup = res;
    } catch (e) {
      console.error(e);
      host.appendChild(
        el(
          'div',
          { class: 'empty' },
          el('span', { html: Icons.alert }),
          el('h3', { text: 'Bir şeyler ters gitti' }),
          el('p', { text: e.message, style: { userSelect: 'text', maxWidth: '520px' } })
        )
      );
    }
    $('#main').scrollTop = 0;
  }

  function refreshRoute() {
    return go(State.route, State.routeParam);
  }

  // ------------------------------------------------------------- data
  async function loadProfiles() {
    State.profiles = await api.profiles.list();
    return State.profiles;
  }
  async function loadAccounts() {
    State.accounts = await api.accounts.list();
    State.account = State.accounts.find((a) => a.active) || State.accounts[0] || null;
    renderAccountCard();
    return State.accounts;
  }

  function renderAccountCard() {
    const a = State.account;
    const nm = $('#acc-name');
    const ty = $('#acc-type');
    const ph = $('#acc-avatar-ph');
    if (!a) {
      nm.textContent = 'Hesap yok';
      ty.textContent = 'Giriş yapmak için tıkla';
      ph.style.backgroundImage = '';
      ph.innerHTML = '';
      return;
    }
    nm.textContent = a.name;
    ty.textContent = a.type === 'microsoft' ? 'Microsoft' : 'Çevrimdışı';
    if (a.avatar) {
      ph.style.backgroundImage = `url("${a.avatar}")`;
      ph.style.backgroundSize = 'cover';
    } else {
      ph.style.backgroundImage = '';
    }
  }

  // ------------------------------------------------------------- helpers UI
  function sourceChip(source) {
    return source === 'curseforge'
      ? '<span class="chip cf">CurseForge</span>'
      : '<span class="chip mr">Modrinth</span>';
  }

  function loaderChip(loader) {
    const c = LOADER_COLOR[loader] || 'var(--text-3)';
    return `<span class="chip" style="color:${c};background:${c}22">${LOADER_LABEL[loader] || loader}</span>`;
  }

  function emptyState(icon, title, text, action) {
    return el(
      'div',
      { class: 'empty' },
      el('span', { html: icon }),
      el('h3', { text: title }),
      text ? el('p', { text, style: { maxWidth: '440px' } }) : null,
      action || null
    );
  }

  function spinnerBlock(text) {
    return el(
      'div',
      { class: 'loading-block' },
      el('div', { style: { display: 'grid', placeItems: 'center', gap: '10px' } },
        el('div', { class: 'spinner' }),
        text ? el('div', { text, style: { color: 'var(--text-3)', fontSize: '12.5px' } }) : null)
    );
  }

  function debounce(fn, ms = 320) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function iconImg(url, fallbackText, cls = 'ic') {
    if (url) {
      const img = el('img', { class: cls, src: url, loading: 'lazy' });
      img.addEventListener('error', () => {
        const ph = el('div', { class: cls + ' ph', text: (fallbackText || '?')[0].toUpperCase() });
        img.replaceWith(ph);
      });
      return img;
    }
    return el('div', { class: cls + ' ph', text: (fallbackText || '?')[0].toUpperCase() });
  }

  window.UI = {
    el,
    $,
    $$,
    esc,
    fmtNum,
    fmtBytes,
    fmtDate,
    fmtAgo,
    fmtPlaytime,
    toast,
    modal,
    confirmDialog,
    promptDialog,
    contextMenu,
    applyTheme,
    go,
    refreshRoute,
    renderNav,
    loadProfiles,
    loadAccounts,
    renderAccountCard,
    sourceChip,
    loaderChip,
    emptyState,
    spinnerBlock,
    debounce,
    iconImg,
    LOADER_LABEL,
    LOADER_COLOR,
    TYPE_LABEL,
    NAV,
  };
})();
