/* =====================================================================
   PERFIL EN EL ENCABEZADO — persistente y ESTABLE en todas las páginas.
   - El chip vive siempre en el DOM (no se quita), solo cambia su contenido,
     y solo si algo cambió de verdad (sin parpadeos al navegar).
   - Se pinta al instante desde caché (localStorage).
   - Menú: cambiar foto (con recorte circular), cambiar alias, "me gustan",
     cerrar sesión.
   - Coordina con comunidad.js por eventos window:
       alz:cambiar-alias · alz:me-gustan · alz:avatar · alz:logout
===================================================================== */
(function () {
  const cfg = window.AX_CONFIG || {};
  const navInner = document.querySelector('.ax-nav-inner');
  if (!navInner) return;

  const configOk =
    window.supabase &&
    cfg.SUPABASE_URL && cfg.SUPABASE_URL.indexOf('TU-PROYECTO') === -1 &&
    cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_ANON_KEY.indexOf('PON_AQUI') === -1;
  if (!configOk) return;

  const sb = window.ALZ_SB || window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  window.ALZ_SB = sb;

  const BUCKET = cfg.BUCKET || 'evidencia';
  const CACHE = 'alz_perfil_v1';

  // SPA: comunidad.js siempre está cargado. Estos atajos cambian a la
  // sección "Comunidad" (sin recargar) y luego disparan el evento.
  function irAComunidad() {
    if (window.ALZ_ROUTER && window.ALZ_ROUTER.go) window.ALZ_ROUTER.go('comunidad');
  }

  let user = null;
  let perfil = null;
  let chip = null;
  let lastSig = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initial = (a) => String(a || '?').trim().charAt(0).toUpperCase();

  const ANON_SVG = '<svg class="cmn-av-anon-svg" viewBox="0 0 40 40" aria-hidden="true">' +
    '<circle cx="20" cy="15" r="7"></circle>' +
    '<path d="M7 35c1-8 6.5-12 13-12s12 4 13 12z"></path></svg>';

  function leerCache() { try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch (_) { return null; } }
  function guardarCache(p) { try { p ? localStorage.setItem(CACHE, JSON.stringify(p)) : localStorage.removeItem(CACHE); } catch (_) {} }

  function avInner(p) {
    const u = p && p.avatar_url;
    if (u && /^https?:\/\//.test(u)) return '<img src="' + esc(u) + '" alt="" class="cmn-av-img">';
    if (u === 'anon') return ANON_SVG;
    return esc(initial(p && p.alias));
  }

  function ensureChip() {
    if (chip && chip.isConnected) return chip;
    chip = navInner.querySelector('.cmn-profile');
    if (!chip) {
      chip = document.createElement('div');
      chip.className = 'cmn-profile';
      chip.hidden = true;
      navInner.appendChild(chip);
    }
    return chip;
  }

  /* ---------------- CAMPANA DE NOTIFICACIONES ---------------- */
  let bell = null, notifChan = null, notifs = [];

  function ago(iso) {
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'ahora';
    if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
    if (s < 604800) return 'hace ' + Math.floor(s / 86400) + ' d';
    return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  }

  function ensureBell() {
    if (bell && bell.isConnected) return bell;
    bell = navInner.querySelector('.alz-bell');
    if (!bell) {
      bell = document.createElement('div');
      bell.className = 'alz-bell';
      bell.hidden = true;
      const brand = navInner.querySelector('.ax-nav-brand');
      if (brand) brand.insertAdjacentElement('afterend', bell);
      else navInner.appendChild(bell);
    }
    return bell;
  }

  function pintarBell() {
    if (!bell || !perfil) return;
    const abierto = !!(bell.querySelector('.alz-bell-menu') && !bell.querySelector('.alz-bell-menu').hidden);
    const sinLeer = notifs.filter((n) => !n.leida).length;
    const filas = notifs.length
      ? notifs.map((n) => {
          const a = n.actor || {};
          const av = a.avatar_url && /^https?:/.test(a.avatar_url)
            ? '<img src="' + esc(a.avatar_url) + '" alt="">'
            : esc((a.alias || '?').charAt(0).toUpperCase());
          const dnd = n.comentario ? 'n=' + n.publicacion + '.' + n.comentario : 'n=' + (n.publicacion || '');
          const donde = n.comentario ? 'te mencionó en un comentario' : 'te mencionó en una publicación';
          return '<button type="button" class="alz-bell-row' + (n.leida ? '' : ' is-unread') + '" data-goto="' + esc(dnd) + '">' +
            '<span class="alz-bell-av">' + av + '</span>' +
            '<span class="alz-bell-tx"><b>' + esc(a.alias || 'alguien') + '</b> ' + donde +
            '<span class="alz-bell-t">' + ago(n.creado) + '</span></span></button>';
        }).join('')
      : '<div class="alz-bell-empty">No tienes notificaciones.</div>';
    bell.innerHTML =
      '<button type="button" class="alz-bell-btn" data-bell="toggle" aria-label="Notificaciones">' +
        '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-5-1.6-1.6V10a5.4 5.4 0 0 0-4-5.2V4a1.4 1.4 0 1 0-2.8 0v.8A5.4 5.4 0 0 0 6.6 10v5.4L5 17a1 1 0 0 0 .7 1.7h12.6A1 1 0 0 0 19 17z"/></svg>' +
        '<b class="alz-bell-badge"' + (sinLeer ? '' : ' hidden') + '>' + (sinLeer > 9 ? '9+' : sinLeer) + '</b>' +
      '</button>' +
      '<div class="alz-bell-menu"' + (abierto ? '' : ' hidden') + '>' +
        '<div class="alz-bell-head">Notificaciones</div>' +
        '<div class="alz-bell-list">' + filas + '</div>' +
      '</div>';
  }

  async function cargarNotifs() {
    if (!perfil) return;
    const r = await sb.from('notificaciones')
      .select('id,leida,creado,publicacion,comentario,actor:perfiles!actor(id,alias,avatar_url)')
      .eq('destino', perfil.id).order('creado', { ascending: false }).limit(30);
    if (r.error) { return; }
    notifs = r.data || [];
    pintarBell();
  }

  async function marcarLeidas() {
    if (!notifs.some((n) => !n.leida)) return;
    notifs.forEach((n) => { n.leida = true; });
    pintarBell();
    await sb.from('notificaciones').update({ leida: true }).eq('destino', perfil.id).eq('leida', false);
  }

  function suscribirNotifs() {
    if (notifChan || !perfil) return;
    notifChan = sb.channel('alz-notif')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: 'destino=eq.' + perfil.id }, () => cargarNotifs())
      .subscribe();
  }

  function sigDe(p) {
    return p ? [p.id, p.alias, p.avatar_url || '', (p.alias_historial || []).join('~')].join('|') : 'out';
  }

  function render() {
    ensureChip();
    ensureBell();
    // marca el <body> según haya sesión (el CTA "Únete" del encabezado se oculta)
    document.body.classList.toggle('alz-auth', !!perfil);
    // la visibilidad SIEMPRE se sincroniza (es un no-op si ya estaba bien)
    bell.hidden = !perfil;
    if (!perfil && notifChan) { try { sb.removeChannel(notifChan); } catch (_) {} notifChan = null; }
    if (!perfil) notifs = [];

    const sig = sigDe(perfil);
    if (sig === lastSig) return;      // nada cambió → NO tocar más el DOM (header fijo)
    lastSig = sig;

    if (!perfil) {
      bell.innerHTML = '';
      chip.hidden = true; chip.setAttribute('aria-hidden', 'true'); chip.innerHTML = ''; return;
    }
    chip.hidden = false;
    chip.removeAttribute('aria-hidden');
    const hist = (perfil.alias_historial && perfil.alias_historial.length)
      ? '<div class="cmn-pf-old">Antes: ' + perfil.alias_historial.map(esc).join(', ') + '</div>' : '';
    chip.innerHTML =
      '<button type="button" class="cmn-pf-btn" data-act="toggle">' +
        '<span class="cmn-pf-av">' + avInner(perfil) + '</span>' +
        '<span class="cmn-pf-alias">' + esc(perfil.alias) + '</span>' +
        '<span class="cmn-pf-caret" aria-hidden="true">&#9662;</span>' +
      '</button>' +
      '<div class="cmn-pf-menu" hidden>' +
        '<div class="cmn-pf-head"><span class="cmn-pf-av lg">' + avInner(perfil) + '</span>' +
          '<div><strong>' + esc(perfil.alias) + '</strong>' + hist + '</div>' +
        '</div>' +
        '<div class="cmn-pf-handle">' + esc(perfil.handle || '') +
          '<button type="button" class="cmn-pf-copy" data-act="copiar">copiar</button></div>' +
        '<button type="button" data-act="foto">Cambiar foto de perfil</button>' +
        '<button type="button" data-act="alias">Cambiar alias</button>' +
        '<button type="button" data-act="megusta" class="cmn-pf-fav">&#9829; Me gustan</button>' +
        '<button type="button" data-act="salir" class="danger">Cerrar sesión</button>' +
      '</div>';
    pintarBell();   // muestra la campana enseguida (sin badge); cargarNotifs la refresca
  }

  function menuEl() { return chip && chip.querySelector('.cmn-pf-menu'); }
  function closeMenu() { const m = menuEl(); if (m) m.hidden = true; }

  function bellMenu() { return bell && bell.querySelector('.alz-bell-menu'); }
  function closeBell() { const m = bellMenu(); if (m) m.hidden = true; }

  document.addEventListener('click', (e) => {
    // ---- campana de notificaciones ----
    const bt = e.target.closest('.alz-bell [data-bell]');
    if (bt) {
      const m = bellMenu();
      if (m) {
        const abrir = m.hidden;
        m.hidden = !m.hidden;
        if (abrir) marcarLeidas();
      }
      return;
    }
    const row = e.target.closest('.alz-bell-row');
    if (row) {
      closeBell();
      const dnd = row.getAttribute('data-goto') || '';
      irAComunidad();
      if (location.hash === '#' + dnd) location.hash = '';
      location.hash = '#' + dnd;
      return;
    }
    if (bell && !e.target.closest('.alz-bell')) closeBell();

    if (!chip) return;
    const b = e.target.closest('.cmn-profile [data-act]');
    if (!b) { if (!e.target.closest('.cmn-profile')) closeMenu(); return; }
    const act = b.getAttribute('data-act');
    if (act === 'toggle') { const m = menuEl(); if (m) m.hidden = !m.hidden; return; }
    if (act === 'copiar') {
      navigator.clipboard && navigator.clipboard.writeText(perfil.handle || '').catch(() => {});
      b.textContent = '¡copiado!'; setTimeout(() => { b.textContent = 'copiar'; }, 1400); return;
    }
    if (act === 'foto') { closeMenu(); abrirEditorFoto(); return; }
    if (act === 'alias') {
      closeMenu();
      irAComunidad();
      window.dispatchEvent(new CustomEvent('alz:cambiar-alias'));
      return;
    }
    if (act === 'megusta') {
      closeMenu();
      irAComunidad();
      window.dispatchEvent(new CustomEvent('alz:me-gustan'));
      return;
    }
    if (act === 'salir') { closeMenu(); cerrarSesion(); return; }
  });

  /* ---------- editor de foto con recorte circular ---------- */
  let ed = null;
  function abrirEditorFoto() {
    if (!perfil) return;
    if (!ed) {
      ed = document.createElement('div');
      ed.className = 'alz-foto';
      ed.hidden = true;
      ed.innerHTML =
        '<div class="alz-foto-card">' +
          '<div class="alz-foto-h"><strong>Tu foto de perfil</strong>' +
            '<button type="button" class="alz-foto-x" data-x="1" aria-label="Cerrar">&times;</button></div>' +
          '<div class="alz-foto-stage" id="alz-foto-stage">' +
            '<img class="alz-foto-img" id="alz-foto-img" alt="" draggable="false">' +
            '<div class="alz-foto-ring"></div>' +
            '<div class="alz-foto-hint" id="alz-foto-hint">Elige una imagen para empezar</div>' +
          '</div>' +
          '<input type="range" class="alz-foto-zoom" id="alz-foto-zoom" min="1" max="4" step="0.01" value="1" disabled>' +
          '<p class="alz-foto-tip">Arrastra para mover · usa la barra o la rueda para acercar. El círculo es lo que se verá.</p>' +
          '<div class="alz-foto-btns">' +
            '<label class="alz-foto-file">Elegir imagen<input type="file" accept="image/*" id="alz-foto-input" hidden></label>' +
            '<button type="button" class="alz-foto-save" id="alz-foto-save" disabled>Guardar</button>' +
            '<button type="button" class="alz-foto-del" id="alz-foto-del">Quitar foto</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ed);
      wireEditor();
    }
    // estado inicial: reabre SIEMPRE sobre la imagen ORIGINAL (no la recortada),
    // con el zoom/posición que guardaste, para que puedas volver a alejarte.
    resetEditor();
    ed.hidden = false;
    document.body.style.overflow = 'hidden';
    const meta = perfil.avatar_meta || null;
    if (meta && meta.orig && /^https?:\/\//.test(meta.orig)) {
      cargarImagen(meta.orig, true, meta);
    } else if (perfil.avatar_url && /^https?:\/\//.test(perfil.avatar_url)) {
      cargarImagen(perfil.avatar_url, true, null);
    }
  }
  function cerrarEditor() {
    if (!ed) return;
    ed.hidden = true;
    document.body.style.overflow = '';
  }

  const S = 260;                 // lado del recuadro (px)
  let img, stage, zoom, saveBtn, hint;
  let natW = 0, natH = 0, baseScale = 1, scale = 1, tx = 0, ty = 0;
  let dragging = false, lastX = 0, lastY = 0;
  let origFile = null, origUrlActual = null;   // File nuevo elegido / URL del original ya guardado

  function wireEditor() {
    img = ed.querySelector('#alz-foto-img');
    stage = ed.querySelector('#alz-foto-stage');
    zoom = ed.querySelector('#alz-foto-zoom');
    saveBtn = ed.querySelector('#alz-foto-save');
    hint = ed.querySelector('#alz-foto-hint');

    ed.addEventListener('click', (e) => {
      if (e.target === ed || e.target.closest('[data-x]')) cerrarEditor();
    });
    ed.querySelector('#alz-foto-input').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { alert('Elige una imagen.'); return; }
      if (f.size > 6 * 1024 * 1024) { alert('Máximo 6 MB.'); return; }
      origFile = f;                       // esta imagen pasa a ser el NUEVO original
      origUrlActual = null;
      cargarImagen(URL.createObjectURL(f), false, null);
    });
    zoom.addEventListener('input', () => { scale = clampScale(parseFloat(zoom.value) || 1); clamp(); paint(); });
    stage.addEventListener('wheel', (e) => {
      if (!natW) return;
      e.preventDefault();
      scale = clampScale(scale * (e.deltaY < 0 ? 1.08 : 0.92));
      zoom.value = scale; clamp(); paint();
    }, { passive: false });
    stage.addEventListener('pointerdown', (e) => {
      if (!natW) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      tx += e.clientX - lastX; ty += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      clamp(); paint();
    });
    stage.addEventListener('pointerup', () => { dragging = false; });
    stage.addEventListener('pointercancel', () => { dragging = false; });

    saveBtn.addEventListener('click', guardarFoto);
    ed.querySelector('#alz-foto-del').addEventListener('click', quitarFoto);
  }

  function resetEditor() {
    natW = natH = 0; scale = 1; tx = ty = 0;
    origFile = null; origUrlActual = null;
    if (img) { img.removeAttribute('src'); img.style.width = img.style.height = img.style.transform = ''; }
    if (zoom) { zoom.value = 1; zoom.disabled = true; }
    if (saveBtn) saveBtn.disabled = true;
    if (hint) { hint.hidden = false; hint.textContent = 'Elige una imagen para empezar'; }
  }
  function clampScale(v) { return Math.min(4, Math.max(1, v || 1)); }
  function cargarImagen(src, esRemota, meta) {
    const probe = new Image();
    if (esRemota) probe.crossOrigin = 'anonymous';
    probe.onload = () => {
      natW = probe.naturalWidth; natH = probe.naturalHeight;
      baseScale = Math.max(S / natW, S / natH);
      // aplica el zoom/posición guardados (si los hay); si no, empieza en 1x centrado
      scale = meta ? clampScale(Number(meta.s) || 1) : 1;
      tx = meta && isFinite(meta.x) ? Number(meta.x) : 0;
      ty = meta && isFinite(meta.y) ? Number(meta.y) : 0;
      if (esRemota) { img.crossOrigin = 'anonymous'; origUrlActual = src; }
      else img.removeAttribute('crossorigin');
      img.src = src;
      img.style.width = (natW * baseScale) + 'px';
      img.style.height = (natH * baseScale) + 'px';
      clamp(); paint();
      zoom.value = scale; zoom.disabled = false;
      saveBtn.disabled = false;
      hint.hidden = true;
    };
    probe.onerror = () => {
      hint.hidden = false;
      hint.textContent = 'No se pudo cargar esa imagen. Elige otra desde tu equipo.';
    };
    probe.src = src;
  }
  function clamp() {
    const w = natW * baseScale * scale;
    const h = natH * baseScale * scale;
    const minX = S - w, minY = S - h;
    if (w <= S) tx = (S - w) / 2; else tx = Math.min(0, Math.max(minX, tx));
    if (h <= S) ty = (S - h) / 2; else ty = Math.min(0, Math.max(minY, ty));
  }
  function paint() {
    img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    img.style.transformOrigin = 'top left';
  }

  async function guardarFoto() {
    if (!natW) return;
    saveBtn.disabled = true; saveBtn.textContent = 'Guardando…';
    try {
      // 1) versión recortada 256x256 (la que ven todos)
      const k = baseScale * scale;
      const sx = -tx / k, sy = -ty / k, side = S / k;
      const out = 256;
      const cv = document.createElement('canvas');
      cv.width = out; cv.height = out;
      const cx = cv.getContext('2d');
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
      const blob = await new Promise((res, rej) => cv.toBlob((b) => b ? res(b) : rej(new Error('no blob')), 'image/jpeg', 0.9));
      const stamp = user.id + '-' + Date.now();
      const upC = await sb.storage.from(BUCKET).upload('avatars/' + stamp + '.jpg', blob, { cacheControl: '3600', upsert: true, contentType: 'image/jpeg' });
      if (upC.error) throw upC.error;
      const url = sb.storage.from(BUCKET).getPublicUrl('avatars/' + stamp + '.jpg').data.publicUrl;

      // 2) el ORIGINAL: solo se sube si elegiste una imagen nueva; si no, se conserva
      let origUrl = origUrlActual || (perfil.avatar_meta && perfil.avatar_meta.orig) || null;
      if (origFile) {
        const ext = (origFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const upO = await sb.storage.from(BUCKET).upload('avatars/orig-' + stamp + '.' + ext, origFile, { cacheControl: '3600', upsert: true, contentType: origFile.type || 'image/jpeg' });
        if (upO.error) throw upO.error;
        origUrl = sb.storage.from(BUCKET).getPublicUrl('avatars/orig-' + stamp + '.' + ext).data.publicUrl;
      }

      const meta = { orig: origUrl, s: Math.round(scale * 1000) / 1000, x: Math.round(tx), y: Math.round(ty) };
      const upd = await sb.from('perfiles').update({ avatar_url: url, avatar_meta: meta }).eq('id', user.id);
      if (upd.error) throw upd.error;
      aplicarAvatar(url, meta);
      cerrarEditor();
    } catch (e) {
      const msg = (e && (e.message || e)) || 'error';
      alert(/tainted|cross-origin|SecurityError/i.test(String(msg))
        ? 'No se pudo recortar esta imagen por seguridad del navegador. Elige una imagen nueva desde tu equipo.'
        : 'No se pudo guardar: ' + msg);
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = 'Guardar';
    }
  }
  async function quitarFoto() {
    if (!(await window.alzConfirm('¿Quitar tu foto? Quedarás con el avatar anónimo de la Alianza.', { aceptar: 'Quitar', peligro: true }))) return;
    const upd = await sb.from('perfiles').update({ avatar_url: 'anon', avatar_meta: null }).eq('id', user.id);
    if (upd.error) { alert('No se pudo: ' + upd.error.message); return; }
    aplicarAvatar('anon', null);
    cerrarEditor();
  }
  function aplicarAvatar(v, meta) {
    if (perfil) { perfil.avatar_url = v; perfil.avatar_meta = meta || null; }
    guardarCache(perfil);
    lastSig = null; render();
    window.dispatchEvent(new CustomEvent('alz:avatar', { detail: { url: v } }));
  }

  async function cerrarSesion() {
    guardarCache(null);
    try { await sb.auth.signOut(); } catch (_) {}
    user = null; perfil = null;
    render();
    window.dispatchEvent(new CustomEvent('alz:logout'));
  }

  async function load() {
    const { data } = await sb.auth.getSession();
    user = (data && data.session && data.session.user) || null;
    if (!user) { perfil = null; guardarCache(null); return; }
    const r = await sb.from('perfiles')
      .select('id,alias,alias_historial,handle,avatar_url,avatar_meta')
      .eq('id', user.id).maybeSingle();
    perfil = r.data || null;
    guardarCache(perfil);
  }

  function despuesDeCargar() {
    render();
    if (perfil) { suscribirNotifs(); cargarNotifs(); }
  }

  // pintado inmediato desde caché (sin flicker al navegar)
  const cache = leerCache();
  if (cache && cache.alias) { perfil = cache; render(); }
  else { ensureChip(); ensureBell(); }

  load().then(despuesDeCargar);

  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'USER_UPDATED') load().then(despuesDeCargar);
  });

  window.ALZ_NAV = {
    refresh: () => load().then(despuesDeCargar),
    get perfil() { return perfil; }
  };
})();
