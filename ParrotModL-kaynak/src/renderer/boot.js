/* Uygulama açılışı */
(function () {
  const api = window.api;
  const { applyTheme, go, toast, $ } = window.UI;
  const State = window.State;

  let booted = false;
  async function boot() {
    if (booted) return;
    booted = true;
    // pencere kontrolleri
    $('#tb-min').addEventListener('click', () => api.window.minimize());
    $('#tb-max').addEventListener('click', () => api.window.maximize());
    $('#tb-close').addEventListener('click', () => api.window.close());
    $('#account-btn').addEventListener('click', () => window.Views.accounts.open());

    try {
      State.settings = await api.settings.get();
      applyTheme(State.settings);
    } catch (e) {
      console.error('ayarlar yüklenemedi', e);
    }

    try {
      State.appInfo = await api.app.info();
      $('#app-version').textContent = 'v' + State.appInfo.version;
    } catch {}

    try {
      await window.UI.loadAccounts();
    } catch (e) {
      console.error(e);
    }

    try {
      const running = await api.game.running();
      running.forEach((id) => State.running.add(id));
    } catch {}

    // global oyun olayları (hangi sayfada olursak olalım çalışsın)
    api.on('game:event', (evt) => {
      if (evt.type === 'exit') {
        State.running.delete(evt.profileId);
        State.progress.delete(evt.profileId);
      } else if (evt.type === 'status' && evt.state === 'running') {
        State.running.add(evt.profileId);
      } else if (evt.type === 'status' && evt.state === 'error') {
        State.running.delete(evt.profileId);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key >= '1' && e.key <= '5') {
        const item = window.UI.NAV[Number(e.key) - 1];
        if (item) go(item.id);
      }
      if (e.key === 'F5') {
        e.preventDefault();
        window.UI.refreshRoute();
      }
    });

    // dışarıya link açma
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="http"]');
      if (a) {
        e.preventDefault();
        api.app.openExternal(a.href);
      }
    });

    await go('home');

    if (!State.accounts.length) {
      setTimeout(() => {
        toast('Başlamak için bir hesap ekle.', 'info', 'Hoş geldin!', 7000);
      }, 900);
    }
  }

  window.addEventListener('error', (e) => {
    console.error(e.error || e.message);
  });

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
