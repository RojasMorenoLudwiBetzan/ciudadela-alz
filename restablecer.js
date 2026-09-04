/* =====================================================================
   RESTABLECER CONTRASEÑA — página aparte del muro.
   Llega aquí desde el enlace del correo (Supabase, type=recovery).
   - Verifica que el enlace sea válido y no haya caducado (30 min).
   - Pide la contraseña nueva y su CONFIRMACIÓN (segunda vez).
   - Cada campo tiene el "ojito" para ver/ocultar lo que escribes.
   - Al terminar, cierra sesión y te manda a iniciar sesión.
===================================================================== */
(function () {
  const cfg = window.AX_CONFIG || {};
  const box = document.getElementById('rp-box');
  if (!box) return;

  const configOk =
    window.supabase &&
    cfg.SUPABASE_URL && cfg.SUPABASE_URL.indexOf('TU-PROYECTO') === -1 &&
    cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_ANON_KEY.indexOf('PON_AQUI') === -1;

  if (!configOk) {
    box.innerHTML = '<p class="rp-state rp-bad">La web no está conectada a Supabase (revisa config.js).</p>';
    return;
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const OJO = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>';

  let resuelto = false;

  function pintarError(msg) {
    resuelto = true;
    box.innerHTML =
      '<h2 class="rp-h">Enlace no válido</h2>' +
      '<p class="rp-state rp-bad">' + msg + '</p>' +
      '<a class="cmn-send cg-btn rp-link" href="index.html?v=comunidad">Pedir un enlace nuevo</a>';
  }

  function pintarFormulario() {
    if (resuelto) return;
    resuelto = true;
    box.innerHTML =
      '<h2 class="rp-h">Elige tu contraseña nueva</h2>' +
      '<p class="rp-sub">Escríbela dos veces para confirmar. Mínimo 6 caracteres.</p>' +
      campo('rp-p1', 'Contraseña nueva') +
      campo('rp-p2', 'Repite la contraseña') +
      '<p class="cmn-msg" id="rp-msg" hidden></p>' +
      '<button type="button" class="cmn-send cg-btn" id="rp-go">Guardar contraseña</button>' +
      '<div class="cg-links"><a href="index.html?v=comunidad">Cancelar</a></div>';

    box.querySelectorAll('.cg-eye').forEach((b) => b.addEventListener('click', () => {
      const inp = b.parentNode.querySelector('input');
      const ver = inp.type === 'password';
      inp.type = ver ? 'text' : 'password';
      b.classList.toggle('is-on', ver);
      b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Ver contraseña');
    }));
    const go = document.getElementById('rp-go');
    go.addEventListener('click', guardar);
    box.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); guardar(); }
    }));
    const p1 = document.getElementById('rp-p1');
    if (p1) setTimeout(() => p1.focus(), 40);
  }

  function campo(id, label) {
    return '<label class="cg-field"><span>' + label + '</span>' +
      '<span class="cg-pass-wrap">' +
        '<input id="' + id + '" type="password" autocomplete="new-password" spellcheck="false">' +
        '<button type="button" class="cg-eye" aria-label="Ver contraseña">' + OJO + '</button>' +
      '</span></label>';
  }

  function msg(t, ok) {
    const p = document.getElementById('rp-msg');
    if (!p) return;
    p.textContent = t; p.hidden = false;
    p.classList.toggle('is-ok', !!ok);
  }

  async function guardar() {
    const p1 = (document.getElementById('rp-p1') || {}).value || '';
    const p2 = (document.getElementById('rp-p2') || {}).value || '';
    if (p1.length < 6) { msg('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (p1 !== p2) { msg('Las dos contraseñas no coinciden.'); return; }
    const go = document.getElementById('rp-go');
    if (go) { go.disabled = true; go.textContent = 'Guardando…'; }
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) {
      if (go) { go.disabled = false; go.textContent = 'Guardar contraseña'; }
      msg(/expired|invalid|not found|session/i.test(error.message || '')
        ? 'El enlace ya caducó (dura 30 minutos). Pide uno nuevo desde "Cancelar".'
        : (error.message || 'No se pudo guardar.'));
      return;
    }
    try { await sb.auth.signOut(); } catch (_) {}
    box.innerHTML =
      '<h2 class="rp-h">¡Listo!</h2>' +
      '<p class="rp-state rp-ok">Tu contraseña se cambió. Te llevamos a iniciar sesión…</p>';
    setTimeout(() => { location.href = 'index.html?v=comunidad'; }, 2500);
  }

  /* ---- detectar el enlace de recuperación ---- */
  const hash = location.hash || '';
  if (/error=|error_description=/.test(hash)) {
    const p = new URLSearchParams(hash.replace(/^#/, ''));
    const d = (p.get('error_description') || p.get('error') || '').replace(/\+/g, ' ');
    pintarError(/expired|invalid/i.test(d)
      ? 'Este enlace ya caducó (dura 30 minutos) o ya se usó. Pide uno nuevo.'
      : (decodeURIComponent(d) || 'El enlace no es válido.'));
    return;
  }

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) pintarFormulario();
  });

  // por si el evento ya pasó antes de registrar el listener
  sb.auth.getSession().then(({ data }) => {
    if (data && data.session && data.session.user) pintarFormulario();
  });

  // si en unos segundos no hubo sesión ni error, el enlace no sirve
  setTimeout(() => {
    if (resuelto) return;
    sb.auth.getSession().then(({ data }) => {
      if (data && data.session && data.session.user) pintarFormulario();
      else pintarError('No encontramos un enlace de recuperación válido. Ábrelo desde el correo más reciente (caduca a los 30 minutos).');
    });
  }, 3500);
})();
