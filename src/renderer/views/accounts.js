/* Hesap ekleme / değiştirme akışı */
(function () {
  const { el, toast, modal, go, esc } = window.UI;
  const api = window.api;
  const State = window.State;

  function open() {
    const list = el('div', { style: { display: 'grid', gap: '7px' } });
    const m = modal({
      title: 'Hesaplar',
      subtitle: 'Oynamak için bir hesap seç ya da yeni ekle',
      body: el(
        'div',
        { style: { display: 'grid', gap: '16px' } },
        list,
        el(
          'div',
          { style: { display: 'grid', gap: '8px' } },
          bigOption(Icons.user, 'Microsoft ile giriş yap', 'Satın alınmış hesabın, skinlerin ve pelerinlerin için', () => {
            m.close();
            microsoftFlow();
          }),
          bigOption(Icons.power, 'Çevrimdışı hesap', 'Sadece bir isim yaz, hemen oyna (çok oyunculu sunucularda çalışmaz)', () => {
            m.close();
            offlineFlow();
          })
        )
      ),
    });

    refreshList(list, m);
    return m;
  }

  async function refreshList(list, m) {
    const accounts = await api.accounts.list();
    list.innerHTML = '';
    if (!accounts.length) {
      list.appendChild(
        el('div', {
          style: { fontSize: '12.5px', color: 'var(--text-3)', textAlign: 'center', padding: '6px' },
          text: 'Henüz hesap yok.',
        })
      );
      return;
    }
    for (const a of accounts) {
      list.appendChild(
        el(
          'div',
          { class: 'mod-row' },
          a.avatar ? el('img', { src: a.avatar }) : el('div', { class: 'ph' }),
          el(
            'div',
            { class: 'info' },
            el('div', { class: 'nm', text: a.name }),
            el('div', { class: 'sub', text: a.type === 'microsoft' ? 'Microsoft' : 'Çevrimdışı' })
          ),
          a.active
            ? el('span', { class: 'chip green', text: 'Aktif' })
            : el('button', {
                class: 'btn sm',
                text: 'Seç',
                onClick: async () => {
                  await api.accounts.setActive(a.id);
                  await window.UI.loadAccounts();
                  refreshList(list, m);
                },
              }),
          el('button', {
            class: 'btn icon sm ghost',
            html: Icons.trash,
            title: 'Kaldır',
            onClick: async () => {
              await api.accounts.remove(a.id);
              await window.UI.loadAccounts();
              refreshList(list, m);
            },
          })
        )
      );
    }
  }

  function bigOption(icon, title, desc, onClick) {
    return el(
      'button',
      {
        class: 'card',
        style: { display: 'flex', gap: '13px', alignItems: 'center', textAlign: 'left', cursor: 'pointer', width: '100%' },
        onClick,
        onMouseenter: (e) => (e.currentTarget.style.borderColor = 'var(--accent)'),
        onMouseleave: (e) => (e.currentTarget.style.borderColor = 'var(--border)'),
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
      )
    );
  }

  // ---------------------------------------------------------------- offline
  function offlineFlow() {
    const input = el('input', { class: 'input', placeholder: 'Steve', maxlength: 16 });
    const err = el('div', { style: { color: 'var(--red)', fontSize: '12.5px', display: 'none' } });

    const submit = async () => {
      const name = input.value.trim();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
        err.style.display = 'block';
        err.textContent = '3-16 karakter; sadece harf, rakam ve alt çizgi.';
        return;
      }
      try {
        await api.accounts.addOffline(name);
        await window.UI.loadAccounts();
        m.close();
        toast(`"${name}" olarak giriş yapıldı.`, 'ok');
      } catch (e) {
        err.style.display = 'block';
        err.textContent = e.message;
      }
    };

    const m = modal({
      title: 'Çevrimdışı hesap',
      subtitle: 'Tek oyunculu ve cracked sunucular için',
      body: el(
        'div',
        { style: { display: 'grid', gap: '12px' } },
        el('div', { class: 'field' }, el('label', { text: 'Oyuncu adı' }), input, el('div', { class: 'hint', text: 'Oyunda görünecek isim.' })),
        err,
        el('div', {
          style: { fontSize: '12px', color: 'var(--text-3)', lineHeight: 1.6 },
          text: 'Çevrimdışı hesapla resmi sunuculara (Hypixel gibi) giremezsin ve skin/pelerin değiştiremezsin. Modlar ve tek oyunculu dünyalar sorunsuz çalışır.',
        })
      ),
      footer: [
        el('button', { class: 'btn', text: 'Vazgeç', onClick: () => m.close() }),
        el('button', { class: 'btn primary', text: 'Ekle', onClick: submit }),
      ],
    });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    setTimeout(() => input.focus(), 50);
  }

  // ---------------------------------------------------------------- microsoft
  async function microsoftFlow() {
    if (!State.settings.msClientId) {
      const m0 = modal({
        title: 'Microsoft girişi için tek seferlik kurulum',
        subtitle: 'Azure uygulama kimliği gerekiyor',
        body: el(
          'div',
          { style: { display: 'grid', gap: '12px' } },
          el('p', {
            style: { color: 'var(--text-2)', fontSize: '13px' },
            text: 'Microsoft, üçüncü taraf launcher’ların giriş yapabilmesi için ücretsiz bir "uygulama kimliği" ister. Bir kere oluşturulur, sonra hep çalışır. Ayarlar > Hesap bölümünde adım adım anlatılıyor.',
          }),
          el('p', {
            style: { color: 'var(--text-3)', fontSize: '12.5px' },
            text: 'Hemen oynamak istersen çevrimdışı hesap kullanabilirsin.',
          })
        ),
        footer: [
          el('button', {
            class: 'btn',
            text: 'Çevrimdışı hesap',
            onClick: () => {
              m0.close();
              offlineFlow();
            },
          }),
          el('button', {
            class: 'btn primary',
            text: 'Kurulumu aç',
            onClick: () => {
              m0.close();
              go('settings');
              setTimeout(() => {
                const btn = [...document.querySelectorAll('.settings-nav button')].find((b) => b.dataset.s === 'account');
                if (btn) btn.click();
              }, 220);
            },
          }),
        ],
      });
      return;
    }

    const codeBox = el('div', {
      style: {
        fontSize: '30px',
        fontWeight: 800,
        letterSpacing: '5px',
        textAlign: 'center',
        padding: '14px',
        borderRadius: '12px',
        background: 'var(--bg)',
        border: '1px solid var(--border-strong)',
        userSelect: 'text',
        fontFamily: 'Consolas, monospace',
      },
      text: '...',
    });
    const status = el('div', { style: { fontSize: '12.5px', color: 'var(--text-3)', textAlign: 'center' } }, 'Kod alınıyor...');

    let sessionId = null;
    const m = modal({
      title: 'Microsoft ile giriş',
      body: el(
        'div',
        { style: { display: 'grid', gap: '14px' } },
        el('p', {
          style: { color: 'var(--text-2)', fontSize: '13px', textAlign: 'center' },
          text: 'Aşağıdaki kodu microsoft.com/link adresine gir. Tarayıcıda girişi tamamlayınca burası otomatik ilerler.',
        }),
        codeBox,
        el(
          'div',
          { style: { display: 'flex', gap: '8px', justifyContent: 'center' } },
          el('button', {
            class: 'btn sm',
            html: Icons.copy + '<span>Kodu kopyala</span>',
            onClick: () => {
              api.app.copy(codeBox.textContent);
              toast('Kopyalandı.', 'ok', null, 1500);
            },
          }),
          el('button', {
            class: 'btn sm primary',
            html: Icons.external + '<span>Sayfayı aç</span>',
            id: 'ms-open',
            onClick: () => api.app.openExternal('https://www.microsoft.com/link'),
          })
        ),
        status
      ),
      onClose: () => {
        if (sessionId) api.accounts.msCancel(sessionId);
        offDone();
        offErr();
        offProg();
      },
    });

    const offDone = api.on('accounts:msDone', async (p) => {
      if (p.sessionId !== sessionId) return;
      sessionId = null;
      await window.UI.loadAccounts();
      m.close();
      toast(`Hoş geldin, ${p.account.name}!`, 'ok', 'Giriş başarılı');
      window.UI.refreshRoute();
    });
    const offErr = api.on('accounts:msError', (p) => {
      if (p.sessionId !== sessionId) return;
      sessionId = null;
      status.textContent = p.error;
      status.style.color = 'var(--red)';
      status.style.textAlign = 'left';
      status.style.whiteSpace = 'pre-wrap';
      if (p.code === 'APP_NOT_APPROVED') {
        status.parentElement.appendChild(
          el(
            'div',
            { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
            el('button', {
              class: 'btn sm primary',
              html: Icons.external + '<span>Onay başvurusu yap</span>',
              onClick: () => api.app.openExternal('https://aka.ms/mce-reviewappid'),
            }),
            el('button', {
              class: 'btn sm',
              html: Icons.power + '<span>Çevrimdışı hesap kullan</span>',
              onClick: () => {
                m.close();
                offlineFlow();
              },
            })
          )
        );
      }
    });
    const offProg = api.on('accounts:msProgress', (p) => {
      if (p.sessionId !== sessionId) return;
      status.textContent = p.stage + '...';
    });

    try {
      const dc = await api.accounts.msStart();
      sessionId = dc.sessionId;
      codeBox.textContent = dc.userCode;
      status.textContent = 'Giriş bekleniyor...';
      const openBtn = document.getElementById('ms-open');
      if (openBtn && dc.verificationUri) {
        openBtn.onclick = () => api.app.openExternal(dc.verificationUri);
      }
    } catch (e) {
      codeBox.textContent = '—';
      status.textContent = e.message;
      status.style.color = 'var(--red)';
    }
  }

  window.Views.accounts = { open, offlineFlow, microsoftFlow };
})();
