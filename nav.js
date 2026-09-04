/* =========================================
   NAV PRINCIPAL — menú móvil, link activo
   y enlaces de salida (redes / Discord)
   tomados desde config.js
========================================= */
(function () {
  const cfg = window.AX_CONFIG || {};

  const burger = document.getElementById('ax-nav-burger');
  const links = document.getElementById('ax-nav-links');
  const socialToggle = document.getElementById('ax-social-toggle');
  const social = document.getElementById('ax-nav-social');

  function cerrarMenus(excepto) {
    if (links && excepto !== 'links') { links.classList.remove('open'); if (burger) { burger.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); } }
    if (social && excepto !== 'social') { social.classList.remove('open'); if (socialToggle) { socialToggle.classList.remove('is-open'); socialToggle.setAttribute('aria-expanded', 'false'); } }
  }

  if (burger && links) {
    burger.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) cerrarMenus('links');
    });
    links.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => cerrarMenus());
    });
  }

  if (socialToggle && social) {
    socialToggle.addEventListener('click', () => {
      const open = social.classList.toggle('open');
      socialToggle.classList.toggle('is-open', open);
      socialToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) cerrarMenus('social');
    });
    social.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => cerrarMenus());
    });
  }

  // cerrar ambos menús al tocar fuera del encabezado
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.ax-nav-inner')) cerrarMenus();
  });

  // marca como activo el link que corresponde a la página actual
  const current = document.body.getAttribute('data-page');
  if (current && links) {
    const match = links.querySelector('a[data-page="' + current + '"]');
    if (match) match.classList.add('active');
  }

  // NO recargar la página si ya estás en ella (el encabezado no debe "parpadear")
  const aquiPath = location.pathname.replace(/\/index\.html$/, '/');
  document.querySelectorAll('.ax-nav a[href]').forEach((a) => {
    const dest = a.getAttribute('href') || '';
    if (/^#|^https?:|^mailto:/.test(dest)) return;
    let destPath;
    try { destPath = new URL(a.href).pathname.replace(/\/index\.html$/, '/'); } catch (_) { return; }
    if (destPath === aquiPath) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (links) links.classList.remove('open');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  });

  // conecta cualquier enlace [data-social="youtube|tiktok|discord"]
  // o [data-social="discord-invite"] / [data-social="server-ip"]
  // con los valores reales de config.js. Si no existe, lo deja inerte.
  function wire(el, url, isText) {
    if (!url) {
      el.classList.add('is-pending');
      el.setAttribute('aria-disabled', 'true');
      el.title = 'Próximamente';
      if (isText) el.textContent = 'Próximamente';
      el.addEventListener('click', (e) => e.preventDefault());
      return;
    }
    if (isText) {
      el.textContent = url;
    } else {
      el.href = url;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    }
  }

  document.querySelectorAll('[data-social="youtube"]').forEach((el) => wire(el, cfg.SOCIAL && cfg.SOCIAL.youtube));
  document.querySelectorAll('[data-social="tiktok"]').forEach((el) => wire(el, cfg.SOCIAL && cfg.SOCIAL.tiktok));
  document.querySelectorAll('[data-social="discord"]').forEach((el) => wire(el, cfg.SOCIAL && cfg.SOCIAL.discord));
  document.querySelectorAll('[data-social="instagram"]').forEach((el) => wire(el, cfg.SOCIAL && cfg.SOCIAL.instagram));
  document.querySelectorAll('[data-social="kick"]').forEach((el) => wire(el, cfg.SOCIAL && cfg.SOCIAL.kick));
  document.querySelectorAll('[data-social="discord-invite"]').forEach((el) => wire(el, cfg.DISCORD_INVITE));
  document.querySelectorAll('[data-social="server-ip"]').forEach((el) => wire(el, cfg.SERVER_IP, true));

  // conecta las tarjetas de pago de Donaciones [data-pay="yape|bcp|airtm|paypal|lemon"]
  // con config.js -> PAGOS. Mientras el dato sea null, se queda el texto de
  // ejemplo y la etiqueta "PENDIENTE" tal como están en el HTML.
  const pagos = cfg.PAGOS || {};
  document.querySelectorAll('[data-pay]').forEach((el) => {
    const key = el.getAttribute('data-pay');
    const valor = pagos[key];
    if (!valor) return;

    const card = el.closest('.pay-card');
    el.textContent = valor;
    if (card) {
      const pending = card.querySelector('.pay-pending');
      if (pending) pending.hidden = true;
    }
  });
})();
