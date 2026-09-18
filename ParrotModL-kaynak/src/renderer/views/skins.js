/* Skin Seçici - kütüphane, 3B önizleme, pelerin seçimi */
(function () {
  const { el, toast, modal, confirmDialog, promptDialog, emptyState, spinnerBlock, contextMenu, esc } = window.UI;
  const api = window.api;
  const State = window.State;

  // ---------------------------------------------------------------- model
  const S = 9; // px per minecraft unit

  const BOX = {
    head: { w: 8, h: 8, d: 8, uv: { r: [0, 8], f: [8, 8], l: [16, 8], b: [24, 8], t: [8, 0], m: [16, 0] } },
    hat: { w: 8, h: 8, d: 8, uv: { r: [32, 8], f: [40, 8], l: [48, 8], b: [56, 8], t: [40, 0], m: [48, 0] }, inflate: 0.55 },
    body: { w: 8, h: 12, d: 4, uv: { r: [16, 20], f: [20, 20], l: [28, 20], b: [32, 20], t: [20, 16], m: [28, 16] } },
    jacket: { w: 8, h: 12, d: 4, uv: { r: [16, 36], f: [20, 36], l: [28, 36], b: [32, 36], t: [20, 32], m: [28, 32] }, inflate: 0.4 },
    armR: { w: 4, h: 12, d: 4, uv: { r: [40, 20], f: [44, 20], l: [48, 20], b: [52, 20], t: [44, 16], m: [48, 16] } },
    sleeveR: { w: 4, h: 12, d: 4, uv: { r: [40, 36], f: [44, 36], l: [48, 36], b: [52, 36], t: [44, 32], m: [48, 32] }, inflate: 0.4 },
    armL: { w: 4, h: 12, d: 4, uv: { r: [32, 52], f: [36, 52], l: [40, 52], b: [44, 52], t: [36, 48], m: [40, 48] } },
    sleeveL: { w: 4, h: 12, d: 4, uv: { r: [48, 52], f: [52, 52], l: [56, 52], b: [60, 52], t: [52, 48], m: [56, 48] }, inflate: 0.4 },
    legR: { w: 4, h: 12, d: 4, uv: { r: [0, 20], f: [4, 20], l: [8, 20], b: [12, 20], t: [4, 16], m: [8, 16] } },
    pantR: { w: 4, h: 12, d: 4, uv: { r: [0, 36], f: [4, 36], l: [8, 36], b: [12, 36], t: [4, 32], m: [8, 32] }, inflate: 0.4 },
    legL: { w: 4, h: 12, d: 4, uv: { r: [16, 52], f: [20, 52], l: [24, 52], b: [28, 52], t: [20, 48], m: [24, 48] } },
    pantL: { w: 4, h: 12, d: 4, uv: { r: [0, 52], f: [4, 52], l: [8, 52], b: [12, 52], t: [4, 48], m: [8, 48] }, inflate: 0.4 },
  };

  // 64x32 eski skinlerde sol uzuvlar sağın aynası
  const LEGACY_MIRROR = { armL: 'armR', legL: 'legR' };

  function cropFace(img, sx, sy, sw, sh, scale, flip) {
    const c = document.createElement('canvas');
    c.width = sw * scale;
    c.height = sh * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (flip) {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, sx * scale, sy * scale, sw * scale, sh * scale, 0, 0, sw * scale, sh * scale);
    return c.toDataURL();
  }

  function buildCube(img, spec, texScale, { slim = false, flipSides = false } = {}) {
    const w = slim && spec.w === 4 ? 3 : spec.w;
    const inflate = spec.inflate || 0;
    const W = (w + inflate) * S;
    const H = (spec.h + inflate) * S;
    const D = (spec.d + inflate) * S;
    const uw = w;

    const cube = el('div', { class: 'cube' });
    const face = (dataUrl, fw, fh, transform) => {
      const d = el('div', {
        style: {
          width: fw + 'px',
          height: fh + 'px',
          marginLeft: -fw / 2 + 'px',
          marginTop: -fh / 2 + 'px',
          backgroundImage: `url(${dataUrl})`,
          backgroundSize: '100% 100%',
          transform,
        },
      });
      cube.appendChild(d);
    };

    const u = spec.uv;
    const crop = (pos, cw, ch, flip) => cropFace(img, pos[0], pos[1], cw, ch, texScale, flip);

    // front (+Z), back (-Z), right (+X yüzü), left (-X), top, bottom
    face(crop(u.f, uw, spec.h, flipSides), W, H, `translateZ(${D / 2}px)`);
    face(crop(u.b, uw, spec.h, flipSides), W, H, `rotateY(180deg) translateZ(${D / 2}px)`);
    face(crop(u.l, spec.d, spec.h, flipSides), D, H, `rotateY(90deg) translateZ(${W / 2}px)`);
    face(crop(u.r, spec.d, spec.h, flipSides), D, H, `rotateY(-90deg) translateZ(${W / 2}px)`);
    face(crop(u.t, uw, spec.d, flipSides), W, D, `rotateX(90deg) translateZ(${H / 2}px)`);
    face(crop(u.m, uw, spec.d, flipSides), W, D, `rotateX(-90deg) translateZ(${H / 2}px)`);
    return cube;
  }

  function buildPlayer(img, { slim = false, capeImg = null } = {}) {
    const texScale = Math.max(1, Math.round(img.width / 64));
    const legacy = img.height === 32;

    const root = el('div', { class: 'player' });
    const place = (node, x, y, z = 0) => {
      node.style.transform = `translate3d(${x * S}px, ${y * S}px, ${z * S}px)`;
      root.appendChild(node);
    };

    const add = (key, x, y, z) => {
      let spec = BOX[key];
      let flip = false;
      if (legacy && LEGACY_MIRROR[key]) {
        spec = BOX[LEGACY_MIRROR[key]];
        flip = true;
      }
      if (legacy && /^(jacket|sleeve|pant|armL|legL)/.test(key) && !LEGACY_MIRROR[key]) return;
      const cube = buildCube(img, spec, texScale, { slim, flipSides: flip });
      place(cube, x, y, z);
    };

    const armX = slim ? 5.5 : 6;

    add('body', 0, 0);
    add('head', 0, -10);
    add('armR', -armX, 0);
    add('armL', armX, 0);
    add('legR', -2, 12);
    add('legL', 2, 12);
    // overlay katmanları
    add('hat', 0, -10);
    if (!legacy) {
      add('jacket', 0, 0);
      add('sleeveR', -armX, 0);
      add('sleeveL', armX, 0);
      add('pantR', -2, 12);
      add('pantL', 2, 12);
    }

    if (capeImg) {
      const cs = Math.max(1, Math.round(capeImg.width / 64));
      const spec = {
        w: 10,
        h: 16,
        d: 1,
        uv: { f: [12, 1], b: [1, 1], l: [0, 1], r: [11, 1], t: [1, 0], m: [11, 0] },
      };
      const cube = buildCube(capeImg, spec, cs, {});
      cube.style.transform = `translate3d(0px, ${2 * S}px, ${-2.6 * S}px) rotateX(-9deg)`;
      root.appendChild(cube);
    }

    return root;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Görsel yüklenemedi'));
      img.src = src;
    });
  }

  /** küçük 2B yüz önizlemesi (kütüphane kartları için) */
  function faceThumb(img, size = 72) {
    const s = Math.max(1, Math.round(img.width / 64));
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 8 * s, 8 * s, 8 * s, 8 * s, 0, 0, size, size);
    try {
      ctx.drawImage(img, 40 * s, 8 * s, 8 * s, 8 * s, 0, 0, size, size);
    } catch {}
    return c;
  }

  function capeThumb(img, h = 64) {
    const s = Math.max(1, Math.round(img.width / 64));
    const c = document.createElement('canvas');
    c.width = Math.round((10 / 16) * h);
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 1 * s, 1 * s, 10 * s, 16 * s, 0, 0, c.width, c.height);
    return c;
  }

  // ---------------------------------------------------------------- view
  let selectedSkin = null;
  let stageHost = null;
  let currentCapeUrl = null;

  async function render(host) {
    const skins = await api.skins.list();
    await window.UI.loadAccounts();
    const acc = State.account;

    host.appendChild(
      el(
        'div',
        { class: 'page-head' },
        el(
          'div',
          {},
          el('h1', { text: 'Skin Seçici' }),
          el('p', { text: 'Skinlerini kaydet, önizle ve Microsoft hesabına uygula. Pelerinini de buradan seç.' })
        ),
        el(
          'div',
          { class: 'head-actions' },
          el('button', { class: 'btn', html: Icons.user + '<span>Kullanıcı adından al</span>', onClick: fromUsername }),
          el('button', { class: 'btn primary', html: Icons.plus + '<span>Skin Ekle</span>', onClick: addSkin })
        )
      )
    );

    stageHost = el('div', { class: 'skin-stage' });
    const stageWrap = el(
      'div',
      { style: { display: 'grid', gap: '12px' } },
      stageHost,
      el(
        'div',
        { style: { display: 'flex', gap: '8px' } },
        el('button', {
          class: 'btn primary',
          style: { flex: 1 },
          html: Icons.upload + '<span>Hesaba uygula</span>',
          id: 'apply-skin',
          onClick: applySelected,
        }),
        el('button', {
          class: 'btn',
          html: Icons.refresh,
          title: 'Varsayılana döndür',
          onClick: resetSkin,
        })
      ),
      acc && acc.type !== 'microsoft'
        ? el('div', {
            class: 'card',
            style: { padding: '11px 13px', fontSize: '12px', color: 'var(--amber)', background: 'rgba(255,176,46,.08)', borderColor: 'rgba(255,176,46,.25)' },
            text: 'Çevrimdışı hesapla skin sunucuya yüklenemez. Kütüphane ve önizleme çalışır; uygulamak için Microsoft hesabı gerekir.',
          })
        : null
    );

    const rightCol = el('div', { style: { display: 'grid', gap: '22px' } });

    // ---- kütüphane
    const lib = el('div', { class: 'skin-grid' });
    const libSection = el(
      'div',
      {},
      el('h3', { text: 'Skin kütüphanem', style: { fontSize: '15px', marginBottom: '10px' } }),
      lib
    );
    rightCol.appendChild(libSection);

    if (!skins.length) {
      lib.replaceWith(
        emptyState(
          Icons.skin,
          'Kütüphane boş',
          'Bilgisayarından 64x64 bir PNG ekle ya da bir oyuncunun kullanıcı adından skin çek.',
          el('button', { class: 'btn primary', html: Icons.plus + '<span>Skin Ekle</span>', onClick: addSkin })
        )
      );
    } else {
      for (const s of skins) lib.appendChild(await skinTile(s));
    }

    // ---- pelerinler
    const capeSection = el('div', {}, el('h3', { text: 'Pelerinler', style: { fontSize: '15px', marginBottom: '10px' } }));
    const capeGrid = el('div', { class: 'cape-grid' });
    capeSection.appendChild(capeGrid);
    rightCol.appendChild(capeSection);

    if (!acc || acc.type !== 'microsoft') {
      capeGrid.replaceWith(
        el('div', {
          class: 'card',
          style: { fontSize: '12.5px', color: 'var(--text-3)' },
          text: 'Pelerinler Microsoft hesabına bağlıdır. Giriş yaptığında hesabındaki pelerinler burada listelenir.',
        })
      );
    } else if (!acc.capes || !acc.capes.length) {
      capeGrid.replaceWith(
        el('div', {
          class: 'card',
          style: { fontSize: '12.5px', color: 'var(--text-3)' },
          text: 'Bu hesapta pelerin yok.',
        })
      );
    } else {
      capeGrid.appendChild(capeTile({ id: '', alias: 'Pelerinsiz', url: '' }, acc));
      for (const c of acc.capes) capeGrid.appendChild(capeTile(c, acc));
    }

    host.appendChild(el('div', { class: 'skin-layout' }, stageWrap, rightCol));

    // aktif skini yükle: hesaptaki skin varsa onu göster
    const activeSkinUrl =
      acc && acc.skins && acc.skins.find((s) => s.state === 'ACTIVE')
        ? acc.skins.find((s) => s.state === 'ACTIVE').url
        : null;
    const activeCape = acc && acc.capes ? acc.capes.find((c) => c.state === 'ACTIVE') : null;
    currentCapeUrl = activeCape ? activeCape.url : window.__testCape || null;

    if (skins.length) {
      selectSkin(skins[0], lib.firstElementChild);
    } else if (activeSkinUrl) {
      renderStage(activeSkinUrl, acc && acc.skins[0] && acc.skins[0].variant === 'SLIM' ? 'slim' : 'classic');
    } else {
      stageHost.appendChild(
        el('div', { style: { color: 'var(--text-3)', fontSize: '13px', textAlign: 'center', padding: '20px' }, text: 'Önizlemek için bir skin ekle' })
      );
    }
  }

  async function skinTile(s) {
    const tile = el('div', { class: 'skin-tile', 'data-id': s.id });
    const prev = el('div', { class: 'prev' });
    tile.appendChild(prev);
    tile.appendChild(
      el(
        'div',
        { class: 'lbl' },
        el('span', { text: s.name, title: s.name, style: { overflow: 'hidden', textOverflow: 'ellipsis' } }),
        el('small', { text: s.variant === 'slim' ? 'ince' : 'klasik' })
      )
    );
    try {
      const img = await loadImage(s.dataUrl);
      prev.appendChild(faceThumb(img, 74));
    } catch {
      prev.appendChild(el('div', { text: '?', style: { color: 'var(--text-3)' } }));
    }
    tile.addEventListener('click', () => selectSkin(s, tile));
    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextMenu(e.clientX, e.clientY, [
        { label: 'Hesaba uygula', icon: Icons.upload, onClick: () => applySkin(s.id) },
        {
          label: s.variant === 'slim' ? 'Klasik kol yap' : 'İnce kol (Alex) yap',
          icon: Icons.edit,
          onClick: async () => {
            await api.skins.variant(s.id, s.variant === 'slim' ? 'classic' : 'slim');
            window.UI.refreshRoute();
          },
        },
        {
          label: 'Yeniden adlandır',
          icon: Icons.edit,
          onClick: async () => {
            const name = await promptDialog({ title: 'Skin adı', label: 'Yeni ad', value: s.name });
            if (!name) return;
            await api.skins.rename(s.id, name);
            window.UI.refreshRoute();
          },
        },
        '-',
        {
          label: 'Sil',
          icon: Icons.trash,
          danger: true,
          onClick: async () => {
            await api.skins.remove(s.id);
            window.UI.refreshRoute();
          },
        },
      ]);
    });
    return tile;
  }

  function capeTile(cape, acc) {
    const active = (cape.id || '') === ((acc.capes.find((c) => c.state === 'ACTIVE') || {}).id || '');
    const tile = el('div', { class: 'cape-tile' + (active ? ' sel' : '') });
    const holder = el('div', { style: { height: '64px', display: 'grid', placeItems: 'center' } });
    tile.appendChild(holder);
    tile.appendChild(el('span', { text: cape.alias || 'Pelerin' }));
    if (cape.url) {
      api.skins
        .fetchImage(cape.url)
        .then(loadImage)
        .then((img) => holder.appendChild(capeThumb(img, 64)))
        .catch(() => holder.appendChild(el('div', { text: '?', style: { color: 'var(--text-3)' } })));
    } else {
      holder.appendChild(el('div', { html: Icons.x, style: { width: '26px', color: 'var(--text-3)' } }));
    }
    tile.addEventListener('click', async () => {
      try {
        await api.skins.setCape(cape.id || null);
        toast(cape.id ? `"${cape.alias || 'Pelerin'}" seçildi.` : 'Pelerin kaldırıldı.', 'ok');
        await window.UI.loadAccounts();
        window.UI.refreshRoute();
      } catch (e) {
        toast(e.message, 'err');
      }
    });
    return tile;
  }

  function selectSkin(s, tile) {
    selectedSkin = s;
    document.querySelectorAll('.skin-tile').forEach((t) => t.classList.toggle('sel', t === tile));
    renderStage(s.dataUrl, s.variant);
  }

  async function renderStage(src, variant) {
    stageHost.innerHTML = '';
    stageHost.appendChild(el('div', { class: 'spinner' }));
    try {
      const img = await loadImage(src);
      let capeImg = null;
      if (currentCapeUrl) {
        try {
          const src = currentCapeUrl.startsWith('data:')
            ? currentCapeUrl
            : await api.skins.fetchImage(currentCapeUrl);
          capeImg = await loadImage(src);
        } catch {}
      }
      const player = buildPlayer(img, { slim: variant === 'slim', capeImg });
      stageHost.innerHTML = '';
      const pivot = el(
        'div',
        {
          style: {
            transformStyle: 'preserve-3d',
            transform: 'translateY(-10px)',
          },
        },
        player
      );
      stageHost.appendChild(pivot);
      stageHost.appendChild(el('div', { class: 'hintbar', text: 'Döndürmek için sürükle · çift tık: otomatik döndür' }));
      attachDrag(stageHost, player);
    } catch (e) {
      stageHost.innerHTML = '';
      stageHost.appendChild(el('div', { style: { color: 'var(--red)', fontSize: '12.5px' }, text: e.message }));
    }
  }

  function attachDrag(stage, player) {
    let ry = -22;
    let rx = 6;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let auto = true;
    let raf = null;

    const apply = () => {
      player.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    };
    apply();

    const tick = () => {
      if (auto) {
        ry += 0.35;
        apply();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    stage.addEventListener('mousedown', (e) => {
      dragging = true;
      auto = false;
      lastX = e.clientX;
      lastY = e.clientY;
      stage.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      ry += (e.clientX - lastX) * 0.55;
      rx = Math.max(-45, Math.min(45, rx - (e.clientY - lastY) * 0.35));
      lastX = e.clientX;
      lastY = e.clientY;
      apply();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      stage.style.cursor = '';
    });
    stage.addEventListener('dblclick', () => (auto = !auto));

    const observer = new MutationObserver(() => {
      if (!document.body.contains(stage)) {
        cancelAnimationFrame(raf);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------- actions
  async function addSkin() {
    const nameInput = el('input', { class: 'input', placeholder: 'Skin adı (isteğe bağlı)' });
    const variantSeg = el('div', { class: 'seg' });
    let variant = 'classic';
    for (const [v, t] of [['classic', 'Klasik (4px kol)'], ['slim', 'İnce / Alex (3px)']]) {
      variantSeg.appendChild(
        el('button', {
          class: v === variant ? 'active' : '',
          text: t,
          onClick: (e) => {
            variant = v;
            [...variantSeg.children].forEach((c) => c.classList.toggle('active', c === e.currentTarget));
          },
        })
      );
    }

    const drop = el('div', {
      style: {
        border: '1.5px dashed var(--border-strong)',
        borderRadius: '14px',
        padding: '26px',
        textAlign: 'center',
        color: 'var(--text-3)',
        cursor: 'pointer',
        fontSize: '13px',
      },
      html: Icons.upload + '<div style="margin-top:8px">PNG dosyasını buraya sürükle ya da tıkla</div>',
    });
    const fileInput = el('input', { type: 'file', accept: 'image/png', style: { display: 'none' } });
    let dataUrl = '';
    const preview = el('div', { style: { display: 'grid', placeItems: 'center', minHeight: '0' } });

    const handleFile = (f) => {
      if (!f) return;
      const r = new FileReader();
      r.onload = async () => {
        dataUrl = r.result;
        preview.innerHTML = '';
        try {
          const img = await loadImage(dataUrl);
          preview.appendChild(faceThumb(img, 90));
          if (!nameInput.value) nameInput.value = f.name.replace(/\.png$/i, '');
        } catch {}
      };
      r.readAsDataURL(f);
    };

    drop.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.style.borderColor = 'var(--accent)';
    });
    drop.addEventListener('dragleave', () => (drop.style.borderColor = 'var(--border-strong)'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.style.borderColor = 'var(--border-strong)';
      handleFile(e.dataTransfer.files[0]);
    });

    const m = modal({
      title: 'Skin ekle',
      subtitle: '64x64 (veya eski 64x32) PNG',
      body: el(
        'div',
        { style: { display: 'grid', gap: '14px' } },
        drop,
        fileInput,
        preview,
        el('div', { class: 'field' }, el('label', { text: 'Ad' }), nameInput),
        el('div', { class: 'field' }, el('label', { text: 'Kol tipi' }), variantSeg)
      ),
      footer: [
        el('button', { class: 'btn', text: 'Vazgeç', onClick: () => m.close() }),
        el('button', {
          class: 'btn primary',
          text: 'Kaydet',
          onClick: async (e) => {
            e.currentTarget.disabled = true;
            try {
              if (!dataUrl) {
                const res = await api.skins.add({ name: nameInput.value, variant });
                if (!res) {
                  e.currentTarget.disabled = false;
                  return;
                }
              } else {
                await api.skins.add({ name: nameInput.value, variant, dataUrl });
              }
              m.close();
              toast('Skin kaydedildi.', 'ok');
              window.UI.refreshRoute();
            } catch (err) {
              e.currentTarget.disabled = false;
              toast(err.message, 'err');
            }
          },
        }),
      ],
    });
  }

  async function fromUsername() {
    const name = await promptDialog({
      title: 'Kullanıcı adından skin al',
      label: 'Minecraft kullanıcı adı',
      placeholder: 'örn: Notch',
      confirmText: 'Getir',
    });
    if (!name) return;
    try {
      await api.skins.addFromUsername(name);
      toast(`"${name}" skini kütüphaneye eklendi.`, 'ok');
      window.UI.refreshRoute();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  async function applySelected() {
    if (!selectedSkin) return toast('Önce bir skin seç.', 'err');
    applySkin(selectedSkin.id);
  }

  async function applySkin(id) {
    const btn = document.getElementById('apply-skin');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" style="width:15px;height:15px"></span><span>Yükleniyor...</span>';
    }
    try {
      await api.skins.apply(id);
      toast('Skin hesabına uygulandı.', 'ok');
      await window.UI.loadAccounts();
    } catch (e) {
      toast(e.message, 'err', 'Uygulanamadı', 9000);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = Icons.upload + '<span>Hesaba uygula</span>';
      }
    }
  }

  async function resetSkin() {
    const ok = await confirmDialog({
      title: 'Varsayılana döndür',
      message: 'Hesabındaki skin varsayılan Steve/Alex olarak sıfırlanacak.',
      confirmText: 'Sıfırla',
    });
    if (!ok) return;
    try {
      await api.skins.reset();
      toast('Skin sıfırlandı.', 'ok');
      await window.UI.loadAccounts();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  window.Views.skins = { render, buildPlayer, loadImage, faceThumb };
})();
