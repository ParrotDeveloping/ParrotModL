/* Ayarlar - görünüm, oyun, java, içerik, hesap, hakkında */
(function () {
  const { el, toast, modal, confirmDialog, applyTheme, esc, fmtBytes, spinnerBlock } = window.UI;
  const api = window.api;
  const State = window.State;

  const ACCENTS = [
    ['#2f7bff', 'Mavi'],
    ['#4aa8ff', 'Gök'],
    ['#1b5fd6', 'Lacivert'],
    ['#00c2d1', 'Turkuaz'],
    ['#7c5cff', 'Mor'],
    ['#1bd96a', 'Yeşil'],
    ['#ff8a3d', 'Turuncu'],
    ['#ff4d6d', 'Kırmızı'],
    ['#ffb02e', 'Sarı'],
  ];

  const SECTIONS = [
    { id: 'appearance', label: 'Görünüm', icon: () => Icons.palette },
    { id: 'game', label: 'Oyun', icon: () => Icons.play },
    { id: 'java', label: 'Java', icon: () => Icons.cpu },
    { id: 'content', label: 'İçerik', icon: () => Icons.package },
    { id: 'account', label: 'Hesap', icon: () => Icons.user },
    { id: 'storage', label: 'Depolama', icon: () => Icons.folder },
    { id: 'about', label: 'Hakkında', icon: () => Icons.info },
  ];

  let current = 'appearance';

  async function render(host) {
    State.settings = await api.settings.get();
    State.appInfo = await api.app.info();

    host.appendChild(
      el(
        'div',
        { class: 'page-head' },
        el('div', {}, el('h1', { text: 'Ayarlar' }), el('p', { text: 'Launcher’ı kendine göre ayarla.' }))
      )
    );

    const nav = el('div', { class: 'settings-nav' });
    const pane = el('div', { class: 'settings-section' });

    for (const s of SECTIONS) {
      nav.appendChild(
        el('button', {
          class: current === s.id ? 'active' : '',
          text: s.label,
          'data-s': s.id,
          onClick: () => {
            current = s.id;
            [...nav.children].forEach((c) => c.classList.toggle('active', c.dataset.s === s.id));
            paint(pane);
          },
        })
      );
    }

    host.appendChild(el('div', { class: 'settings-layout' }, nav, pane));
    paint(pane);
  }

  async function save(patch, { silent = false } = {}) {
    const res = await api.settings.set(patch);
    State.settings = res.settings;
    applyTheme(State.settings);
    if (!silent) toast('Kaydedildi.', 'ok', null, 1600);
    if (res.needsRestart) {
      toast('Veri klasörü değişti. Etkili olması için launcher’ı yeniden başlat.', 'info', 'Yeniden başlat', 9000);
    }
    return res;
  }

  function toggleRow(title, desc, key, onChange) {
    const sw = el('div', { class: 'switch' + (State.settings[key] ? ' on' : '') });
    const row = el(
      'div',
      {
        class: 'row-toggle',
        style: { cursor: 'pointer' },
        onClick: async () => {
          const v = !State.settings[key];
          sw.classList.toggle('on', v);
          await save({ [key]: v }, { silent: true });
          if (onChange) onChange(v);
        },
      },
      el('div', { class: 'rt-text' }, el('strong', { text: title }), el('span', { text: desc })),
      sw
    );
    return row;
  }

  function paint(pane) {
    pane.innerHTML = '';
    const fn = {
      appearance,
      game,
      java,
      content,
      account,
      storage,
      about,
    }[current];
    Promise.resolve(fn(pane)).catch((e) => {
      pane.innerHTML = '';
      pane.appendChild(el('div', { class: 'card', text: e.message, style: { color: 'var(--red)' } }));
    });
  }

  // ---------------------------------------------------------------- görünüm
  function appearance(pane) {
    const swatches = el('div', { class: 'color-row' });
    for (const [hex, name] of ACCENTS) {
      swatches.appendChild(
        el('button', {
          class: 'swatch' + (State.settings.accent.toLowerCase() === hex ? ' sel' : ''),
          style: { background: hex },
          title: name,
          onClick: async (ev) => {
            await save({ accent: hex }, { silent: true });
            [...swatches.children].forEach((c) => c.classList.remove('sel'));
            ev.currentTarget.classList.add('sel');
            customColor.value = hex;
          },
        })
      );
    }
    const customColor = el('input', {
      type: 'color',
      value: State.settings.accent,
      style: { width: '44px', height: '34px', border: 'none', background: 'none', cursor: 'pointer', padding: 0 },
      onInput: (e) => save({ accent: e.target.value }, { silent: true }),
    });
    swatches.appendChild(customColor);

    const themeSeg = el('div', { class: 'seg' });
    for (const [v, t] of [['dark', 'Koyu'], ['midnight', 'Gece Yarısı'], ['light', 'Açık']]) {
      themeSeg.appendChild(
        el('button', {
          class: State.settings.theme === v ? 'active' : '',
          text: t,
          onClick: async (e) => {
            await save({ theme: v }, { silent: true });
            [...themeSeg.children].forEach((c) => c.classList.toggle('active', c === e.currentTarget));
          },
        })
      );
    }

    const scale = el('input', {
      type: 'range',
      min: 85,
      max: 125,
      step: 5,
      value: State.settings.fontScale || 100,
      onChange: (e) => save({ fontScale: Number(e.target.value) }, { silent: true }),
      onInput: (e) => {
        document.documentElement.style.fontSize = (Number(e.target.value) / 100) * 16 + 'px';
        scaleLabel.textContent = e.target.value + '%';
      },
    });
    const scaleLabel = el('span', { text: (State.settings.fontScale || 100) + '%', style: { fontSize: '12px', color: 'var(--text-2)' } });

    const bgInput = el('input', {
      class: 'input',
      placeholder: 'https://... veya boş bırak',
      value: State.settings.bgImage || '',
    });

    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Ana renk' }),
        el('div', { class: 'sub', text: 'Butonlar, vurgular ve simgeler bu rengi kullanır.' }),
        swatches
      )
    );
    pane.appendChild(
      el('div', { class: 'card' }, el('h3', { text: 'Tema' }), el('div', { class: 'sub', text: 'Arayüzün genel parlaklığı.' }), themeSeg)
    );
    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Arka plan görseli' }),
        el('div', { class: 'sub', text: 'İsteğe bağlı; arayüzün arkasında soluk görünür.' }),
        el(
          'div',
          { style: { display: 'flex', gap: '8px' } },
          bgInput,
          el('button', {
            class: 'btn',
            text: 'Uygula',
            onClick: () => save({ bgImage: bgInput.value.trim() }),
          }),
          el('button', {
            class: 'btn ghost',
            text: 'Temizle',
            onClick: () => {
              bgInput.value = '';
              save({ bgImage: '' });
            },
          })
        )
      )
    );
    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Arayüz' }),
        toggleRow('Animasyonlar', 'Geçiş ve hover animasyonları', 'animations'),
        toggleRow('Sıkışık kartlar', 'Profil kartlarını küçült, ekrana daha çok sığsın', 'compactCards'),
        el(
          'div',
          { class: 'row-toggle' },
          el('div', { class: 'rt-text' }, el('strong', { text: 'Yazı boyutu' }), el('span', { text: 'Arayüz ölçeği' })),
          el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', width: '220px' } }, scale, scaleLabel)
        )
      )
    );
  }

  // ---------------------------------------------------------------- oyun
  function game(pane) {
    const total = State.appInfo.totalMemoryMb || 8192;
    const mem = el('input', {
      type: 'range',
      min: 1024,
      max: Math.max(4096, Math.min(total - 1024, 32768)),
      step: 512,
      value: State.settings.memoryMb,
      onInput: (e) => (memLabel.textContent = (e.target.value / 1024).toFixed(1) + ' GB'),
      onChange: (e) => save({ memoryMb: Number(e.target.value) }, { silent: true }),
    });
    const memLabel = el('span', {
      text: (State.settings.memoryMb / 1024).toFixed(1) + ' GB',
      style: { fontSize: '12.5px', color: 'var(--text-2)', minWidth: '58px' },
    });

    const jvm = el('textarea', { class: 'input', rows: 3, value: State.settings.jvmArgs || '' });
    const w = el('input', { class: 'input', type: 'number', value: State.settings.width });
    const h = el('input', { class: 'input', type: 'number', value: State.settings.height });

    const after = el(
      'select',
      { class: 'select', onChange: (e) => save({ afterLaunch: e.target.value }, { silent: true }) },
      ...[
        ['minimize', 'Launcher’ı küçült'],
        ['keep', 'Açık kalsın'],
        ['close', 'Gizle'],
      ].map(([v, t]) => el('option', { value: v, text: t, selected: State.settings.afterLaunch === v }))
    );

    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Bellek (RAM)' }),
        el('div', { class: 'sub', text: `Varsayılan ayırma. Sistemde ${(total / 1024).toFixed(1)} GB var. Profil bazında ayrıca ayarlanabilir.` }),
        el('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } }, mem, memLabel)
      )
    );
    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Pencere boyutu' }),
        el('div', { class: 'sub', text: 'Oyunun açılış çözünürlüğü.' }),
        el(
          'div',
          { class: 'grid-2' },
          el('div', { class: 'field' }, el('label', { text: 'Genişlik' }), w),
          el('div', { class: 'field' }, el('label', { text: 'Yükseklik' }), h)
        ),
        el('div', { style: { marginTop: '12px' } }, toggleRow('Tam ekran', 'Oyun tam ekran başlasın', 'fullscreen'))
      )
    );
    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'JVM argümanları' }),
        el('div', { class: 'sub', text: 'Gelişmiş: performans için ek Java argümanları.' }),
        jvm,
        el(
          'div',
          { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
          el('button', { class: 'btn sm primary', text: 'Kaydet', onClick: () => save({ jvmArgs: jvm.value, width: Number(w.value), height: Number(h.value) }) }),
          el('button', {
            class: 'btn sm ghost',
            text: 'Önerilene dön',
            onClick: () => {
              jvm.value =
                '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:MaxGCPauseMillis=50';
              save({ jvmArgs: jvm.value });
            },
          })
        )
      )
    );
    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Başlatma davranışı' }),
        el('div', { class: 'sub', text: 'Oyun açıldığında launcher ne yapsın?' }),
        after,
        el('div', { style: { marginTop: '10px' } }, toggleRow('Konsolu göster', 'Oyunla birlikte Java konsol penceresi açılsın (hata ayıklama)', 'showConsole'))
      )
    );
  }

  // ---------------------------------------------------------------- java
  async function java(pane) {
    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Java yönetimi' }),
        el('div', { class: 'sub', text: 'ParrotModL her Minecraft sürümü için doğru Java’yı kendi seçer ve gerekirse indirir.' }),
        toggleRow('Otomatik Java indir', 'Gerekli Java sürümü yoksa Adoptium’dan indir', 'autoJava')
      )
    );

    const pathInput = el('input', { class: 'input', value: State.settings.javaPath || '', placeholder: 'Boş = otomatik' });
    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Elle Java yolu' }),
        el('div', { class: 'sub', text: 'java.exe dosyasının tam yolu. Boş bırakırsan otomatik seçilir.' }),
        el(
          'div',
          { style: { display: 'flex', gap: '8px' } },
          pathInput,
          el('button', {
            class: 'btn',
            text: 'Gözat',
            onClick: async () => {
              const p = await api.settings.pickFile('java.exe seç', [{ name: 'Java', extensions: ['exe', ''] }]);
              if (p) {
                pathInput.value = p;
                save({ javaPath: p });
              }
            },
          }),
          el('button', { class: 'btn primary', text: 'Kaydet', onClick: () => save({ javaPath: pathInput.value.trim() }) })
        )
      )
    );

    const listCard = el('div', { class: 'card' }, el('h3', { text: 'Bulunan Java sürümleri' }), spinnerBlock('Taranıyor...'));
    pane.appendChild(listCard);

    try {
      const found = await api.java.scan();
      listCard.innerHTML = '';
      listCard.appendChild(el('h3', { text: `Bulunan Java sürümleri (${found.length})` }));
      listCard.appendChild(el('div', { class: 'sub', text: 'Sistemde ve ParrotModL klasöründe bulunanlar.' }));
      if (!found.length) {
        listCard.appendChild(el('div', { style: { color: 'var(--text-3)', fontSize: '13px' }, text: 'Hiç Java bulunamadı. Aşağıdan indirebilirsin.' }));
      }
      for (const j of found) {
        listCard.appendChild(
          el(
            'div',
            { class: 'mod-row', style: { marginBottom: '6px' } },
            el('div', { class: 'ph', style: { display: 'grid', placeItems: 'center', color: 'var(--text-3)' }, html: Icons.cpu }),
            el(
              'div',
              { class: 'info' },
              el('div', { class: 'nm', text: 'Java ' + j.major }),
              el('div', { class: 'sub', text: j.path })
            ),
            el('button', {
              class: 'btn sm',
              text: 'Kullan',
              onClick: () => {
                pathInput.value = j.path;
                save({ javaPath: j.path });
              },
            })
          )
        );
      }
      const dl = el(
        'div',
        { style: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' } },
        el('span', { text: 'İndir:', style: { fontSize: '12.5px', color: 'var(--text-3)', alignSelf: 'center' } })
      );
      for (const major of [8, 17, 21]) {
        dl.appendChild(
          el('button', {
            class: 'btn sm',
            text: `Java ${major}`,
            onClick: async (e) => {
              const b = e.currentTarget;
              b.disabled = true;
              b.textContent = 'İndiriliyor...';
              const off = api.on('java:progress', (p) => (b.textContent = `${p.percent || 0}%`));
              try {
                const v = await api.java.install(major);
                toast(`Java ${v.major} kuruldu.`, 'ok');
                window.UI.refreshRoute();
              } catch (err) {
                toast(err.message, 'err');
                b.disabled = false;
                b.textContent = `Java ${major}`;
              } finally {
                off();
              }
            },
          })
        );
      }
      listCard.appendChild(dl);
    } catch (e) {
      listCard.innerHTML = '';
      listCard.appendChild(el('div', { text: 'Tarama başarısız: ' + e.message, style: { color: 'var(--red)' } }));
    }
  }

  // ---------------------------------------------------------------- içerik
  function content(pane) {
    const provider = el(
      'select',
      { class: 'select', onChange: (e) => save({ defaultProvider: e.target.value }, { silent: true }) },
      ...[
        ['both', 'Her ikisi (Modrinth + CurseForge)'],
        ['modrinth', 'Sadece Modrinth'],
        ['curseforge', 'Sadece CurseForge'],
      ].map(([v, t]) => el('option', { value: v, text: t, selected: State.settings.defaultProvider === v }))
    );

    const conc = el('input', {
      type: 'range',
      min: 2,
      max: 16,
      step: 1,
      value: State.settings.downloadConcurrency,
      onInput: (e) => (concLabel.textContent = e.target.value + ' eşzamanlı'),
      onChange: (e) => save({ downloadConcurrency: Number(e.target.value) }, { silent: true }),
    });
    const concLabel = el('span', {
      text: State.settings.downloadConcurrency + ' eşzamanlı',
      style: { fontSize: '12.5px', color: 'var(--text-2)', minWidth: '96px' },
    });

    const cfKey = el('input', {
      class: 'input',
      type: 'password',
      value: State.settings.curseforgeKey || '',
      placeholder: 'Boş = ücretsiz ortak sunucu kullanılır',
    });

    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Varsayılan kaynak' }),
        el('div', { class: 'sub', text: 'Arama yaparken hangi siteler taransın?' }),
        provider,
        el('div', { style: { marginTop: '12px' } }, toggleRow('Snapshot sürümleri göster', 'Profil oluştururken deneysel sürümler de listelensin', 'showSnapshots'))
      )
    );

    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'İndirme hızı' }),
        el('div', { class: 'sub', text: 'Aynı anda kaç dosya indirilsin. Yavaş bağlantıda düşür.' }),
        el('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } }, conc, concLabel)
      )
    );

    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'CurseForge API anahtarı' }),
        el('div', {
          class: 'sub',
          text: 'İsteğe bağlı. Boş bırakırsan ortak bir aracı sunucu kullanılır; kendi anahtarınla daha hızlı ve limitsiz olur.',
        }),
        el(
          'div',
          { style: { display: 'flex', gap: '8px' } },
          cfKey,
          el('button', { class: 'btn primary', text: 'Kaydet', onClick: () => save({ curseforgeKey: cfKey.value.trim() }) })
        ),
        el('button', {
          class: 'btn sm ghost',
          style: { marginTop: '10px' },
          html: Icons.external + '<span>Anahtar al (console.curseforge.com)</span>',
          onClick: () => api.app.openExternal('https://console.curseforge.com/'),
        })
      )
    );
  }

  // ---------------------------------------------------------------- hesap
  async function account(pane) {
    const accounts = await api.accounts.list();

    const card = el('div', { class: 'card' }, el('h3', { text: 'Hesaplar' }), el('div', { class: 'sub', text: 'Microsoft veya çevrimdışı hesap ekle.' }));
    for (const a of accounts) {
      card.appendChild(
        el(
          'div',
          { class: 'mod-row', style: { marginBottom: '6px' } },
          a.avatar ? el('img', { src: a.avatar }) : el('div', { class: 'ph' }),
          el(
            'div',
            { class: 'info' },
            el('div', { class: 'nm', text: a.name }),
            el('div', { class: 'sub', text: a.type === 'microsoft' ? 'Microsoft hesabı' : 'Çevrimdışı hesap' })
          ),
          a.active ? el('span', { class: 'chip green', text: 'Aktif' }) : null,
          !a.active
            ? el('button', {
                class: 'btn sm',
                text: 'Aktif yap',
                onClick: async () => {
                  await api.accounts.setActive(a.id);
                  await window.UI.loadAccounts();
                  window.UI.refreshRoute();
                },
              })
            : null,
          el('button', {
            class: 'btn icon sm ghost',
            html: Icons.trash,
            title: 'Kaldır',
            onClick: async () => {
              await api.accounts.remove(a.id);
              await window.UI.loadAccounts();
              window.UI.refreshRoute();
            },
          })
        )
      );
    }
    card.appendChild(
      el(
        'div',
        { style: { display: 'flex', gap: '8px', marginTop: '12px' } },
        el('button', { class: 'btn primary', html: Icons.user + '<span>Hesap ekle</span>', onClick: () => window.Views.accounts.open() })
      )
    );
    pane.appendChild(card);

    const clientId = el('input', {
      class: 'input',
      value: State.settings.msClientId || '',
      placeholder: '00000000-0000-0000-0000-000000000000',
    });

    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Microsoft giriş kurulumu' }),
        el('div', {
          class: 'sub',
          text: 'ParrotModL kendi uygulama kimliğiyle gelir; normalde buraya dokunmana gerek yok. ' +
            'Kimlik Mojang onayı bekliyorsa giriş "Invalid app registration" hatası verir. ' +
            'Kendi kimliğini kullanmak istersen aşağıdaki adımları izleyip değiştirebilirsin.',
        }),
        el(
          'ol',
          { class: 'steps' },
          el('li', { text: 'portal.azure.com adresine Microsoft hesabınla gir.' }),
          el('li', { text: '"Microsoft Entra ID" > "Uygulama kayıtları" > "Yeni kayıt" yolunu izle.' }),
          el('li', { text: 'İsim: ParrotModL. Hesap türü: "Yalnızca kişisel Microsoft hesapları". Yönlendirme URI’si gerekmiyor.' }),
          el('li', { text: 'Kaydet. Sonra "Kimlik Doğrulama" sekmesinde "Genel istemci akışlarına izin ver" seçeneğini Evet yap.' }),
          el('li', { text: 'Genel Bakış sayfasındaki "Uygulama (istemci) kimliği"ni kopyalayıp aşağıya yapıştır.' }),
          el('li', {
            text: 'ÖNEMLİ: Mojang, üçüncü taraf launcher’ların uygulama kimliğini ayrıca onaylatmasını istiyor. ' +
              'Aşağıdaki "Onay başvurusu" düğmesinden kimliğini gönder. Onay gelene kadar giriş denemesi ' +
              '"Invalid app registration" hatası verir — bu launcher hatası değildir.',
          })
        ),
        el(
          'div',
          { style: { display: 'flex', gap: '8px', marginTop: '12px' } },
          clientId,
          el('button', { class: 'btn primary', text: 'Kaydet', onClick: () => save({ msClientId: clientId.value.trim() }) })
        ),
        el(
          'div',
          { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
          el('button', {
            class: 'btn sm ghost',
            html: Icons.external + '<span>Azure portalını aç</span>',
            onClick: () => api.app.openExternal('https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade'),
          }),
          el('button', {
            class: 'btn sm primary',
            html: Icons.shield + '<span>Onay başvurusu (Mojang)</span>',
            onClick: () => api.app.openExternal('https://aka.ms/mce-reviewappid'),
          })
        ),
        el('div', {
          style: { marginTop: '10px', fontSize: '12px', color: 'var(--text-3)' },
          text: 'Not: Çevrimdışı hesap bu adımlara hiç gerek duymaz; tek başına oynamak, mod kurmak ve ' +
            'mod paketi çalıştırmak için yeterlidir. Onay yalnızca resmi çok oyunculu sunucular, ' +
            'skin yükleme ve pelerin seçimi için gerekir.',
        })
      )
    );
  }

  // ---------------------------------------------------------------- depolama
  function storage(pane) {
    const dir = el('input', { class: 'input', value: State.settings.dataDir || State.appInfo.dataDir, readonly: true });
    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Veri klasörü' }),
        el('div', { class: 'sub', text: 'Profiller, modlar, sürümler ve Java buraya kurulur.' }),
        el(
          'div',
          { style: { display: 'flex', gap: '8px' } },
          dir,
          el('button', {
            class: 'btn',
            text: 'Değiştir',
            onClick: async () => {
              const p = await api.settings.pickFolder('Yeni veri klasörü');
              if (!p) return;
              const ok = await confirmDialog({
                title: 'Veri klasörünü değiştir',
                message:
                  'Mevcut dosyalar otomatik taşınmaz. Yeni klasör boş başlar; eski profillerini görmek için dosyaları elle taşıman gerekir.',
                confirmText: 'Değiştir',
              });
              if (!ok) return;
              dir.value = p;
              await save({ dataDir: p });
            },
          }),
          el('button', {
            class: 'btn',
            html: Icons.folder,
            title: 'Klasörü aç',
            onClick: () => api.app.openPath(State.settings.dataDir || State.appInfo.dataDir),
          })
        )
      )
    );

    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Sıfırla' }),
        el('div', { class: 'sub', text: 'Tüm launcher ayarlarını varsayılana döndürür. Profiller ve dosyalar silinmez.' }),
        el('button', {
          class: 'btn danger',
          html: Icons.refresh + '<span>Ayarları sıfırla</span>',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'Ayarları sıfırla',
              message: 'Tema, bellek, Java ve içerik ayarları varsayılana dönecek.',
              confirmText: 'Sıfırla',
              danger: true,
            });
            if (!ok) return;
            State.settings = await api.settings.reset();
            applyTheme(State.settings);
            toast('Ayarlar sıfırlandı.', 'ok');
            window.UI.refreshRoute();
          },
        })
      )
    );
  }

  // ---------------------------------------------------------------- hakkında
  function about(pane) {
    const i = State.appInfo;
    pane.appendChild(
      el(
        'div',
        { class: 'card', style: { textAlign: 'center', padding: '30px' } },
        el('img', { src: 'assets/logo.png', style: { width: '76px', height: '76px', borderRadius: '20px', margin: '0 auto 12px' } }),
        el('h3', { text: 'ParrotModL', style: { fontSize: '20px' } }),
        el('div', { class: 'sub', text: 'Sürüm ' + i.version }),
        el('p', {
          style: { color: 'var(--text-2)', fontSize: '13px', maxWidth: '440px', margin: '0 auto' },
          text: 'Modrinth ve CurseForge destekli, açık ve hızlı bir Minecraft mod launcher’ı.',
        })
      )
    );
    const dl = el('dl', { class: 'kv' });
    const add = (k, v) => {
      dl.appendChild(el('dt', { text: k }));
      dl.appendChild(el('dd', { text: String(v) }));
    };
    add('Sürüm', i.version);
    add('Electron', i.electron);
    add('Node.js', i.node);
    add('Platform', i.platform + ' / ' + i.arch);
    add('Sistem belleği', (i.totalMemoryMb / 1024).toFixed(1) + ' GB');
    add('Veri klasörü', i.dataDir);
    pane.appendChild(el('div', { class: 'card' }, el('h3', { text: 'Sistem bilgisi' }), dl));

    pane.appendChild(
      el(
        'div',
        { class: 'card' },
        el('h3', { text: 'Bağlantılar' }),
        el(
          'div',
          { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          el('button', { class: 'btn sm', html: Icons.external + '<span>Modrinth</span>', onClick: () => api.app.openExternal('https://modrinth.com') }),
          el('button', { class: 'btn sm', html: Icons.external + '<span>CurseForge</span>', onClick: () => api.app.openExternal('https://www.curseforge.com/minecraft') }),
          el('button', { class: 'btn sm', html: Icons.folder + '<span>Günlük klasörü</span>', onClick: () => api.app.openPath(i.dataDir + '\\logs') })
        )
      )
    );
  }

  window.Views.settings = { render };
})();
