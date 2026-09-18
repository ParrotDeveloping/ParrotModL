/* Yeniden kullanılabilir içerik tarayıcı (Keşfet + profil içi mod arama) */
(function () {
  const {
    el,
    toast,
    modal,
    emptyState,
    spinnerBlock,
    debounce,
    iconImg,
    sourceChip,
    fmtNum,
    fmtAgo,
    esc,
    TYPE_LABEL,
  } = window.UI;
  const api = window.api;

  const TYPES = [
    { id: 'mod', label: 'Modlar', icon: () => Icons.cube },
    { id: 'resourcepack', label: 'Kaynak Paketleri', icon: () => Icons.image },
    { id: 'shader', label: 'Shaderlar', icon: () => Icons.zap },
    { id: 'modpack', label: 'Mod Paketleri', icon: () => Icons.package },
    { id: 'datapack', label: 'Veri Paketleri', icon: () => Icons.box },
  ];

  const SORTS = [
    ['relevance', 'İlgi'],
    ['downloads', 'İndirme'],
    ['follows', 'Takipçi'],
    ['updated', 'Güncellenme'],
    ['newest', 'Yeni'],
  ];

  /**
   * @param {object} opts
   *   host, profile (optional, locks version/loader), onInstall(hit) custom action,
   *   types (array of type ids), defaultType
   */
  function create(opts = {}) {
    const st = {
      query: '',
      type: opts.defaultType || 'mod',
      provider: 'both',
      sort: 'relevance',
      gameVersion: opts.profile ? opts.profile.mcVersion : '',
      loader: opts.profile ? (opts.profile.loader === 'vanilla' ? '' : opts.profile.loader) : '',
      offset: 0,
      limit: 20,
      loading: false,
      exhausted: false,
      hits: [],
    };

    const results = el('div', { class: 'content-grid' });
    const more = el('div', { style: { display: 'grid', placeItems: 'center', padding: '18px' } });
    const statusLine = el('div', {
      style: {
        fontSize: '12px',
        color: 'var(--amber)',
        marginBottom: '10px',
        display: '-webkit-box',
        WebkitLineClamp: '2',
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      },
    });

    const searchInput = el('input', {
      class: 'input',
      placeholder: 'Ara...',
      onInput: debounce((e) => {
        st.query = e.target.value;
        reset();
      }, 380),
    });

    const providerSeg = el(
      'div',
      { class: 'seg vertical' },
      ...[
        ['both', 'Hepsi'],
        ['modrinth', 'Modrinth'],
        ['curseforge', 'CurseForge'],
      ].map(([v, t]) =>
        el('button', {
          class: st.provider === v ? 'active' : '',
          text: t,
          'data-v': v,
          onClick: (e) => {
            st.provider = v;
            [...providerSeg.children].forEach((c) => c.classList.toggle('active', c.dataset.v === v));
            reset();
          },
        })
      )
    );

    const typeSeg = el('div', { class: 'tabs', style: { marginBottom: '14px' } });
    const typeList = (opts.types || TYPES.map((t) => t.id)).map((id) => TYPES.find((t) => t.id === id)).filter(Boolean);
    for (const t of typeList) {
      typeSeg.appendChild(
        el('button', {
          class: 'tab' + (st.type === t.id ? ' active' : ''),
          text: t.label,
          'data-t': t.id,
          onClick: () => {
            st.type = t.id;
            [...typeSeg.children].forEach((c) => c.classList.toggle('active', c.dataset.t === t.id));
            reset();
          },
        })
      );
    }

    const sortSelect = el(
      'select',
      {
        class: 'select',
        onChange: (e) => {
          st.sort = e.target.value;
          reset();
        },
      },
      ...SORTS.map(([v, t]) => el('option', { value: v, text: t }))
    );

    const versionSelect = el('select', { class: 'select js-filter-version' });
    const loaderSelect = el('select', { class: 'select js-filter-loader' });

    const filters = el(
      'div',
      { class: 'filters' },
      el(
        'div',
        { class: 'card', style: { padding: '14px' } },
        el('div', { style: { fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', marginBottom: '10px' } }, 'Kaynak'),
        providerSeg
      ),
      el(
        'div',
        { class: 'card', style: { padding: '14px', display: 'grid', gap: '12px' } },
        el('div', { style: { fontSize: '12px', fontWeight: 700, color: 'var(--text-2)' } }, 'Filtreler'),
        el('div', { class: 'field' }, el('label', { text: 'Sıralama' }), sortSelect),
        el('div', { class: 'field' }, el('label', { text: 'Minecraft sürümü' }), versionSelect),
        el('div', { class: 'field' }, el('label', { text: 'Mod loader' }), loaderSelect)
      )
    );

    if (opts.profile) {
      versionSelect.disabled = true;
      loaderSelect.disabled = true;
      versionSelect.innerHTML = `<option>${esc(opts.profile.mcVersion)}</option>`;
      loaderSelect.innerHTML = `<option>${esc(window.UI.LOADER_LABEL[opts.profile.loader] || opts.profile.loader)}</option>`;
    } else {
      loaderSelect.innerHTML =
        '<option value="">Hepsi</option>' +
        ['fabric', 'forge', 'neoforge', 'quilt'].map((l) => `<option value="${l}">${window.UI.LOADER_LABEL[l]}</option>`).join('');
      loaderSelect.addEventListener('change', () => {
        st.loader = loaderSelect.value;
        reset();
      });
      versionSelect.innerHTML = '<option value="">Hepsi</option>';
      api.mc
        .versions(false)
        .then((list) => {
          versionSelect.innerHTML =
            '<option value="">Hepsi</option>' + list.map((v) => `<option value="${v.id}">${v.id}</option>`).join('');
        })
        .catch(() => {});
      versionSelect.addEventListener('change', () => {
        st.gameVersion = versionSelect.value;
        reset();
      });
    }

    const searchBar = el(
      'div',
      { class: 'toolbar', style: { marginBottom: '0' } },
      el('div', { class: 'search-box' }, el('span', { html: Icons.search }), searchInput)
    );

    const rightCol = el('div', {}, searchBar, typeSeg, statusLine, results, more);
    const layout = el('div', { class: 'discover-layout' }, filters, rightCol);

    function reset() {
      st.offset = 0;
      st.exhausted = false;
      st.hits = [];
      results.innerHTML = '';
      load();
    }

    async function load() {
      if (st.loading || st.exhausted) return;
      st.loading = true;
      more.innerHTML = '';
      more.appendChild(spinnerBlock(st.offset ? 'Daha fazla yükleniyor...' : 'Aranıyor...'));
      try {
        const res = await api.content.search({
          query: st.query,
          type: st.type,
          provider: st.provider,
          sort: st.sort,
          gameVersion: st.gameVersion || '',
          loader: st.type === 'mod' || st.type === 'modpack' ? st.loader || '' : '',
          offset: st.offset,
          limit: st.limit,
        });
        more.innerHTML = '';
        if (res.errors && res.errors.length) {
          statusLine.textContent = res.errors.map((e) => `${e.provider}: ${e.message.split('\n')[0]}`).join(' · ');
        } else {
          statusLine.textContent = '';
        }
        if (!res.hits.length) {
          st.exhausted = true;
          if (!st.offset) {
            results.appendChild(emptyState(Icons.search, 'Sonuç bulunamadı', 'Filtreleri gevşetmeyi deneyin.'));
          }
          return;
        }
        for (const hit of res.hits) {
          st.hits.push(hit);
          results.appendChild(card(hit));
        }
        st.offset += st.limit;
        if (res.hits.length < st.limit / 2) st.exhausted = true;
        else {
          more.appendChild(
            el('button', {
              class: 'btn',
              text: 'Daha fazla yükle',
              onClick: () => {
                more.innerHTML = '';
                load();
              },
            })
          );
        }
      } catch (e) {
        more.innerHTML = '';
        if (!st.offset) results.appendChild(emptyState(Icons.alert, 'Arama başarısız', e.message));
        else toast(e.message, 'err');
      } finally {
        st.loading = false;
      }
    }

    function card(hit) {
      const acts = el('div', { class: 'acts' });
      if (opts.onInstall) {
        acts.appendChild(
          el('button', {
            class: 'btn primary sm',
            html: Icons.download,
            title: 'Kur',
            onClick: (e) => opts.onInstall(hit, e.currentTarget),
          })
        );
      }
      acts.appendChild(
        el('button', {
          class: 'btn sm ghost',
          html: Icons.info,
          title: 'Detaylar',
          onClick: () => details(hit, opts),
        })
      );

      return el(
        'div',
        { class: 'content-card' },
        iconImg(hit.icon, hit.title),
        el(
          'div',
          { class: 'info' },
          el(
            'div',
            { class: 'nm' },
            el('span', { class: 't', text: hit.title, title: hit.title }),
            el('span', { html: sourceChip(hit.source) })
          ),
          el('div', { class: 'ds', text: hit.description || '' }),
          el(
            'div',
            { class: 'ft' },
            el('span', { class: 'stat', html: Icons.download + ' ' + fmtNum(hit.downloads) }),
            hit.follows ? el('span', { class: 'stat', html: Icons.star + ' ' + fmtNum(hit.follows) }) : null,
            hit.updated ? el('span', { text: fmtAgo(hit.updated) }) : null,
            ...(hit.loaders || []).slice(0, 3).map((l) => el('span', { html: window.UI.loaderChip(l) }))
          )
        ),
        acts
      );
    }

    load();
    return { node: layout, reset, state: st };
  }

  /** Proje detay modalı: açıklama, galeri, sürüm listesi */
  async function details(hit, opts = {}) {
    const body = el('div', {}, spinnerBlock('Yükleniyor...'));
    const m = modal({ title: hit.title, subtitle: hit.description, width: 'wide', body });

    try {
      const proj = await api.content.project(hit.source, hit.id);
      const versions = await api.content.versions(
        hit.source,
        hit.id,
        opts.profile && opts.profile.loader !== 'vanilla' ? opts.profile.loader : '',
        opts.profile ? opts.profile.mcVersion : ''
      );

      body.innerHTML = '';
      const tabs = el('div', { class: 'tabs' });
      const pane = el('div', {});
      const mk = (label, fn) => {
        const b = el('button', {
          class: 'tab',
          text: label,
          onClick: () => {
            [...tabs.children].forEach((c) => c.classList.remove('active'));
            b.classList.add('active');
            pane.innerHTML = '';
            pane.appendChild(fn());
          },
        });
        tabs.appendChild(b);
        return b;
      };

      const descTab = mk('Açıklama', () => {
        const wrap = el('div', {});
        if (proj.gallery && proj.gallery.length) {
          const strip = el('div', { class: 'gallery-strip' });
          for (const g of proj.gallery.slice(0, 12)) {
            strip.appendChild(
              el('img', { src: g.url, loading: 'lazy', onClick: () => api.app.openExternal(g.url) })
            );
          }
          wrap.appendChild(strip);
        }
        wrap.appendChild(el('div', { class: 'markdown', html: renderMarkdown(proj.body || proj.description || '') }));
        return wrap;
      });

      mk(`Sürümler (${versions.length})`, () => {
        const list = el('div', { style: { display: 'grid', gap: '8px' } });
        if (!versions.length) {
          list.appendChild(emptyState(Icons.alert, 'Uygun sürüm yok', 'Bu filtrelerle indirilebilir dosya bulunamadı.'));
          return list;
        }
        for (const v of versions.slice(0, 60)) {
          list.appendChild(
            el(
              'div',
              { class: 'mod-row' },
              el('div', { class: 'ph', style: { display: 'grid', placeItems: 'center', color: 'var(--text-3)' }, html: Icons.package }),
              el(
                'div',
                { class: 'info' },
                el('div', { class: 'nm', text: v.name || v.versionNumber }),
                el('div', {
                  class: 'sub',
                  text: `${(v.gameVersions || []).slice(0, 5).join(', ')} · ${(v.loaders || []).join(', ') || '-'} · ${fmtAgo(v.date)}`,
                })
              ),
              el('span', {
                class: 'chip ' + (v.type === 'release' ? 'green' : v.type === 'beta' ? 'amber' : 'red'),
                text: v.type,
              }),
              opts.onInstallVersion
                ? el('button', {
                    class: 'btn primary sm',
                    text: 'Kur',
                    onClick: (e) => opts.onInstallVersion(hit, v, e.currentTarget),
                  })
                : null,
              el('button', {
                class: 'btn sm ghost',
                html: Icons.download,
                title: 'Dosya olarak indir',
                onClick: async () => {
                  try {
                    const r = await api.content.downloadToFolder({
                      source: hit.source,
                      projectId: hit.id,
                      versionId: v.id,
                    });
                    if (r) toast(r.name + ' indirildi.', 'ok');
                  } catch (e) {
                    toast(e.message, 'err');
                  }
                },
              })
            )
          );
        }
        return list;
      });

      mk('Bilgi', () => {
        const dl = el('dl', { class: 'kv' });
        const add = (k, v) => {
          if (!v) return;
          dl.appendChild(el('dt', { text: k }));
          dl.appendChild(el('dd', { text: String(v) }));
        };
        add('Tür', TYPE_LABEL[proj.projectType] || proj.projectType);
        add('İndirme', fmtNum(proj.downloads));
        add('Takipçi', fmtNum(proj.follows));
        add('Kategoriler', (proj.categories || []).join(', '));
        add('Loader', (proj.loaders || []).join(', '));
        add('Lisans', proj.license);
        add('Sürümler', (proj.gameVersions || []).slice(-12).join(', '));
        const wrap = el('div', {}, dl);
        wrap.appendChild(
          el(
            'div',
            { style: { display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' } },
            el('button', {
              class: 'btn sm',
              html: Icons.external + '<span>Proje sayfası</span>',
              onClick: () => api.app.openExternal(proj.url || hit.url),
            }),
            proj.source_url
              ? el('button', {
                  class: 'btn sm',
                  html: Icons.link + '<span>Kaynak kod</span>',
                  onClick: () => api.app.openExternal(proj.source_url),
                })
              : null,
            proj.issues
              ? el('button', {
                  class: 'btn sm',
                  html: Icons.alert + '<span>Sorunlar</span>',
                  onClick: () => api.app.openExternal(proj.issues),
                })
              : null
          )
        );
        return wrap;
      });

      body.appendChild(tabs);
      body.appendChild(pane);
      descTab.click();
    } catch (e) {
      body.innerHTML = '';
      body.appendChild(emptyState(Icons.alert, 'Detaylar alınamadı', e.message));
    }
  }

  /** Küçük ve güvenli markdown -> html (sadece temel biçimlendirme) */
  function renderMarkdown(md) {
    let s = esc(String(md || '').slice(0, 24000));
    s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img alt="$1" src="$2" loading="lazy">');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    s = s.replace(/^###\s?(.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^##\s?(.+)$/gm, '<h2>$1</h2>');
    s = s.replace(/^#\s?(.+)$/gm, '<h1>$1</h1>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
    s = s.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    s = s.replace(/\n{2,}/g, '</p><p>');
    return '<p>' + s + '</p>';
  }

  window.ContentBrowser = { create, details, renderMarkdown, TYPES };
})();
