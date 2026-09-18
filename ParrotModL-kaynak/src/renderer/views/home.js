/* Ana Sayfa - profiller, oluşturma, içe/dışa aktarma, mod paketleri */
(function () {
  const { el, $, toast, modal, confirmDialog, promptDialog, contextMenu, go, emptyState, spinnerBlock, fmtAgo, fmtPlaytime, loaderChip, iconImg, debounce, sourceChip, fmtNum } = window.UI;
  const api = window.api;
  const State = window.State;

  let gridHost = null;
  let searchTerm = '';
  let sortMode = 'recent';
  let groupFilter = '';

  async function render(host) {
    await window.UI.loadProfiles();

    const head = el(
      'div',
      { class: 'page-head' },
      el(
        'div',
        {},
        el('h1', { text: 'Ana Sayfa' }),
        el('p', { text: 'Profillerini yönet, mod paketi kur, oyunu başlat.' })
      ),
      el(
        'div',
        { class: 'head-actions' },
        el('button', { class: 'btn', html: Icons.download + '<span>Paket İçe Aktar</span>', onClick: importPack }),
        el('button', { class: 'btn', html: Icons.package + '<span>Mod Paketi Bul</span>', onClick: browseModpacks }),
        el('button', { class: 'btn primary', html: Icons.plus + '<span>Yeni Profil</span>', onClick: () => createProfileDialog() })
      )
    );

    const toolbar = el(
      'div',
      { class: 'toolbar' },
      el(
        'div',
        { class: 'search-box' },
        el('span', { html: Icons.search }),
        el('input', {
          class: 'input',
          placeholder: 'Profillerde ara...',
          value: searchTerm,
          onInput: debounce((e) => {
            searchTerm = e.target.value;
            paint();
          }, 180),
        })
      ),
      el(
        'select',
        {
          class: 'select',
          style: { width: 'auto', minWidth: '170px' },
          onChange: (e) => {
            sortMode = e.target.value;
            paint();
          },
        },
        ...[
          ['recent', 'Son oynanan'],
          ['name', 'İsim (A-Z)'],
          ['created', 'Oluşturma tarihi'],
          ['playtime', 'Oynama süresi'],
        ].map(([v, t]) => el('option', { value: v, text: t, selected: sortMode === v }))
      )
    );

    gridHost = el('div', { class: 'profile-grid' });

    host.appendChild(head);
    host.appendChild(toolbar);
    host.appendChild(gridHost);
    paint();

    const offProgress = api.on('task:progress', (p) => {
      if (!p.profileId) return;
      State.progress.set(p.profileId, p);
      updateCardProgress(p.profileId);
    });
    const offDone = api.on('task:done', (p) => {
      if (!p.profileId) return;
      State.progress.delete(p.profileId);
      updateCardProgress(p.profileId);
    });
    const offGame = api.on('game:event', (evt) => {
      if (evt.type === 'status') {
        State.progress.set(evt.profileId, { stage: evt.stage, percent: evt.percent });
        if (evt.state === 'running') State.running.add(evt.profileId);
        updateCardProgress(evt.profileId);
        if (evt.state === 'running') paint();
      } else if (evt.type === 'exit') {
        State.running.delete(evt.profileId);
        State.progress.delete(evt.profileId);
        paint();
        if (evt.state === 'crashed') {
          toast('Oyun beklenmedik şekilde kapandı (kod ' + evt.code + ').', 'err', 'Çökme');
        }
      }
    });

    return () => {
      offProgress();
      offDone();
      offGame();
    };
  }

  function visibleProfiles() {
    let list = [...State.profiles];
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.mcVersion.includes(q) || (p.loader || '').includes(q)
      );
    }
    if (groupFilter) list = list.filter((p) => p.group === groupFilter);
    const by = {
      recent: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || (b.created || 0) - (a.created || 0),
      name: (a, b) => a.name.localeCompare(b.name, 'tr'),
      created: (a, b) => (b.created || 0) - (a.created || 0),
      playtime: (a, b) => (b.playTime || 0) - (a.playTime || 0),
    };
    list.sort(by[sortMode] || by.recent);
    return list;
  }

  function paint() {
    if (!gridHost) return;
    gridHost.innerHTML = '';
    const list = visibleProfiles();

    gridHost.appendChild(
      el(
        'button',
        { class: 'new-tile', onClick: () => createProfileDialog() },
        el('span', { html: Icons.plus }),
        el('span', { text: 'Yeni profil oluştur', style: { fontWeight: 650, fontSize: '13px' } })
      )
    );

    if (!list.length && !searchTerm) {
      gridHost.parentElement.appendChild(
        emptyState(Icons.cube, 'Henüz profil yok', 'Yeni bir profil oluştur veya hazır bir mod paketi kur.')
      );
      return;
    }
    for (const p of list) gridHost.appendChild(card(p));
  }

  function card(p) {
    const running = State.running.has(p.id);
    const prog = State.progress.get(p.id);

    const art = el('div', { class: 'art' });
    if (p.iconUrl) art.appendChild(el('img', { src: p.iconUrl, alt: '' }));
    else art.appendChild(el('div', { class: 'letter', text: p.name[0].toUpperCase() }));

    const play = el(
      'div',
      { class: 'play' },
      el('button', {
        class: 'play-btn',
        html: running ? Icons.stop : Icons.play,
        title: running ? 'Durdur' : 'Oyna',
        onClick: (e) => {
          e.stopPropagation();
          running ? stopProfile(p) : launchProfile(p);
        },
      })
    );

    const node = el(
      'div',
      {
        class: 'profile-card',
        'data-id': p.id,
        onClick: () => go('profile', p.id),
        onContextmenu: (e) => {
          e.preventDefault();
          openMenu(e, p);
        },
      },
      art,
      play,
      running ? el('div', { class: 'running-dot' }, el('i'), 'Çalışıyor') : null,
      el('button', {
        class: 'card-menu',
        html: Icons.dots,
        title: 'Seçenekler',
        onClick: (e) => {
          e.stopPropagation();
          openMenu(e, p);
        },
      }),
      el(
        'div',
        { class: 'body' },
        el('div', { class: 'ttl', text: p.name, title: p.name }),
        el(
          'div',
          { class: 'mt' },
          el('span', { class: 'chip', text: p.mcVersion }),
          el('span', { html: loaderChip(p.loader) }),
          p.modCount ? el('span', { class: 'chip', text: p.modCount + ' mod' }) : null
        ),
        el('div', {
          style: { fontSize: '11px', color: 'var(--text-3)', marginTop: '7px' },
          text: (p.lastPlayed ? 'Son: ' + fmtAgo(p.lastPlayed) : 'Hiç oynanmadı') + ' · ' + fmtPlaytime(p.playTime),
        })
      ),
      el(
        'div',
        { class: 'progress-strip', style: { display: prog ? 'block' : 'none' } },
        el('i', { style: { width: (prog ? prog.percent : 0) + '%' } })
      )
    );
    return node;
  }

  function updateCardProgress(profileId) {
    const node = document.querySelector(`.profile-card[data-id="${CSS.escape(profileId)}"]`);
    if (!node) return;
    const strip = node.querySelector('.progress-strip');
    const p = State.progress.get(profileId);
    if (!strip) return;
    strip.style.display = p ? 'block' : 'none';
    if (p) strip.firstElementChild.style.width = (p.percent || 0) + '%';
  }

  function openMenu(e, p) {
    const running = State.running.has(p.id);
    contextMenu(e.clientX, e.clientY, [
      running
        ? { label: 'Durdur', icon: Icons.stop, onClick: () => stopProfile(p) }
        : { label: 'Oyna', icon: Icons.play, onClick: () => launchProfile(p) },
      { label: 'Aç / Düzenle', icon: Icons.edit, onClick: () => go('profile', p.id) },
      '-',
      { label: 'Paketi dışa aktar (.mrpack)', icon: Icons.upload, onClick: () => exportPack(p) },
      { label: 'Kopyasını oluştur', icon: Icons.copy, onClick: () => duplicate(p) },
      { label: 'Klasörü aç', icon: Icons.folder, onClick: () => api.profiles.openFolder(p.id) },
      '-',
      { label: 'Yeniden adlandır', icon: Icons.edit, onClick: () => rename(p) },
      { label: 'Sil', icon: Icons.trash, danger: true, onClick: () => removeProfile(p) },
    ]);
  }

  // ------------------------------------------------------------- actions
  async function launchProfile(p) {
    if (!State.account) {
      toast('Önce bir hesap ekleyin.', 'err');
      window.Views.accounts.open();
      return;
    }
    try {
      State.progress.set(p.id, { stage: 'Başlatılıyor', percent: 1 });
      updateCardProgress(p.id);
      await api.game.launch(p.id);
    } catch (e) {
      State.progress.delete(p.id);
      updateCardProgress(p.id);
      toast(e.message, 'err', 'Başlatılamadı', 8000);
    }
  }

  async function stopProfile(p) {
    await api.game.stop(p.id);
    toast(p.name + ' durduruldu.', 'info');
  }

  async function rename(p) {
    const name = await promptDialog({ title: 'Profili yeniden adlandır', label: 'Yeni ad', value: p.name });
    if (!name) return;
    await api.profiles.update(p.id, { name });
    await window.UI.loadProfiles();
    paint();
  }

  async function duplicate(p) {
    const name = await promptDialog({
      title: 'Profili kopyala',
      label: 'Yeni profilin adı',
      value: p.name + ' kopya',
    });
    if (!name) return;
    const kill = toast('Kopyalanıyor...', 'info', null, 60000);
    try {
      await api.profiles.duplicate(p.id, name);
      await window.UI.loadProfiles();
      paint();
      toast('Kopyalandı.', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      kill();
    }
  }

  async function removeProfile(p) {
    const ok = await confirmDialog({
      title: 'Profili sil',
      message: `"${p.name}" ve içindeki tüm dosyalar (modlar, dünyalar, ayarlar) kalıcı olarak silinecek. Emin misin?`,
      confirmText: 'Sil',
      danger: true,
    });
    if (!ok) return;
    await api.profiles.remove(p.id, true);
    await window.UI.loadProfiles();
    paint();
    toast('Profil silindi.', 'ok');
  }

  async function exportPack(p) {
    const incConfig = el('input', { type: 'checkbox', checked: true });
    const incSaves = el('input', { type: 'checkbox' });
    const verInput = el('input', { class: 'input', value: '1.0.0' });
    let done = false;
    const m = modal({
      title: 'Paketi dışa aktar',
      subtitle: p.name + ' → .mrpack',
      body: el(
        'div',
        { style: { display: 'grid', gap: '14px' } },
        el('div', { class: 'field' }, el('label', { text: 'Paket sürümü' }), verInput),
        el(
          'label',
          { style: { display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer' } },
          incConfig,
          el('span', { text: 'config klasörünü ve options.txt dosyasını dahil et' })
        ),
        el(
          'label',
          { style: { display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer' } },
          incSaves,
          el('span', { text: 'Dünyaları (saves) dahil et - dosya boyutunu çok büyütebilir' })
        ),
        el('p', {
          style: { fontSize: '12px', color: 'var(--text-3)' },
          text: 'Oluşan .mrpack dosyasını ParrotModL kullanan başka biri "Paket İçe Aktar" ile açabilir. Modrinth uyumlu diğer launcher\'lar da açabilir.',
        })
      ),
      footer: [
        el('button', { class: 'btn', text: 'Vazgeç', onClick: () => m.close() }),
        el('button', {
          class: 'btn primary',
          text: 'Dışa aktar',
          onClick: async () => {
            done = true;
            m.close();
            const kill = toast('Paket hazırlanıyor...', 'info', null, 120000);
            try {
              const res = await api.profiles.exportPack(p.id, {
                includeConfigs: incConfig.checked,
                includeSaves: incSaves.checked,
                version: verInput.value || '1.0.0',
              });
              kill();
              if (res) toast(`${res.files} mod bağlantısı + ${res.overrides} gömülü dosya yazıldı.`, 'ok', 'Dışa aktarıldı');
            } catch (e) {
              kill();
              toast(e.message, 'err');
            }
          },
        }),
      ],
      onClose: () => {
        if (!done) return;
      },
    });
  }

  async function importPack() {
    const kill = toast('Paket seçiliyor...', 'info', null, 2000);
    try {
      const p = await api.profiles.importPack(null);
      kill();
      if (!p) return;
      await window.UI.loadProfiles();
      paint();
      toast(`"${p.name}" içe aktarıldı.`, 'ok');
      go('profile', p.id);
    } catch (e) {
      kill();
      toast(e.message, 'err', 'İçe aktarılamadı', 8000);
    }
  }

  // ------------------------------------------------------------- modpacks
  async function browseModpacks() {
    const listHost = el('div', { class: 'content-grid', style: { gridTemplateColumns: '1fr' } });
    const input = el('input', { class: 'input', placeholder: 'Mod paketi ara (örn: Better MC, Fabulously Optimized)' });
    const provider = el(
      'select',
      { class: 'select', style: { width: 'auto' } },
      el('option', { value: 'both', text: 'Her ikisi' }),
      el('option', { value: 'modrinth', text: 'Modrinth' }),
      el('option', { value: 'curseforge', text: 'CurseForge' })
    );

    const m = modal({
      title: 'Mod paketi bul',
      subtitle: 'Modrinth ve CurseForge üzerinden hazır paket kur',
      width: 'wide',
      body: el(
        'div',
        { style: { display: 'grid', gap: '14px' } },
        el('div', { style: { display: 'flex', gap: '8px' } },
          el('div', { class: 'search-box' }, el('span', { html: Icons.search }), input),
          provider
        ),
        listHost
      ),
    });

    const run = async () => {
      listHost.innerHTML = '';
      listHost.appendChild(spinnerBlock('Aranıyor...'));
      try {
        const res = await api.content.search({
          query: input.value,
          type: 'modpack',
          provider: provider.value,
          limit: 20,
          sort: input.value ? 'relevance' : 'downloads',
        });
        listHost.innerHTML = '';
        if (!res.hits.length) {
          listHost.appendChild(emptyState(Icons.package, 'Sonuç yok', 'Farklı bir arama deneyin.'));
          return;
        }
        for (const hit of res.hits) listHost.appendChild(packRow(hit, m));
      } catch (e) {
        listHost.innerHTML = '';
        listHost.appendChild(emptyState(Icons.alert, 'Arama başarısız', e.message));
      }
    };
    input.addEventListener('input', debounce(run, 420));
    provider.addEventListener('change', run);
    run();
    setTimeout(() => input.focus(), 50);
  }

  function packRow(hit, m) {
    return el(
      'div',
      { class: 'content-card' },
      iconImg(hit.icon, hit.title),
      el(
        'div',
        { class: 'info' },
        el('div', { class: 'nm' }, el('span', { class: 't', text: hit.title }), el('span', { html: sourceChip(hit.source) })),
        el('div', { class: 'ds', text: hit.description || '' }),
        el(
          'div',
          { class: 'ft' },
          el('span', { class: 'stat', html: Icons.download + ' ' + fmtNum(hit.downloads) }),
          hit.author ? el('span', { text: hit.author }) : null
        )
      ),
      el(
        'div',
        { class: 'acts' },
        el('button', {
          class: 'btn primary sm',
          text: 'Kur',
          onClick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = 'Kuruluyor...';
            try {
              const p = await api.profiles.installModpack({ source: hit.source, projectId: hit.id, name: hit.title });
              m.close();
              await window.UI.loadProfiles();
              paint();
              toast(`"${p.name}" kuruldu.`, 'ok');
              go('profile', p.id);
            } catch (err) {
              btn.disabled = false;
              btn.textContent = 'Kur';
              toast(err.message, 'err', 'Kurulamadı', 9000);
            }
          },
        }),
        el('button', {
          class: 'btn sm ghost',
          html: Icons.external,
          title: 'Site',
          onClick: () => api.app.openExternal(hit.url),
        })
      )
    );
  }

  // ------------------------------------------------------------- create
  async function createProfileDialog(preset = {}) {
    const state = {
      name: preset.name || '',
      loader: preset.loader || 'fabric',
      mcVersion: preset.mcVersion || '',
      loaderVersion: '',
      iconData: '',
      showSnapshots: false,
    };

    const nameInput = el('input', { class: 'input', placeholder: 'Örn: Optimize Survival', value: state.name });
    const loaderRow = el('div', { class: 'seg', style: { flexWrap: 'wrap' } });
    const mcSelect = el('select', { class: 'select' });
    const loaderSelect = el('select', { class: 'select' });
    const loaderField = el('div', { class: 'field' }, el('label', { text: 'Mod loader sürümü' }), loaderSelect);
    const snapToggle = el('label', { style: { display: 'flex', gap: '9px', alignItems: 'center', fontSize: '12.5px', color: 'var(--text-2)', cursor: 'pointer' } });
    const snapCheck = el('input', { type: 'checkbox' });
    snapToggle.appendChild(snapCheck);
    snapToggle.appendChild(el('span', { text: 'Anlık görüntüleri (snapshot) göster' }));

    // icon picker
    const iconPreview = el('div', {
      style: {
        width: '76px',
        height: '76px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg,var(--accent),#12306b)',
        display: 'grid',
        placeItems: 'center',
        color: '#fff',
        fontWeight: 800,
        fontSize: '28px',
        backgroundSize: 'cover',
        flex: 'none',
        overflow: 'hidden',
      },
      text: '?',
    });
    const fileInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        cropToPng(r.result, 256).then((dataUrl) => {
          state.iconData = dataUrl;
          iconPreview.textContent = '';
          iconPreview.style.backgroundImage = `url("${dataUrl}")`;
        });
      };
      r.readAsDataURL(f);
    });

    nameInput.addEventListener('input', () => {
      state.name = nameInput.value;
      if (!state.iconData) iconPreview.textContent = (state.name[0] || '?').toUpperCase();
    });

    for (const l of ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt']) {
      loaderRow.appendChild(
        el('button', {
          class: state.loader === l ? 'active' : '',
          text: window.UI.LOADER_LABEL[l],
          onClick: () => {
            state.loader = l;
            [...loaderRow.children].forEach((c) => c.classList.toggle('active', c.textContent === window.UI.LOADER_LABEL[l]));
            loadVersions();
          },
        })
      );
    }

    const err = el('div', { style: { color: 'var(--red)', fontSize: '12.5px', display: 'none' } });

    let allVersions = [];
    let supported = null;

    async function loadVersions() {
      mcSelect.innerHTML = '<option>Yükleniyor...</option>';
      loaderSelect.innerHTML = '<option>-</option>';
      loaderField.style.display = state.loader === 'vanilla' ? 'none' : '';
      try {
        if (!allVersions.length || snapCheck.checked !== state.showSnapshots) {
          state.showSnapshots = snapCheck.checked;
          allVersions = await api.mc.versions(state.showSnapshots);
        }
        supported = state.loader === 'vanilla' ? null : await api.mc.loaderGameVersions(state.loader);
        const list = supported ? allVersions.filter((v) => supported.includes(v.id)) : allVersions;
        mcSelect.innerHTML = '';
        if (!list.length) {
          mcSelect.innerHTML = '<option>Uygun sürüm yok</option>';
          return;
        }
        for (const v of list.slice(0, 400)) {
          mcSelect.appendChild(
            el('option', { value: v.id, text: v.id + (v.type !== 'release' ? ` (${v.type})` : '') })
          );
        }
        if (state.mcVersion && list.some((v) => v.id === state.mcVersion)) mcSelect.value = state.mcVersion;
        state.mcVersion = mcSelect.value;
        await loadLoaderVersions();
      } catch (e) {
        mcSelect.innerHTML = '<option>Hata</option>';
        err.style.display = 'block';
        err.textContent = 'Sürüm listesi alınamadı: ' + e.message;
      }
    }

    async function loadLoaderVersions() {
      if (state.loader === 'vanilla') {
        state.loaderVersion = '';
        return;
      }
      loaderSelect.innerHTML = '<option>Yükleniyor...</option>';
      try {
        const list = await api.mc.loaderVersions(state.loader, state.mcVersion);
        loaderSelect.innerHTML = '';
        if (!list.length) {
          loaderSelect.innerHTML = '<option value="">Bu sürüm için loader yok</option>';
          state.loaderVersion = '';
          return;
        }
        for (const l of list.slice(0, 200)) {
          loaderSelect.appendChild(el('option', { value: l.version, text: l.label }));
        }
        const stable = list.find((l) => l.stable);
        loaderSelect.value = (stable || list[0]).version;
        state.loaderVersion = loaderSelect.value;
      } catch (e) {
        loaderSelect.innerHTML = '<option value="">Alınamadı</option>';
      }
    }

    mcSelect.addEventListener('change', () => {
      state.mcVersion = mcSelect.value;
      loadLoaderVersions();
    });
    loaderSelect.addEventListener('change', () => (state.loaderVersion = loaderSelect.value));
    snapCheck.addEventListener('change', () => {
      allVersions = [];
      loadVersions();
    });

    const body = el(
      'div',
      { style: { display: 'grid', gap: '16px' } },
      el(
        'div',
        { style: { display: 'flex', gap: '16px', alignItems: 'center' } },
        el(
          'div',
          { style: { display: 'grid', gap: '6px', justifyItems: 'center' } },
          iconPreview,
          el('button', {
            class: 'btn sm ghost',
            text: 'Resim seç',
            onClick: () => fileInput.click(),
          }),
          fileInput
        ),
        el('div', { class: 'field', style: { flex: 1 } }, el('label', { text: 'Profil adı' }), nameInput)
      ),
      el('div', { class: 'field' }, el('label', { text: 'Mod loader' }), loaderRow),
      el(
        'div',
        { class: 'grid-2' },
        el('div', { class: 'field' }, el('label', { text: 'Minecraft sürümü' }), mcSelect, snapToggle),
        loaderField
      ),
      err
    );

    let done = false;
    const m = modal({
      title: 'Yeni profil',
      subtitle: 'Sürümü ve mod loader’ı seç, gerisini ParrotModL halleder',
      body,
      footer: [
        el('button', { class: 'btn', text: 'Vazgeç', onClick: () => m.close() }),
        el('button', {
          class: 'btn primary',
          text: 'Oluştur',
          onClick: async (e) => {
            if (!state.name.trim()) {
              err.style.display = 'block';
              err.textContent = 'Profil adı gerekli.';
              return;
            }
            if (!state.mcVersion) {
              err.style.display = 'block';
              err.textContent = 'Minecraft sürümü seç.';
              return;
            }
            if (state.loader !== 'vanilla' && !state.loaderVersion) {
              err.style.display = 'block';
              err.textContent = 'Bu Minecraft sürümü için uygun bir loader sürümü yok.';
              return;
            }
            e.currentTarget.disabled = true;
            try {
              const p = await api.profiles.create({
                name: state.name.trim(),
                mcVersion: state.mcVersion,
                loader: state.loader,
                loaderVersion: state.loaderVersion,
                iconData: state.iconData || undefined,
              });
              done = true;
              m.close();
              await window.UI.loadProfiles();
              paint();
              toast(`"${p.name}" oluşturuldu.`, 'ok');
              go('profile', p.id);
            } catch (ex) {
              e.currentTarget.disabled = false;
              err.style.display = 'block';
              err.textContent = ex.message;
            }
          },
        }),
      ],
    });

    setTimeout(() => nameInput.focus(), 60);
    loadVersions();
  }

  function cropToPng(dataUrl, size) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve('');
      img.src = dataUrl;
    });
  }

  window.Views.home = { render, createProfileDialog, cropToPng };
})();
