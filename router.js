/* =====================================================================
   ROUTER SPA — La Ciudadela de ALZ
   - Una sola página. "Inicio", "Comunidad", "Rangos", "Donar" y "Apoyo"
     son secciones .ax-view que se muestran/ocultan sin recargar.
   - El encabezado (perfil, campana, música, botones) NUNCA se destruye
     y la música jamás se corta al cambiar de sección.
   - La sección activa se guarda en la URL como ?v=<vista> para que al
     recargar o compartir el enlace se abra en el mismo sitio.
   - Avisa a los demás scripts con el evento window 'alz:vista'.
===================================================================== */
(function () {
  const VISTAS = ['inicio', 'comunidad', 'rangos', 'donaciones', 'apoyo'];

  const TITULOS = {
    inicio: 'La Ciudadela de ALZ',
    comunidad: 'Comunidad — La Ciudadela de ALZ',
    rangos: 'Rangos y beneficios — La Ciudadela de ALZ',
    donaciones: 'Donar — La Ciudadela de ALZ',
    apoyo: 'Apoyo — La Ciudadela de ALZ'
  };

  const views = {};
  VISTAS.forEach((v) => { views[v] = document.querySelector('.ax-view[data-view="' + v + '"]'); });

  function vistaDeHref(href) {
    if (!href) return null;
    // un ?v=<vista> explícito manda (p. ej. index.html?v=comunidad)
    const q = (href.split('#')[0].split('?')[1] || '');
    const mv = q.match(/(?:^|&)v=([^&]+)/);
    if (mv && VISTAS.indexOf(mv[1]) !== -1) return mv[1];
    const f = href.split('#')[0].split('?')[0].split('/').pop().toLowerCase();
    if (f === '' || f === 'index.html') return 'inicio';
    if (f === 'comunidad.html') return 'comunidad';
    if (f === 'rangos.html') return 'rangos';
    if (f === 'donaciones.html') return 'donaciones';
    if (f === 'apoyo.html') return 'apoyo';
    return null;
  }

  function vistaActual() {
    let v = null;
    try { v = new URLSearchParams(location.search).get('v'); } catch (_) {}
    return VISTAS.indexOf(v) !== -1 ? v : 'inicio';
  }

  function marcarLinks(v) {
    document.querySelectorAll('.ax-nav-links a').forEach((a) => {
      const dv = vistaDeHref(a.getAttribute('href'));
      a.classList.toggle('active', !!dv && dv === v);
    });
  }

  function aplicar(v, push) {
    if (VISTAS.indexOf(v) === -1) v = 'inicio';
    VISTAS.forEach((k) => { if (views[k]) views[k].hidden = (k !== v); });
    document.body.setAttribute('data-vista', v);
    document.body.setAttribute('data-page', v);
    document.title = TITULOS[v] || TITULOS.inicio;
    marcarLinks(v);
    if (push) {
      const url = (v === 'inicio' ? 'index.html' : 'index.html?v=' + v) + (location.hash || '');
      try { history.pushState({ v: v }, '', url); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('alz:vista', { detail: v }));
  }

  function go(v, opts) {
    opts = opts || {};
    if (VISTAS.indexOf(v) === -1) v = 'inicio';
    const cambia = v !== document.body.getAttribute('data-vista');
    aplicar(v, true);
    if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: cambia ? 'auto' : 'smooth' });
  }

  // Intercepta los clics de navegación ANTES que nav.js (fase de captura).
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a) return;
    if (a.target === '_blank' || a.hasAttribute('data-social') || a.hasAttribute('data-pay') || a.hasAttribute('data-nav')) return;
    const href = a.getAttribute('href') || '';
    if (href.charAt(0) === '#' || /^(https?:|mailto:|tel:)/i.test(href)) return;
    const v = vistaDeHref(href);
    if (!v) return;
    e.preventDefault();
    const box = document.getElementById('ax-nav-links');
    if (box) box.classList.remove('open');
    if (v === document.body.getAttribute('data-vista')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    go(v);
  }, true);

  window.addEventListener('popstate', () => {
    aplicar(vistaActual(), false);
    window.scrollTo({ top: 0 });
  });

  window.ALZ_ROUTER = { go: go, get vista() { return document.body.getAttribute('data-vista') || 'inicio'; } };

  // Vista inicial (respeta ?v= y los enlaces viejos que redirigen aquí).
  aplicar(vistaActual(), false);
})();
