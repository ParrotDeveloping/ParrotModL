/* Profil detay sayfası: içerik yönetimi, mod arama, ayarlar, günlük */
(function () {
  const {
    el,
    toast,
    modal,
    confirmDialog,
    promptDialog,
    go,
    emptyState,
    spinnerBlock,
    fmtBytes,
    fmtAgo,
    fmtPlaytime,
    loaderChip,
    iconImg,
    sourceChip,
    contextMenu,
    esc,
  } = window.UI;
  const api = window.api;
  const State = window.State;

  let profile = null;
  let logLines = [];

  async function render(host, profileId) {
    profile = await api.profiles.get(profileId);
    logLines = [];

    const running = State.running.has(profile.id);

    const banner = el(
      'div',
      {
        class: 'card',
        style: {
          display: 'flex',
          gap: '18px',
          alignItems: 'center',
          padding: '18px',
          marginBottom: '18px',
          background:
            'linear-gradient(120deg, var(--accent-soft), transparent 60%), var(--surface)',
        },
      },
      el('button', {
        class: 'btn icon ghost',
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
        title: 'Geri',
        onClick: () => go('home'),
      }),
      profile.iconUrl
        ? el('img', { src: profile.iconUrl, style: { width: '82px', height: '82px', borderRadius: '18px', objectFit: 'cover' } })
        : el('div', {
            style: {
              width: '82px',
              height: '82px',
              borderRadius: '18px',
              background: 'linear-gradient(135deg,var(--accent),#12306b)',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: '32px',
            },
            text: profile.name[0].toUpperCase(),
          }),
      el(
        'div',
        { style: { flex: 1, minWidth: 0 } },
        el('h1', { text: profile.name, style: { fontSize: '23px', fontWeight: 800 } }),
        el(
          'div',
          { style: { display: 'flex', gap: '7px', marginTop: '7px', flexWrap: 'wrap', alignItems: 'center' } },
          el('span', { class: 'chip', text: profile.mcVersion }),
          el('span', { html: loaderChip(profile.loader) }),
          profile.loaderVersion ? el('span', { class: 'chip', text: profile.loaderVersion }) : null,
          el('span', { class: 'chip', text: (profile.totalContent || 0) + ' içerik' }),
          el('span', { class: 'chip', text: fmtPlaytime(profile.playTime) })
        )
      ),
      el(
        'div',
        { style: { display: 'flex', gap: '8px' } },
        el('button', {
          id: 'launch-btn',
          class: 'btn primary',
          html: (running ? Icons.stop : Icons.play) + `<span>${running ? 'Durdur' : 'Oyna'}</span>`,
          onClick: () => (State.running.has(profile.id) ? stop() : launch()),
        }),
        el('button', {
          class: 'btn icon',
          html: Icons.dots,
          title: 'Seçenekler',
          onClick: (e) => menu(e),
        })
      )
    );

    const progWrap = el('div', { style: { display: 'none', marginBottom: '16px' } });
    const progText = el('div', { style: { fontSize: '12.5px', color: 'var(--text-2)', marginBottom: '6px' } });
    const progBar = el('div', { class: 'bar' }, el('i', { style: { width: '0%' } }));
    progWrap.appendChild(progText);
    progWrap.appendChild(progBar);

    const tabs = el('div', { class: 'tabs' });
    const pane = el('div', {});

    const makeTab = (label, fn) => {
      const b = el('button', {
        class: 'tab',
        text: label,
        onClick: async () => {
          [...tabs.children].forEach((c) => c.classList.remove('active'));
          b.classList.add('active');
          pane.innerHTML = '';
          pane.appendChild(spinnerBlock());
          const node = await fn();
          pane.innerHTML = '';
          pane.appendChild(node);
        },
      });
      tabs.appendChild(b);
      return b;
    };

    const tContent = makeTab('İçerik', tabContent);
    makeTab('Mod Ekle', () => tabBrowse('mod'));
    makeTab('Kaynak Paketi', () => tabBrowse('resourcepack'));
    makeTab('Shader', () => tabBrowse('shader'));
    makeTab('Ayarlar', tabSettings);
    makeTab('Günlük', tabLog);

    host.appendChild(banner);
    host.appendChild(progWrap);
    host.appendChild(tabs);
    host.appendChild(pane);
    tContent.click();

    const offProg = api.on('task:progress', (p) => {
      if (p.profileId && p.profileId !== profile.id) return;
      progWrap.style.display = 'block';
      progText.textContent = p.stage + (p.detail ? ' — ' + p.detail : '');
      progBar.firstElementChild.style.width = (p.percent || 0) + '%';
    });
    const offDone = api.on('task:done', () => {
      setTimeout(() => (progWrap.style.display = 'none'), 700);
    });
    const offGame = api.on('game:event', (evt) => {
      if (evt.profileId !== profile.id) return;
      if (evt.type === 'status') {
        progWrap.style.display = 'block';
        progText.textContent = evt.stage || '';
        progBar.firstElementChild.style.width = (evt.percent || 0) + '%';
        if (evt.state === 'running') {
          State.running.add(profile.id);
          setBtn(true);
          setTimeout(() => (progWrap.style.display = 'none'), 1200);
        }
      } else if (evt.type === 'log') {
        logLines.push(evt.line);
        if (logLines.length > 3000) logLines.splice(0, 1000);
        const lv = document.getElementById('log-view');
        if (lv) {
          const atBottom = lv.scrollTop + lv.clientHeight >= lv.scrollHeight - 30;
          lv.appendChild(logLine(evt.line));
          if (atBottom) lv.scrollTop = lv.scrollHeight;
        }
      } else if (evt.type === 'exit') {
        State.running.delete(profile.id);
        setBtn(false);
        progWrap.style.display = 'none';
        if (evt.state === 'crashed') toast('Oyun çıkış kodu ' + evt.code + ' ile kapandı.', 'err', 'Çökme');
      }
    });

    function setBtn(isRunning) {
      const b = document.getElementById('launch-btn');
      if (!b) return;
      b.innerHTML = (isRunning ? Icons.stop : Icons.play) + `<span>${isRunning ? 'Durdur' : 'Oyna'}</span>`;
    }

    return () => {
      offProg();
      offDone();
      offGame();
    };
  }

  function logLine(line) {
    const cls = /ERROR|Exception|SEVERE|FATAL/i.test(line) ? 'e' : /WARN/i.test(line) ? 'w' : '';
    return el('div', { class: cls, text: line });
  }

  // ------------------------------------------------------------- tabs
  async function tabContent() {
    const items = await api.profiles.content(profile.id);
    const wrap = el('div', { style: { display: 'grid', gap: '16px' } });

    const bar = el(
      'div',
      { class: 'toolbar', style: { marginBottom: 0 } },
      el('button', {
        class: 'btn sm',
        html: Icons.refresh + '<span>Güncellemeleri kontrol et</span>',
        onClick: async (e) => {
          const b = e.currentTarget;
          b.disabled = true;
          b.innerHTML = Icons.refresh + '<span>Kontrol ediliyor...</span>';
          try {
            const ups = await api.profiles.checkUpdates(profile.id);
            if (!ups.length) toast('Her şey güncel.', 'ok');
            else showUpdates(ups);
          } catch (err) {
            toast(err.message, 'err');
          } finally {
            b.disabled = false;
            b.innerHTML = Icons.refresh + '<span>Güncellemeleri kontrol et</span>';
          }
        },
      }),
      el('button', {
        class: 'btn sm',
        html: Icons.folder + '<span>Klasörü aç</span>',
        onClick: () => api.profiles.openFolder(profile.id),
      })
    );
    wrap.appendChild(bar);

    const groups = { mod: [], resourcepack: [], shader: [], datapack: [], other: [] };
    for (const c of items) (groups[c.type] || groups.other).push(c);

    let any = false;
    for (const [type, label] of [
      ['mod', 'Modlar'],
      ['resourcepack', 'Kaynak Paketleri'],
      ['shader', 'Shaderlar'],
      ['datapack', 'Veri Paketleri'],
      ['other', 'Diğer'],
    ]) {
      const list = groups[type];
      if (!list || !list.length) continue;
      any = true;
      const section = el('div', {}, el('h3', { text: `${label} (${list.length})`, style: { fontSize: '14px', marginBottom: '9px' } }));
      const rows = el('div', { style: { display: 'grid', gap: '7px' } });
      for (const c of list) rows.appendChild(contentRow(c));
      section.appendChild(rows);
      wrap.appendChild(section);
    }

    if (!any) {
      wrap.appendChild(
        emptyState(
          Icons.cube,
          'Bu profilde içerik yok',
          profile.loader === 'vanilla'
            ? 'Vanilla profile mod kurulamaz, ama kaynak paketi ve shader ekleyebilirsin.'
            : '"Mod Ekle" sekmesinden Modrinth veya CurseForge üzerinden mod indir.'
        )
      );
    }
    return wrap;
  }

  function contentRow(c) {
    return el(
      'div',
      { class: 'mod-row' + (c.disabled ? ' off' : '') },
      c.icon ? el('img', { src: c.icon, loading: 'lazy' }) : el('div', { class: 'ph' }),
      el(
        'div',
        { class: 'info' },
        el(
          'div',
          { class: 'nm' },
          c.name,
          c.failed ? el('span', { class: 'chip red', text: 'hata', style: { marginLeft: '6px' } }) : null,
          c.isDependency ? el('span', { class: 'chip', text: 'bağımlılık', style: { marginLeft: '6px' } }) : null
        ),
        el('div', {
          class: 'sub',
          text: `${c.fileName} · ${c.versionNumber || ''} ${c.size ? '· ' + fmtBytes(c.size) : ''}`,
        })
      ),
      c.source && c.source !== 'unknown' ? el('span', { html: sourceChip(c.source) }) : null,
      el('button', {
        class: 'btn icon sm ghost',
        html: c.disabled ? Icons.eyeOff : Icons.eye,
        title: c.disabled ? 'Etkinleştir' : 'Devre dışı bırak',
        onClick: async (e) => {
          try {
            await api.profiles.toggleContent(profile.id, c.uid);
            refreshTab();
          } catch (err) {
            toast(err.message, 'err');
          }
        },
      }),
      el('button', {
        class: 'btn icon sm ghost',
        html: Icons.trash,
        title: 'Sil',
        onClick: async () => {
          await api.profiles.removeContent(profile.id, c.uid);
          profile = await api.profiles.get(profile.id);
          refreshTab();
        },
      })
    );
  }

  function refreshTab() {
    const active = document.querySelector('.tabs .tab.active');
    if (active) active.click();
  }

  function showUpdates(ups) {
    const list = el('div', { style: { display: 'grid', gap: '8px' } });
    for (const u of ups) {
      list.appendChild(
        el(
          'div',
          { class: 'mod-row' },
          el('div', { class: 'ph' }),
          el(
            'div',
            { class: 'info' },
            el('div', { class: 'nm', text: u.name }),
            el('div', { class: 'sub', text: `${u.current || '?'} → ${u.latest}` })
          ),
          el('button', {
            class: 'btn primary sm',
            text: 'Güncelle',
            onClick: async (e) => {
              const b = e.currentTarget;
              b.disabled = true;
              b.textContent = '...';
              try {
                await api.profiles.updateContent(profile.id, u.uid, u.versionId);
                b.textContent = 'Güncellendi';
              } catch (err) {
                b.disabled = false;
                b.textContent = 'Güncelle';
                toast(err.message, 'err');
              }
            },
          })
        )
      );
    }
    modal({
      title: `${ups.length} güncelleme var`,
      width: 'wide',
      body: list,
      footer: el('button', { class: 'btn', text: 'Kapat', onClick: () => refreshTab() }),
    });
  }

  async function tabBrowse(type) {
    if (type === 'mod' && profile.loader === 'vanilla') {
      return emptyState(
        Icons.alert,
        'Vanilla profile mod kurulamaz',
        'Mod kurmak için Fabric, Forge, NeoForge veya Quilt profili oluştur.'
      );
    }
    const browser = window.ContentBrowser.create({
      profile,
      defaultType: type,
      types: [type],
      onInstall: (hit, btn) => install(hit, null, btn),
      onInstallVersion: (hit, version, btn) => install(hit, version, btn),
    });
    return browser.node;
  }

  async function install(hit, version, btn) {
    const original = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" style="width:14px;height:14px"></span>';
    }
    try {
      const res = await api.profiles.install(profile.id, {
        source: hit.source,
        projectId: hit.id,
        versionId: version ? version.id : null,
        type: hit.projectType === 'modpack' ? 'mod' : hit.projectType || 'mod',
        withDependencies: true,
      });
      const depCount = res.installed.length - 1;
      toast(
        `${hit.title} kuruldu${depCount > 0 ? ` (+${depCount} bağımlılık)` : ''}.`,
        'ok'
      );
      if (res.missing && res.missing.length) {
        toast(`${res.missing.length} bağımlılık bulunamadı.`, 'err', 'Uyarı');
      }
      profile = await api.profiles.get(profile.id);
      if (btn) {
        btn.innerHTML = Icons.check;
        btn.classList.remove('primary');
      }
    } catch (e) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
      }
      toast(e.message, 'err', 'Kurulamadı', 9000);
    }
  }

  async function tabSettings() {
    const info = await api.app.info();
    const mem = el('input', {
      type: 'range',
      min: 1024,
      max: Math.max(4096, Math.min(info.totalMemoryMb - 1024, 32768)),
      step: 512,
      value: profile.memoryMb || State.settings.memoryMb || 4096,
    });
    const memLabel = el('div', {
      style: { fontSize: '12.5px', color: 'var(--text-2)' },
      text: ((profile.memoryMb || State.settings.memoryMb || 4096) / 1024).toFixed(1) + ' GB',
    });
    mem.addEventListener('input', () => (memLabel.textContent = (mem.value / 1024).toFixed(1) + ' GB'));

    const jvm = el('textarea', {
      class: 'input',
      rows: 3,
      placeholder: 'Boş bırakırsan genel ayarlardaki argümanlar kullanılır',
      value: profile.jvmArgs || '',
    });
    const w = el('input', { class: 'input', type: 'number', value: profile.width || State.settings.width || 1280 });
    const h = el('input', { class: 'input', type: 'number', value: profile.height || State.settings.height || 720 });
    const server = el('input', { class: 'input', placeholder: 'örn: mc.sunucum.net', value: profile.quickPlayServer || '' });

    const wrap = el(
      'div',
      { style: { display: 'grid', gap: '18px', maxWidth: '660px' } },
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Bellek (RAM)' }),
        el('div', { class: 'sub', text: `Sistemde toplam ${(info.totalMemoryMb / 1024).toFixed(1)} GB var.` }),
        mem,
        memLabel
      ),
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Pencere' }),
        el('div', { class: 'sub', text: 'Oyun başlatılırken kullanılacak çözünürlük.' }),
        el('div', { class: 'grid-2' },
          el('div', { class: 'field' }, el('label', { text: 'Genişlik' }), w),
          el('div', { class: 'field' }, el('label', { text: 'Yükseklik' }), h)
        )
      ),
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Java argümanları' }),
        el('div', { class: 'sub', text: 'Sadece bu profile özel JVM argümanları.' }),
        jvm
      ),
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Doğrudan sunucuya bağlan' }),
        el('div', { class: 'sub', text: 'Oyun açılır açılmaz bu sunucuya girer (1.20+).' }),
        server
      ),
      el(
        'div',
        { style: { display: 'flex', gap: '8px' } },
        el('button', {
          class: 'btn primary',
          html: Icons.save + '<span>Kaydet</span>',
          onClick: async () => {
            await api.profiles.update(profile.id, {
              memoryMb: Number(mem.value),
              jvmArgs: jvm.value,
              width: Number(w.value) || null,
              height: Number(h.value) || null,
              quickPlayServer: server.value.trim(),
            });
            profile = await api.profiles.get(profile.id);
            toast('Profil ayarları kaydedildi.', 'ok');
          },
        })
      )
    );
    return wrap;
  }

  async function tabLog() {
    const view = el('div', { class: 'log-view', id: 'log-view' });
    for (const l of logLines) view.appendChild(logLine(l));
    if (!logLines.length) {
      view.appendChild(el('div', { text: 'Oyun başlatıldığında günlük burada görünür.', style: { color: 'var(--text-3)' } }));
    }
    setTimeout(() => (view.scrollTop = view.scrollHeight), 20);
    return el(
      'div',
      { style: { display: 'grid', gap: '10px' } },
      el(
        'div',
        { style: { display: 'flex', gap: '8px' } },
        el('button', {
          class: 'btn sm',
          html: Icons.copy + '<span>Kopyala</span>',
          onClick: () => {
            api.app.copy(logLines.join('\n'));
            toast('Günlük panoya kopyalandı.', 'ok');
          },
        }),
        el('button', {
          class: 'btn sm ghost',
          html: Icons.trash + '<span>Temizle</span>',
          onClick: () => {
            logLines = [];
            refreshTab();
          },
        })
      ),
      view
    );
  }

  // ------------------------------------------------------------- actions
  async function launch() {
    if (!State.account) {
      toast('Önce bir hesap ekleyin.', 'err');
      window.Views.accounts.open();
      return;
    }
    try {
      await api.game.launch(profile.id);
    } catch (e) {
      toast(e.message, 'err', 'Başlatılamadı', 9000);
    }
  }

  async function stop() {
    await api.game.stop(profile.id);
  }

  function menu(e) {
    contextMenu(e.clientX, e.clientY, [
      {
        label: 'Paketi dışa aktar (.mrpack)',
        icon: Icons.upload,
        onClick: async () => {
          const res = await api.profiles.exportPack(profile.id, { includeConfigs: true });
          if (res) toast('Paket dışa aktarıldı.', 'ok');
        },
      },
      { label: 'Klasörü aç', icon: Icons.folder, onClick: () => api.profiles.openFolder(profile.id) },
      {
        label: 'Kopyasını oluştur',
        icon: Icons.copy,
        onClick: async () => {
          const name = await promptDialog({ title: 'Kopyala', label: 'Ad', value: profile.name + ' kopya' });
          if (!name) return;
          const p = await api.profiles.duplicate(profile.id, name);
          await window.UI.loadProfiles();
          go('profile', p.id);
        },
      },
      '-',
      {
        label: 'Yeniden adlandır',
        icon: Icons.edit,
        onClick: async () => {
          const name = await promptDialog({ title: 'Yeniden adlandır', label: 'Ad', value: profile.name });
          if (!name) return;
          await api.profiles.update(profile.id, { name });
          await window.UI.loadProfiles();
          go('profile', profile.id);
        },
      },
      {
        label: 'Simgeyi değiştir',
        icon: Icons.image,
        onClick: () => changeIcon(),
      },
      '-',
      {
        label: 'Profili sil',
        icon: Icons.trash,
        danger: true,
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Profili sil',
            message: `"${profile.name}" ve tüm dosyaları silinecek. Emin misin?`,
            confirmText: 'Sil',
            danger: true,
          });
          if (!ok) return;
          await api.profiles.remove(profile.id, true);
          await window.UI.loadProfiles();
          go('home');
        },
      },
    ]);
  }

  function changeIcon() {
    const input = el('input', { type: 'file', accept: 'image/*' });
    input.addEventListener('change', () => {
      const f = input.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = async () => {
        const dataUrl = await window.Views.home.cropToPng(r.result, 256);
        await api.profiles.update(profile.id, { iconData: dataUrl });
        await window.UI.loadProfiles();
        go('profile', profile.id);
      };
      r.readAsDataURL(f);
    });
    input.click();
  }

  window.Views.profile = { render };
})();
