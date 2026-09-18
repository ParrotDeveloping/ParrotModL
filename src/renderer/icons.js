/* Inline SVG icon set (feather-ish, 24x24 stroke) */
(function () {
  const p = (d, extra = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

  window.Icons = {
    home: p('<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>'),
    skin: p('<path d="M8 3h8l4 3-2.5 3.5L16 8v13H8V8l-1.5 1.5L4 6z"/>'),
    compass: p('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
    image: p('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-4-6 6"/>'),
    settings: p(
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.7 1.7 0 008.9 19a1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 8.9a1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'
    ),
    play: p('<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="none"/>'),
    stop: p('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>'),
    plus: p('<path d="M12 5v14M5 12h14"/>'),
    search: p('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    download: p('<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 21h16"/>'),
    upload: p('<path d="M12 21V9"/><path d="M7 13l5-5 5 5"/><path d="M4 3h16"/>'),
    dots: p('<circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>'),
    trash: p('<path d="M4 7h16"/><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"/><path d="M6 7l1 13h10l1-13"/>'),
    folder: p('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
    edit: p('<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/>'),
    copy: p('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/>'),
    check: p('<path d="M4 12.5l5.5 5.5L20 7"/>'),
    x: p('<path d="M6 6l12 12M18 6L6 18"/>'),
    info: p('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="1" fill="currentColor"/>'),
    alert: p('<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="1" fill="currentColor"/>'),
    refresh: p('<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 5v6h-6"/>'),
    package: p('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5"/><path d="M12 12v9"/>'),
    grid: p('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    user: p('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>'),
    logout: p('<path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4"/><path d="M15 16l4-4-4-4"/><path d="M19 12H10"/>'),
    external: p('<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 01-1 1H6a1 1 0 01-1-1V7a1 1 0 011-1h5"/>'),
    star: p('<path d="M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9z"/>'),
    clock: p('<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>'),
    cube: p('<path d="M12 2.5l8.5 4.8v9.4L12 21.5 3.5 16.7V7.3z"/><path d="M3.5 7.3L12 12l8.5-4.7"/><path d="M12 12v9.5"/>'),
    filter: p('<path d="M3 5h18"/><path d="M6 12h12"/><path d="M10 19h4"/>'),
    palette: p('<path d="M12 3a9 9 0 100 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 005-5c0-3.9-4-7-9-7z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor"/><circle cx="15" cy="8.5" r="1.1" fill="currentColor"/>'),
    cpu: p('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'),
    shield: p('<path d="M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6z"/>'),
    box: p('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18"/>'),
    sliders: p('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
    link: p('<path d="M10 13a5 5 0 007.5.5l2-2A5 5 0 0012.5 4.5l-1 1"/><path d="M14 11a5 5 0 00-7.5-.5l-2 2A5 5 0 0011.5 19.5l1-1"/>'),
    save: p('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7V3"/><rect x="8" y="13" width="8" height="8"/>'),
    key: p('<circle cx="8" cy="12" r="4"/><path d="M12 12h9l-2 2 2 2"/>'),
    globe: p('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 010 18 15 15 0 010-18z"/>'),
    zap: p('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
    list: p('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="12" r="1.2" fill="currentColor"/><circle cx="4" cy="18" r="1.2" fill="currentColor"/>'),
    power: p('<path d="M12 3v9"/><path d="M6.5 6.5a8 8 0 1011 0"/>'),
    eye: p('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: p('<path d="M3 3l18 18"/><path d="M10.6 5.2A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.3 4.1M6.3 6.4A17 17 0 002 12s3.6 7 10 7a10 10 0 004.2-.9"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/>'),
  };
})();
