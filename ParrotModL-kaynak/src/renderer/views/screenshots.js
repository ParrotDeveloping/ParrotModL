/* Ekran Görüntüleri - tüm profillerden */
(function () {
  const { el, toast, confirmDialog, emptyState, fmtAgo, fmtBytes, debounce, contextMenu, go } = window.UI;
  const api = window.api;

  let all = [];
  let filterProfile = '';
  let grid = null;

  async function render(host) {
    all = await api.shots.list();

    const profiles = [...new Set(all.map((s) => s.profileId))];
    const nameOf = {};
    for (const s of all) nameOf[s.profileId] = s.profileName;

    host.appendChild(
      el(
        'div',
        { class: 'page-head' },
        el(
          'div',
          {},
          el('h1', { text: 'Ekran Görüntüleri' }),
          el('p', { text: `Tüm profillerinden ${all.length} görüntü.` })
        ),
        el(
          'div',
          { class: 'head-actions' },
          el('button', {
            class: 'btn',
            html: Icons.refresh + '<span>Yenile</span>',
            onClick: () => window.UI.refreshRoute(),
          })
        )
      )
    );

    if (!all.length) {
      host.appendChild(
        emptyState(
          Icons.image,
          'Henüz ekran görüntüsü yok',
          'Oyunda F2 tuşuna bastığında alınan görüntüler burada toplanır.'
        )
      );
      return;
    }

    const select = el(
      'select',
      {
        class: 'select',
        style: { width: 'auto', minWidth: '200px' },
        onChange: (e) => {
          filterProfile = e.target.value;
          paint();
        },
      },
      el('option', { value: '', text: `Tüm profiller (${all.length})` }),
      ...profiles.map((id) =>
        el('option', { value: id, text: `${nameOf[id]} (${all.filter((s) => s.profileId === id).length})` })
      )
    );

    host.appendChild(el('div', { class: 'toolbar' }, select));
    grid = el('div', { class: 'shot-grid' });
    host.appendChild(grid);
    paint();
  }

  function paint() {
    grid.innerHTML = '';
    const list = filterProfile ? all.filter((s) => s.profileId === filterProfile) : all;
    for (const s of list) grid.appendChild(tile(s, list));
  }

  function tile(s, list) {
    const img = el('img', { loading: 'lazy', alt: s.file });
    api.shots
      .read(s.path)
      .then((d) => (img.src = d))
      .catch(() => {});

    return el(
      'div',
      {
        class: 'shot',
        onClick: () => lightbox(s, list),
        onContextmenu: (e) => {
          e.preventDefault();
          contextMenu(e.clientX, e.clientY, [
            { label: 'Büyük göster', icon: Icons.eye, onClick: () => lightbox(s, list) },
            { label: 'Panoya kopyala', icon: Icons.copy, onClick: () => copy(s) },
            { label: 'Farklı kaydet', icon: Icons.download, onClick: () => saveAs(s) },
            { label: 'Klasörde göster', icon: Icons.folder, onClick: () => api.app.showItem(s.path) },
            { label: 'Profili aç', icon: Icons.cube, onClick: () => go('profile', s.profileId) },
            '-',
            { label: 'Sil', icon: Icons.trash, danger: true, onClick: () => remove(s) },
          ]);
        },
      },
      img,
      el(
        'div',
        { class: 'meta' },
        el('b', { text: s.profileName, title: s.file }),
        el('span', { text: fmtAgo(s.time) })
      )
    );
  }

  function lightbox(s, list) {
    let index = list.indexOf(s);
    const img = el('img', { alt: '' });
    const caption = el('div', {
      style: { position: 'absolute', top: '20px', left: '24px', fontSize: '13px', color: 'var(--text-2)' },
    });

    const box = el(
      'div',
      { class: 'lightbox' },
      img,
      caption,
      el('button', { class: 'btn icon lb-close', html: Icons.x, onClick: () => close() }),
      el(
        'div',
        { class: 'lb-bar' },
        el('button', { class: 'btn sm', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>', onClick: (e) => { e.stopPropagation(); step(-1); } }),
        el('button', { class: 'btn sm', html: Icons.copy + '<span>Kopyala</span>', onClick: (e) => { e.stopPropagation(); copy(list[index]); } }),
        el('button', { class: 'btn sm', html: Icons.download + '<span>Kaydet</span>', onClick: (e) => { e.stopPropagation(); saveAs(list[index]); } }),
        el('button', { class: 'btn sm', html: Icons.folder, title: 'Klasörde göster', onClick: (e) => { e.stopPropagation(); api.app.showItem(list[index].path); } }),
        el('button', {
          class: 'btn sm danger',
          html: Icons.trash,
          onClick: async (e) => {
            e.stopPropagation();
            const removed = list[index];
            if (await remove(removed)) {
              list.splice(index, 1);
              if (!list.length) return close();
              index = Math.min(index, list.length - 1);
              show();
            }
          },
        }),
        el('button', { class: 'btn sm', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>', onClick: (e) => { e.stopPropagation(); step(1); } })
      )
    );

    function show() {
      const cur = list[index];
      caption.textContent = `${cur.profileName} · ${cur.file} · ${fmtBytes(cur.size)}`;
      api.shots.read(cur.path).then((d) => (img.src = d));
    }
    function step(d) {
      index = (index + d + list.length) % list.length;
      show();
    }
    function close() {
      box.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    }
    box.addEventListener('click', (e) => {
      if (e.target === box || e.target === img) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
    show();
  }

  async function copy(s) {
    await api.shots.copy(s.path);
    toast('Panoya kopyalandı.', 'ok');
  }

  async function saveAs(s) {
    const p = await api.shots.saveAs(s.path);
    if (p) toast('Kaydedildi.', 'ok');
  }

  async function remove(s) {
    const ok = await confirmDialog({
      title: 'Ekran görüntüsünü sil',
      message: s.file + ' kalıcı olarak silinecek.',
      confirmText: 'Sil',
      danger: true,
    });
    if (!ok) return false;
    try {
      await api.shots.remove(s.id);
      all = all.filter((x) => x.id !== s.id);
      if (grid) paint();
      toast('Silindi.', 'ok');
      return true;
    } catch (e) {
      toast(e.message, 'err');
      return false;
    }
  }

  window.Views.screenshots = { render };
})();
