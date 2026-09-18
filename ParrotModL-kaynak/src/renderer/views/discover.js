/* Keşfet - Modrinth + CurseForge içerik tarayıcısı */
(function () {
  const { el, toast, modal, go, emptyState, iconImg, loaderChip, esc } = window.UI;
  const api = window.api;
  const State = window.State;

  async function render(host) {
    await window.UI.loadProfiles();

    host.appendChild(
      el(
        'div',
        { class: 'page-head' },
        el(
          'div',
          {},
          el('h1', { text: 'Keşfet' }),
          el('p', { text: 'Modrinth ve CurseForge’daki modları, kaynak paketlerini, shaderları ve mod paketlerini tara.' })
        )
      )
    );

    const browser = window.ContentBrowser.create({
      defaultType: 'mod',
      onInstall: (hit, btn) => chooseTarget(hit, null, btn),
      onInstallVersion: (hit, version, btn) => chooseTarget(hit, version, btn),
    });
    host.appendChild(browser.node);
  }

  /** "İndir"e basınca: profile mi, dosya olarak mı? */
  function chooseTarget(hit, version, btn) {
    const isModpack = hit.projectType === 'modpack';

    const body = el(
      'div',
      { style: { display: 'grid', gap: '12px' } },
      el(
        'div',
        { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
        iconImg(hit.icon, hit.title),
        el(
          'div',
          {},
          el('div', { style: { fontWeight: 700 }, text: hit.title }),
          el('div', { style: { fontSize: '12px', color: 'var(--text-3)' }, text: hit.description || '' })
        )
      ),
      el('div', { style: { height: '1px', background: 'var(--border)' } }),
      optionRow(
        Icons.cube,
        isModpack ? 'Yeni profil olarak kur' : 'Profile indir',
        isModpack
          ? 'Mod paketi indirilir ve yeni bir profil olarak kurulur.'
          : 'Bir profil seç; uygun sürüm ve gerekli bağımlılıklar otomatik indirilir.',
        () => {
          m.close();
          isModpack ? installModpack(hit, version) : pickProfile(hit, version);
        }
      ),
      optionRow(
        Icons.folder,
        'Dosya olarak indir',
        'Klasör seçersin, dosya oraya indirilir. Profillere dokunulmaz.',
        async () => {
          m.close();
          try {
            const r = await api.content.downloadToFolder({
              source: hit.source,
              projectId: hit.id,
              versionId: version ? version.id : null,
              gameVersion: browserVersion(),
              loader: browserLoader(),
            });
            if (r) toast(r.name + ' indirildi.', 'ok', 'Tamamlandı');
          } catch (e) {
            toast(e.message, 'err', 'İndirilemedi', 8000);
          }
        }
      )
    );

    const m = modal({ title: 'Nasıl indirilsin?', body });
  }

  function browserVersion() {
    const s = document.querySelector('.js-filter-version');
    return s && !s.disabled ? s.value : '';
  }
  function browserLoader() {
    const s = document.querySelector('.js-filter-loader');
    return s && !s.disabled ? s.value : '';
  }

  function optionRow(icon, title, desc, onClick) {
    return el(
      'button',
      {
        class: 'card',
        style: {
          display: 'flex',
          gap: '13px',
          alignItems: 'center',
          textAlign: 'left',
          cursor: 'pointer',
          width: '100%',
          transition: 'border-color .18s, background .18s',
        },
        onClick,
        onMouseenter: (e) => {
          e.currentTarget.style.borderColor = 'var(--accent)';
          e.currentTarget.style.background = 'var(--surface-2)';
        },
        onMouseleave: (e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.background = 'var(--surface)';
        },
      },
      el('span', {
        html: icon,
        style: {
          width: '38px',
          height: '38px',
          display: 'grid',
          placeItems: 'center',
          borderRadius: '11px',
          background: 'var(--accent-soft)',
          color: 'var(--accent)',
          flex: 'none',
        },
      }),
      el(
        'span',
        { style: { flex: 1 } },
        el('span', { style: { display: 'block', fontWeight: 700, fontSize: '14px' }, text: title }),
        el('span', { style: { display: 'block', fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }, text: desc })
      ),
      el('span', {
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
        style: { width: '18px', color: 'var(--text-3)' },
      })
    );
  }

  /** Profil seçme + uyumluluk kontrolü */
  async function pickProfile(hit, version) {
    if (!State.profiles.length) {
      const m0 = modal({
        title: 'Profil yok',
        body: el('p', { text: 'Önce bir profil oluşturmalısın.', style: { color: 'var(--text-2)' } }),
        footer: el('button', {
          class: 'btn primary',
          text: 'Profil oluştur',
          onClick: () => {
            m0.close();
            go('home');
            setTimeout(() => window.Views.home.createProfileDialog(), 250);
          },
        }),
      });
      return;
    }

    const list = el('div', { style: { display: 'grid', gap: '8px' } });
    const m = modal({
      title: 'Hangi profile?',
      subtitle: hit.title,
      width: 'wide',
      body: list,
    });

    const type = hit.projectType === 'mod' ? 'mod' : hit.projectType || 'mod';

    for (const p of State.profiles) {
      const row = el(
        'div',
        { class: 'mod-row' },
        p.iconUrl
          ? el('img', { src: p.iconUrl })
          : el('div', { class: 'ph', style: { display: 'grid', placeItems: 'center', fontWeight: 800, color: 'var(--text-3)' }, text: p.name[0].toUpperCase() }),
        el(
          'div',
          { class: 'info' },
          el('div', { class: 'nm', text: p.name }),
          el('div', { class: 'sub', html: `${esc(p.mcVersion)} · ${window.UI.LOADER_LABEL[p.loader] || p.loader}` })
        ),
        el('span', { class: 'status-slot', html: '<span class="spinner" style="width:15px;height:15px"></span>' })
      );
      list.appendChild(row);

      // uyumluluk kontrolü
      (async () => {
        const slot = row.querySelector('.status-slot');
        try {
          const c = await api.profiles.compatibility(p.id, hit.source, hit.id, type);
          slot.innerHTML = '';
          if (!c.ok) {
            slot.appendChild(el('span', { class: 'chip red', text: 'Uyumsuz', title: c.reason }));
            row.style.opacity = '0.62';
            row.title = c.reason;
            row.appendChild(
              el('button', {
                class: 'btn sm ghost',
                text: 'Neden?',
                onClick: () => toast(c.reason, 'err', p.name + ' için uyumsuz', 9000),
              })
            );
            return;
          }
          slot.appendChild(
            el('button', {
              class: 'btn primary sm',
              text: 'Bu profile indir',
              onClick: async (e) => {
                const b = e.currentTarget;
                b.disabled = true;
                b.textContent = 'İndiriliyor...';
                try {
                  const res = await api.profiles.install(p.id, {
                    source: hit.source,
                    projectId: hit.id,
                    versionId: version ? version.id : null,
                    type,
                    withDependencies: true,
                  });
                  b.textContent = 'Kuruldu ✓';
                  const extra = res.installed.length - 1;
                  toast(
                    `${hit.title} → ${p.name}${extra > 0 ? ` (+${extra} bağımlılık)` : ''}`,
                    'ok',
                    'Kuruldu'
                  );
                  if (res.missing && res.missing.length) {
                    toast(`${res.missing.length} bağımlılık bulunamadı.`, 'err', 'Uyarı');
                  }
                } catch (err) {
                  b.disabled = false;
                  b.textContent = 'Bu profile indir';
                  toast(err.message, 'err', 'Kurulamadı', 9000);
                }
              },
            })
          );
        } catch (e) {
          slot.innerHTML = '';
          slot.appendChild(el('span', { class: 'chip red', text: 'Uyumsuz', title: e.message }));
          row.style.opacity = '0.62';
          row.title = e.message;
        }
      })();
    }
  }

  async function installModpack(hit, version) {
    const kill = toast('Mod paketi kuruluyor, bu biraz sürebilir...', 'info', hit.title, 600000);
    try {
      const p = await api.profiles.installModpack({
        source: hit.source,
        projectId: hit.id,
        versionId: version ? version.id : null,
        name: hit.title,
      });
      kill();
      await window.UI.loadProfiles();
      toast(`"${p.name}" kuruldu.`, 'ok');
      go('profile', p.id);
    } catch (e) {
      kill();
      toast(e.message, 'err', 'Kurulamadı', 10000);
    }
  }

  window.Views.discover = { render };
})();
