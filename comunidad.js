/* =====================================================================
   COMUNIDAD ALZ — cuentas @alz.pe   (Supabase Auth)
   - Panel de actividad (abajo a la derecha) con cada paso.
   - Cada botón siempre deja un mensaje visible.
   - Chequeo de conexión al arrancar.
   Requiere: ejecutar supabase/comunidad.sql  +  Auth > "Confirm email" OFF.
===================================================================== */

(function () {
  const cfg = window.AX_CONFIG || {};
  const feed = document.getElementById('cmn-feed');
  if (!feed) return;

  const DOMINIO = '@alz.pe';

  const configOk =
    window.supabase &&
    cfg.SUPABASE_URL && cfg.SUPABASE_URL.indexOf('TU-PROYECTO') === -1 &&
    cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_ANON_KEY.indexOf('PON_AQUI') === -1;

  const sb = configOk ? (window.ALZ_SB || window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)) : null;
  if (sb) window.ALZ_SB = sb;
  const BUCKET = cfg.BUCKET || 'evidencia';
  const PAGE = 15;

  /* ---------- panel de actividad (registro de lo que pasa) ----------
     Visible SOLO para admins (o con ?debug=1). Sirve para ver errores. */
  const logPanel = document.createElement('div');
  logPanel.className = 'cmn-log is-min';
  logPanel.innerHTML =
    '<div class="cmn-log-head">Registro de actividad · admin <button type="button" class="cmn-log-toggle">+</button></div>' +
    '<div class="cmn-log-body"></div>';
  const logBody = logPanel.querySelector('.cmn-log-body');
  const logBuffer = [];   // guarda lo de antes de que se muestre el panel
  let logVisible = false;

  function pintarLinea(o) {
    const line = document.createElement('div');
    line.className = 'cmn-log-line' + (o.kind ? ' is-' + o.kind : '');
    line.textContent = o.t + '  ' + o.msg;
    logBody.appendChild(line);
    logBody.scrollTop = logBody.scrollHeight;
    while (logBody.children.length > 80) logBody.removeChild(logBody.firstChild);
  }
  function mostrarLog() {
    if (logVisible) return;
    logVisible = true;
    document.body.appendChild(logPanel);
    logPanel.querySelector('.cmn-log-toggle').addEventListener('click', () => {
      logPanel.classList.toggle('is-min');
      logPanel.querySelector('.cmn-log-toggle').textContent = logPanel.classList.contains('is-min') ? '+' : '–';
    });
    logBuffer.forEach(pintarLinea);   // vuelca lo acumulado
  }
  function log(msg, kind) {
    try { console.log('[comunidad] ' + msg); } catch (_) {}
    const o = { t: new Date().toLocaleTimeString('es-PE', { hour12: false }), msg: String(msg), kind: kind };
    logBuffer.push(o);
    if (logBuffer.length > 120) logBuffer.shift();
    if (logVisible) pintarLinea(o);
  }
  if (/[?&]debug=1\b/.test(location.search)) mostrarLog();

  /* ---------- elementos ---------- */
  const gate      = document.getElementById('cmn-gate');
  const gateCard  = document.getElementById('cmn-gate-card');
  const composer  = document.getElementById('cmn-compose');
  const txt       = document.getElementById('cmn-text');
  const myAvatar  = document.getElementById('cmn-my-avatar');
  const fileIn    = document.getElementById('cmn-file');
  const attachBtn = document.getElementById('cmn-attach-btn');
  const mediaStrip = document.getElementById('cmn-media-strip');
  const limitHint = document.getElementById('cmn-limit-hint');
  const catPills  = document.getElementById('cmn-cat-pills');
  const pubBtn    = document.getElementById('cmn-publish');
  const pubMsg    = document.getElementById('cmn-compose-msg');
  const moreBtn   = document.getElementById('cmn-more');
  const filters   = Array.from(document.querySelectorAll('[data-cat-filter]'));

  /* ---------- reglas por categoría ----------
     Comunidad: mensajes de texto y, opcionalmente, imágenes (sin videos ni audios).
     Fandom · Edits: SOLO se comparte material (imágenes, videos o audios); sin texto. */
  const LIMITES = {
    comunidad: { img: 4, vid: 0, aud: 0, vidSeg: 0,   txt: 'Comunidad: mensajes de texto e imágenes' },
    fandom:    { img: 3, vid: 2, aud: 2, vidSeg: 300, soloMedia: true, txt: 'Fandom: comparte imágenes, videos o audios (sin texto)' }
  };

  /* ---------- estado ---------- */
  let user = null;
  let perfil = null;
  let mode = 'login';
  let chip = null;
  let attachments = [];           // [{ file, t:'img'|'vid'|'aud', url }]
  let filterCat = 'comunidad';
  let offset = 0, loading = false, done = false;
  let conexion = 'comprobando';
  const likesMine = new Set();
  const reaccionesMine = new Map();    // pubId -> Set(tipo)
  const reaccionesCount = new Map();   // pubId -> { tipo: n }

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function initial(a) { return String(a || '?').charAt(0).toUpperCase(); }
  function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'ahora';
    if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
    if (s < 604800) return 'hace ' + Math.floor(s / 86400) + ' d';
    return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).catch(() => {}); return; }
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  function errMsg(e) {
    const m = (e && (e.message || e.error_description || e.msg || e.hint || '')) || '';
    if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/Email not confirmed/i.test(m)) return 'Tu correo aún no está confirmado. Abre el enlace que te mandó Supabase a tu Gmail, o desactiva "Confirm email" en Supabase (Authentication > Providers > Email).';
    if (/User already registered/i.test(m)) return 'Ese correo ya tiene una cuenta. Ve a "Ya tengo cuenta" e inicia sesión.';
    if (/Password should be at least|at least 6/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
    if (/Unable to validate email|invalid format|valid email/i.test(m)) return 'Ese correo no es válido.';
    if (/rate limit|too many|for security purposes/i.test(m)) return 'Supabase te frenó por muchos intentos seguidos. Espera 1-2 minutos y reintenta.';
    if (/duplicate key|already exists|unique constraint/i.test(m)) return 'Ese alias ya está en uso. Elige otro.';
    if (/column .* does not exist/i.test(m)) return 'Falta actualizar la base de datos. Corre en Supabase el SQL que agrega la columna "media" a publicaciones.';
    if (/relation .* does not exist|42P01|Could not find the table|schema cache/i.test(m)) return 'FALTAN LAS TABLAS en Supabase. Ejecuta el script supabase/comunidad.sql completo.';
    if (/Failed to fetch|NetworkError|ERR_/i.test(m)) return 'No hay conexión con Supabase. Revisa tu internet o los datos de config.js.';
    return m || 'Error desconocido (revisa el panel de actividad).';
  }

  /* ---------- chequeo de conexión ---------- */
  async function probarConexion() {
    if (!sb) { conexion = 'sin-conexion'; log('config.js sin datos de Supabase', 'err'); return; }
    log('Conectando a ' + cfg.SUPABASE_URL.replace('https://', '') + ' …');
    try {
      const { error } = await sb.from('perfiles').select('id', { head: true, count: 'exact' });
      if (error) {
        if (/does not exist|42P01|schema cache|Could not find the table/i.test(error.message || '')) {
          conexion = 'sin-tablas';
          log('Conecta con Supabase, pero la tabla "perfiles" NO existe. Falta correr comunidad.sql.', 'err');
        } else {
          conexion = 'sin-conexion';
          log('Error consultando Supabase: ' + error.message, 'err');
        }
        return;
      }
      conexion = 'ok';
      log('Conexión con Supabase OK. Tablas de la comunidad detectadas.', 'ok');
    } catch (e) {
      conexion = 'sin-conexion';
      log('No se pudo contactar Supabase: ' + (e && e.message), 'err');
    }
  }
  function estadoConexionHTML() {
    const map = {
      'comprobando': ['#8ea9c8', 'comprobando conexión…'],
      'ok': ['#6fd39a', 'conectado a Supabase'],
      'sin-tablas': ['#ffb05a', 'conecta pero faltan las tablas (corre comunidad.sql)'],
      'sin-conexion': ['#ff8f8f', 'SIN conexión con Supabase (revisa config.js / internet)']
    };
    const s = map[conexion] || map.comprobando;
    return '<div class="cg-conn"><span style="background:' + s[0] + '"></span>Supabase: ' + s[1] + '</div>';
  }

  /* ---------- perfil en el encabezado ----------
     El chip lo dibuja perfil-nav.js (persiste en todas las páginas).
     Aquí solo le pedimos que se refresque. */
  function buildChip() {}
  function renderChip() { if (window.ALZ_NAV) window.ALZ_NAV.refresh(); }
  function closeMenu() {}

  /* ---------- puerta ---------- */
  const OJO_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>';
  function field(id, type, label, ac) {
    const inp = '<input id="' + id + '" type="' + type + '" autocomplete="' + (ac || 'off') + '" spellcheck="false">';
    const control = (type === 'password')
      ? '<span class="cg-pass-wrap">' + inp + '<button type="button" class="cg-eye" data-eye="' + id + '" aria-label="Ver contraseña">' + OJO_SVG + '</button></span>'
      : inp;
    return '<label class="cg-field"><span>' + label + '</span>' + control + '</label>';
  }
  // En la SPA comunidad.js siempre está cargado; la puerta solo debe
  // aparecer cuando el usuario está viendo la sección "Comunidad".
  function enVistaComunidad() {
    const v = document.body.getAttribute('data-vista');
    if (v != null) return v === 'comunidad';
    return document.body.getAttribute('data-page') === 'comunidad';
  }

  function openGate(m) {
    mode = m;
    if (m !== 'nueva-clave' && !enVistaComunidad()) return;
    gate.hidden = false;
    if (typeof dock !== 'undefined' && dock) dock.classList.add('is-min');
    document.body.classList.add('cmn-locked');
    renderGate();
    const first = gateCard.querySelector('input');
    if (first) setTimeout(() => { try { first.focus(); } catch (_) {} }, 40);
  }
  function closeGate() {
    gate.hidden = true;
    document.body.classList.remove('cmn-locked');
  }
  function gateMsg(text, ok) {
    const p = gateCard.querySelector('.cmn-msg');
    if (!p) { log('mensaje: ' + text); return; }
    p.textContent = text;
    p.hidden = false;
    p.classList.toggle('is-ok', !!ok);
  }
  function busy(on) { const b = gateCard.querySelector('.cg-btn'); if (b) { b.disabled = on; b.dataset.load = on ? '1' : ''; if (on) b.textContent = 'Procesando…'; } }
  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  // El alias visible admite espacios y tildes (2–30). NO afecta al inicio de
  // sesión: para entrar se usa el "slug" permanente (letras/números sin acentos).
  function validAlias(a) {
    return a.length >= 2 && a.length <= 30 && a.trim() === a && /^[A-Za-z0-9À-ÿ ._-]+$/.test(a);
  }
  function slug(s) {
    return String(s || '').toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '')   // quita acentos
      .replace(/[^a-z0-9]+/g, '');       // deja solo letras/números
  }

  function renderGate() {
    const mark = '<div class="cmn-gate-mark">ALZ</div>' + estadoConexionHTML();
    let body = '';

    if (mode === 'login') {
      body = '<h3>Entrar</h3><p>Pon tu nombre y tu contraseña.</p>' +
        '<label class="cg-field"><span>Tu nombre</span><span class="cg-handle"><input id="cg-alias" type="text" autocomplete="username" spellcheck="false" placeholder="tu nombre"><em>' + DOMINIO + '</em></span></label>' +
        field('cg-pass', 'password', 'Tu contraseña', 'current-password') +
        '<p class="cmn-msg" hidden></p>' +
        '<button type="button" class="cmn-send cg-btn" data-go="login">Entrar</button>' +
        '<p class="cg-nocuenta">¿No tienes cuenta? Crea una aquí abajo <span aria-hidden="true">&#8595;</span></p>' +
        '<div class="cg-links"><button type="button" class="cg-crear" data-nav="registro">Crear cuenta nueva</button>' +
        '<button type="button" data-nav="recuperar">Olvidé mi contraseña</button></div>';
    } else if (mode === 'registro') {
      body = '<h3>Crear cuenta</h3><p>Solo elige un nombre para <b>entrar</b> y una contraseña. El correo es únicamente por si olvidas la contraseña.</p>' +
        '<label class="cg-field"><span>Tu nombre <em class="cg-hint">esto NO es como te verán en la comunidad — es tu usuario para iniciar sesión; tu nombre visible lo eliges y cambias después</em></span><span class="cg-handle"><input id="cg-alias" type="text" autocomplete="off" spellcheck="false" placeholder="tu nombre de acceso"><em>' + DOMINIO + '</em></span></label>' +
        field('cg-pass', 'password', 'CREA TU CONTRASEÑA — apúntala (mín. 6)', 'new-password') +
        field('cg-pass2', 'password', 'REPITE LA CONTRASEÑA', 'new-password') +
        field('cg-email', 'email', 'Tu correo (para recuperar la contraseña)', 'email') +
        '<p class="cmn-msg" hidden></p>' +
        '<button type="button" class="cmn-send cg-btn" data-go="registro">Crear cuenta</button>' +
        '<div class="cg-links"><button type="button" data-nav="login">Ya tengo cuenta</button></div>';
    } else if (mode === 'recuperar') {
      body = '<h3>Recuperar contraseña</h3><p>Escribe el <b>correo real</b> que pusiste al crear tu cuenta. Te llegará un enlace para poner una nueva contraseña.</p>' +
        field('cg-email', 'email', 'Tu correo real', 'email') +
        '<p class="cmn-msg" hidden></p>' +
        '<button type="button" class="cmn-send cg-btn" data-go="recuperar">Enviar enlace</button>' +
        '<div class="cg-links"><button type="button" data-nav="login">Volver</button></div>';
    } else if (mode === 'nueva-clave') {
      body = '<h3>Nueva contraseña</h3><p>Escríbela dos veces. Mínimo 6 caracteres — apúntala.</p>' +
        field('cg-pass', 'password', 'Nueva contraseña', 'new-password') +
        field('cg-pass2', 'password', 'Repite la contraseña', 'new-password') +
        '<p class="cmn-msg" hidden></p>' +
        '<button type="button" class="cmn-send cg-btn" data-go="nueva-clave">Guardar contraseña</button>' +
        '<div class="cg-links"><button type="button" data-nav="login">Volver</button></div>';
    } else if (mode === 'completar') {
      body = '<h3>Elige tu alias</h3><p>Tu cuenta ya existe, falta el alias. Será <b>alias' + DOMINIO + '</b>.</p>' +
        '<label class="cg-field"><span>Alias</span><span class="cg-handle"><input id="cg-alias" type="text" autocomplete="off" spellcheck="false" placeholder="tu alias"><em>' + DOMINIO + '</em></span></label>' +
        '<p class="cmn-msg" hidden></p>' +
        '<button type="button" class="cmn-send cg-btn" data-go="completar">Guardar</button>' +
        '<div class="cg-links"><button type="button" data-nav="salir">Cerrar sesión</button></div>';
    } else if (mode === 'cambiar') {
      body = '<h3>Cambiar alias</h3><p>El actual quedará como anterior. Tu correo <b>' + esc(perfil.handle) + '</b> no cambia.</p>' +
        '<label class="cg-field"><span>Nuevo alias</span><span class="cg-handle"><input id="cg-alias" type="text" autocomplete="off" spellcheck="false" value="' + esc(perfil.alias) + '"><em>' + DOMINIO + '</em></span></label>' +
        '<p class="cmn-msg" hidden></p>' +
        '<button type="button" class="cmn-send cg-btn" data-go="cambiar">Guardar</button>' +
        '<div class="cg-links"><button type="button" data-nav="cerrar">Cancelar</button></div>';
    }

    gateCard.innerHTML = mark + body;
    gateCard.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => runGate(b.getAttribute('data-go'))));
    gateCard.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
      const to = b.getAttribute('data-nav');
      if (to === 'cerrar') { closeGate(); return; }
      if (to === 'salir') { logout(); return; }
      openGate(to);
    }));
    gateCard.querySelectorAll('input').forEach((inp) => inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const go = gateCard.querySelector('.cg-btn'); if (go) go.click(); }
    }));
    gateCard.querySelectorAll('.cg-eye').forEach((b) => b.addEventListener('click', () => {
      const inp = document.getElementById(b.getAttribute('data-eye'));
      if (!inp) return;
      const ver = inp.type === 'password';
      inp.type = ver ? 'text' : 'password';
      b.classList.toggle('is-on', ver);
      b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Ver contraseña');
    }));
    // si aún estás en espera para reenviar el enlace, muestra el contador
    if (mode === 'recuperar' && resetHasta > Date.now()) setTimeout(iniciarCooldown, 0);
  }

  async function runGate(go) {
    log('click: ' + go);
    const btn = gateCard.querySelector('.cg-btn');
    const label = btn ? btn.textContent : '';
    try {
      await onGate(go);
    } catch (e) {
      log('ERROR en ' + go + ': ' + (e && e.message), 'err');
      gateMsg(errMsg(e));
    } finally {
      if (btn && btn.dataset.cdActive !== '1') {
        btn.disabled = false;
        if (btn.dataset.load) { btn.textContent = label; btn.dataset.load = ''; }
      }
    }
  }

  /* contador para el botón de "Enviar enlace" de recuperación */
  let resetHasta = 0;
  function iniciarCooldown() {
    const b = gateCard.querySelector('.cg-btn');
    if (!b) return;
    b.dataset.cdActive = '1';
    b.dataset.load = '';
    b.disabled = true;
    (function tick() {
      const bb = gateCard.querySelector('.cg-btn');
      if (!bb || bb.dataset.cdActive !== '1') return;
      const rest = Math.ceil((resetHasta - Date.now()) / 1000);
      if (rest <= 0) {
        bb.disabled = false;
        bb.dataset.cdActive = '';
        bb.textContent = 'Reenviar enlace';
        return;
      }
      bb.textContent = 'Espera ' + rest + ' s…';
      setTimeout(tick, 1000);
    })();
  }

  async function onGate(go) {
    if (go === 'login') {
      const entrada = val('cg-alias').replace(/\s*@?\s*alz\.pe\s*$/i, '').trim();
      const alias = slug(entrada);
      const pass = val('cg-pass');
      if (!alias || !pass) { gateMsg('Completa tu alias y la contraseña.'); return; }
      busy(true);

      const handle = alias + DOMINIO;
      log('buscando la cuenta ' + handle + ' …');
      const r = await sb.rpc('email_de_handle', { p_handle: handle });
      if (r.error) {
        log('email_de_handle error: ' + r.error.message, 'err');
        gateMsg(/Could not find the function|schema cache/i.test(r.error.message || '')
          ? 'Falta ejecutar el SQL en Supabase (función email_de_handle). Corre supabase/comunidad.sql completo.'
          : errMsg(r.error));
        return;
      }
      // SOLO se inicia sesión con el alias ORIGINAL (el de acceso, permanente).
      // El alias que cambias después es solo para que te vean en la comunidad.
      const email = r.data ? String(r.data).toLowerCase() : '';
      if (!email) { gateMsg('Para entrar usa el alias con el que CREASTE la cuenta (el que cambiaste después no sirve para iniciar sesión).'); return; }

      log('signInWithPassword(' + handle + ') …');
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) { log('login error: ' + error.message, 'err'); gateMsg(/Invalid login credentials/i.test(error.message || '') ? 'Contraseña incorrecta para ' + handle + '.' : errMsg(error)); return; }
      user = data.user;
      log('sesión iniciada: @' + alias, 'ok');
      await cargarPerfil();
      if (!perfil) { log('no hay fila en "perfiles" → pedir alias'); openGate('completar'); return; }
      log('perfil cargado: @' + perfil.alias, 'ok');
      afterAuth(); loadFeed(true);
      return;
    }

    if (go === 'registro') {
      const alias = val('cg-alias'), email = val('cg-email').toLowerCase(), pass = val('cg-pass'), pass2 = val('cg-pass2');
      if (!validAlias(alias)) { gateMsg('El nombre debe tener 2 a 30 letras o números (se permiten espacios).'); return; }
      const base = slug(alias);
      if (base.length < 2) { gateMsg('El nombre necesita al menos 2 letras o números.'); return; }
      if (pass.length < 6) { gateMsg('La contraseña debe tener al menos 6 caracteres.'); return; }
      if (pass !== pass2) { gateMsg('Las dos contraseñas no son iguales. Vuelve a escribirlas.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { gateMsg('Escribe un correo válido (ej. tunombre@gmail.com).'); return; }
      busy(true);
      const handle = base + DOMINIO;
      log('comprobando si el alias "' + alias + '" está libre …');
      const taken = await sb.from('perfiles').select('id').eq('alias', alias).maybeSingle();
      if (taken.error && !/PGRST116/i.test(taken.error.code || '')) { gateMsg(errMsg(taken.error)); return; }
      if (taken.data) { gateMsg('Ese alias ya está en uso. Elige otro.'); return; }
      const dupH = await sb.from('perfiles').select('id').eq('handle', handle).maybeSingle();
      if (dupH.data) { gateMsg('El nombre de acceso "' + base + '" ya existe. Cambia un poco el alias.'); return; }
      log('alias libre. Creando cuenta ' + handle + ' (recuperación: ' + email + ') …');
      const { data, error } = await sb.auth.signUp({ email, password: pass });
      if (error) { log('signUp error: ' + error.message, 'err'); gateMsg(errMsg(error)); return; }
      if (!data.session) {
        log('cuenta creada SIN sesión → "Confirm email" está activo en Supabase', 'warn');
        gateMsg('Falta un ajuste en Supabase: Authentication > Providers > Email > desactiva "Confirm email". Luego vuelve a crear la cuenta.', false);
        return;
      }
      user = data.user;
      log('cuenta creada. Guardando perfil …');
      const ins = await sb.from('perfiles').insert({ id: user.id, alias: alias, handle: handle });
      if (ins.error) { log('insert perfil error: ' + ins.error.message, 'err'); gateMsg(errMsg(ins.error)); return; }
      log('perfil guardado: ' + alias + '  →  cerrando sesión para que inicies con tus datos nuevos', 'ok');
      await sb.auth.signOut();
      user = null; perfil = null;
      openGate('login');
      gateMsg('✅ ¡Cuenta creada! Ahora entra: nombre "' + base + '" y la contraseña que acabas de poner.', true);
      return;
    }

    if (go === 'recuperar') {
      if (resetHasta > Date.now()) {
        gateMsg('Espera ' + Math.ceil((resetHasta - Date.now()) / 1000) + ' s antes de pedir otro enlace.');
        return;
      }
      const email = val('cg-email');
      if (!email) { gateMsg('Escribe tu correo.'); return; }
      busy(true);
      const redirectTo = location.origin + location.pathname.replace(/[^/]*$/, 'restablecer.html');
      log('resetPasswordForEmail(' + email + ') redirect=' + redirectTo + ' …');
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) { log('reset error: ' + error.message, 'err'); gateMsg(errMsg(error)); return; }
      log('solicitud de reset enviada (si el correo existe)', 'ok');
      resetHasta = Date.now() + 60000;   // 60 s de espera para reenviar
      iniciarCooldown();
      gateMsg('Enlace enviado. Revisa tu correo y también spam. El enlace dura 30 minutos y abre una página aparte para escribir y confirmar tu contraseña nueva.', true);
      return;
    }

    if (go === 'nueva-clave') {
      const pass = val('cg-pass'), pass2 = val('cg-pass2');
      if (pass.length < 6) { gateMsg('Mínimo 6 caracteres.'); return; }
      if (pass !== pass2) { gateMsg('Las dos contraseñas no son iguales.'); return; }
      busy(true);
      log('updateUser({password}) …');
      const { error } = await sb.auth.updateUser({ password: pass });
      if (error) { log('updateUser error: ' + error.message, 'err'); gateMsg(errMsg(error)); return; }
      log('contraseña cambiada', 'ok');
      const u = await sb.auth.getUser();
      user = u.data.user;
      await cargarPerfil();
      if (!perfil) { openGate('completar'); return; }
      afterAuth(); loadFeed(true);
      return;
    }

    if (go === 'completar' || go === 'cambiar') {
      const alias = val('cg-alias');
      if (!validAlias(alias)) { gateMsg('Alias no válido: 2 a 30 caracteres (letras, números, espacios, punto, guion o guion bajo).'); return; }
      busy(true);
      if (go === 'completar') {
        const base = slug(alias);
        if (base.length < 2) { gateMsg('El alias necesita al menos 2 letras o números.'); return; }
        const taken = await sb.from('perfiles').select('id').eq('alias', alias).maybeSingle();
        if (taken.data) { gateMsg('Ese alias ya está en uso.'); return; }
        log('insert perfil ' + alias + ' …');
        const ins = await sb.from('perfiles').insert({ id: user.id, alias: alias, handle: base + DOMINIO });
        if (ins.error) { gateMsg(errMsg(ins.error)); return; }
        log('perfil creado', 'ok');
      } else {
        log('update alias -> ' + alias + ' …');
        const upd = await sb.from('perfiles').update({ alias: alias }).eq('id', user.id);
        if (upd.error) { gateMsg(errMsg(upd.error)); return; }
        log('alias cambiado', 'ok');
      }
      await cargarPerfil();
      afterAuth(); loadFeed(true);
      return;
    }
  }

  /* ---------- sesión ---------- */
  async function cargarPerfil() {
    if (!user) { perfil = null; return; }
    const { data, error } = await sb.from('perfiles').select('*').eq('id', user.id).maybeSingle();
    if (error && !/PGRST116/i.test(error.code || '')) { log('cargarPerfil error: ' + error.message, 'err'); }
    perfil = data || null;
    if (perfil && perfil.es_admin) mostrarLog();   // el registro de actividad solo lo ven los admins
    if (perfil) { await cargarMisLikes(); await cargarMisReacciones(); }
  }
  async function cargarMisLikes() {
    likesMine.clear();
    const { data } = await sb.from('pub_likes').select('pub').eq('perfil', user.id);
    (data || []).forEach((r) => likesMine.add(r.pub));
  }
  async function cargarMisReacciones() {
    reaccionesMine.clear();
    const { data, error } = await sb.from('pub_reacciones').select('pub,tipo').eq('perfil', user.id);
    if (error) { log('cargarMisReacciones: ' + error.message, 'warn'); return; }
    (data || []).forEach((r) => {
      if (!reaccionesMine.has(r.pub)) reaccionesMine.set(r.pub, new Set());
      reaccionesMine.get(r.pub).add(r.tipo);
    });
  }
  function afterAuth() { renderChip(); render(); closeGate(); arrancarSocial(); }
  let socialOn = false;
  function arrancarSocial() {
    if (socialOn || !perfil || !sb) return;
    socialOn = true;
    try { initSocial(); suscribirAmistades(); suscribirMuro(); } catch (e) { log('social init: ' + (e && e.message), 'warn'); }
  }
  function pararSocial() {
    socialOn = false;
    try { sb.removeAllChannels(); } catch (_) {}
    canalSala = canalPresencia = muroCanal = null;
    salaAbierta = null; online.clear();
    amigos = []; solicitudes = []; noLeidos = 0;
    if (dock) { dock.remove(); dock = null; dockBody = null; }
    cerrarPop();
  }
  async function logout() {
    log('cerrando sesión …');
    pararSocial();
    await sb.auth.signOut();
    user = null; perfil = null;
    likesMine.clear(); reaccionesMine.clear(); reaccionesCount.clear();
    feed.innerHTML = '';
    renderChip(); render();
    log('sesión cerrada', 'ok');
  }
  function pintarMiAvatar() {
    if (!myAvatar) return;
    myAvatar.style.backgroundImage = '';
    myAvatar.innerHTML = avatarInnerHTML(perfil);
  }
  function render() {
    if (perfil) {
      if (composer) composer.hidden = false;
      sincronizarComposer();
      pintarMiAvatar();
      closeGate();
    } else {
      if (composer) composer.hidden = true;
      if (enVistaComunidad() || mode === 'nueva-clave') {
        openGate(mode === 'nueva-clave' ? 'nueva-clave' : (user ? 'completar' : 'login'));
      } else {
        closeGate();
      }
    }
  }

  /* ---------- cambio de sección de la SPA (router.js) ---------- */
  window.addEventListener('alz:vista', (e) => {
    if (e.detail === 'comunidad') {
      render();
      irAMencion();
      if (perfil && feed && !feed.children.length) loadFeed(true);
    } else {
      closeGate();
    }
  });

  /* ---------- eventos del chip global (perfil-nav.js) ---------- */
  window.addEventListener('alz:cambiar-alias', () => { if (perfil) openGate('cambiar'); });
  window.addEventListener('alz:me-gustan', () => { if (perfil) abrirMeGustan(); });
  window.addEventListener('alz:avatar', () => {
    if (!perfil) return;
    if (window.ALZ_NAV && window.ALZ_NAV.perfil) {
      perfil.avatar_url = window.ALZ_NAV.perfil.avatar_url;
      perfil.avatar_meta = window.ALZ_NAV.perfil.avatar_meta || null;
    }
    pintarMiAvatar();
    // solo cambia MI avatar en el muro y en los comentarios abiertos; nada más se recarga
    const nuevo = avatarInnerHTML(perfil);
    feed.querySelectorAll('.cmn-av-btn[data-perfil="' + perfil.id + '"]').forEach((b) => { b.innerHTML = nuevo; });
  });
  window.addEventListener('alz:logout', () => {
    pararSocial();
    user = null; perfil = null;
    likesMine.clear(); reaccionesMine.clear(); reaccionesCount.clear();
    feed.innerHTML = '';
    render();
  });

  /* ---------- componer ---------- */
  if (txt) txt.addEventListener('input', () => { txt.style.height = 'auto'; txt.style.height = Math.min(txt.scrollHeight, 200) + 'px'; });
  if (txt) montarAutocompletar(txt);

  // Categoría en la que se publica: sigue al filtro; en "Todo" usa las pastillas.
  function currentCat() {
    if (filterCat === 'comunidad' || filterCat === 'fandom') return filterCat;
    const r = document.querySelector('input[name="cmn-cat"]:checked');
    return r ? r.value : 'comunidad';
  }
  const postTo = document.getElementById('cmn-post-to');
  const CAT_PH = {
    comunidad: 'Escribe un mensaje para la gente de ALZ… (puedes adjuntar imágenes)',
    fandom: 'En Fandom solo se comparten imágenes, videos o audios — adjunta tu material 👇'
  };
  function sincronizarComposer() {
    const c = currentCat();
    const soloMedia = c === 'fandom';
    if (txt) {
      txt.placeholder = CAT_PH[c];
      txt.disabled = soloMedia;            // Fandom = sin texto
      txt.classList.toggle('is-off', soloMedia);
      if (soloMedia) { txt.value = ''; txt.style.height = 'auto'; }
    }
    // adjuntar: Fandom (imágenes/videos/audios) y Comunidad (solo imágenes)
    if (attachBtn) attachBtn.hidden = false;
    if (fileIn) fileIn.setAttribute('accept', soloMedia ? 'image/*,video/*,audio/*' : 'image/*');
    // quita los adjuntos que la categoría actual ya no permite
    const L = LIMITES[c];
    if (attachments.length) {
      const cnt = { img: 0, vid: 0, aud: 0 };
      const keep = [];
      attachments.forEach((a) => {
        cnt[a.t]++;
        if (L[a.t] && cnt[a.t] <= L[a.t]) keep.push(a);
        else { try { URL.revokeObjectURL(a.url); } catch (_) {} }
      });
      if (keep.length !== attachments.length) { attachments = keep; renderStrip(); }
    }
    if (postTo) postTo.innerHTML = 'Publicas en <b>' + (soloMedia ? 'Fandom · Edits' : 'Comunidad') + '</b>';
    // "Enviar" en Comunidad (es al instante, como un chat) · "Publicar" en Fandom
    if (pubBtn) pubBtn.textContent = soloMedia ? 'Publicar' : 'Enviar';
    if (catPills) catPills.hidden = (filterCat !== 'todos');
    actualizarHint();
  }
  function tipoDe(file) {
    if (/^image\//.test(file.type)) return 'img';
    if (/^video\//.test(file.type)) return 'vid';
    if (/^audio\//.test(file.type)) return 'aud';
    return null;
  }
  function cuentaTipo(t) { return attachments.filter((a) => a.t === t).length; }
  function videoDuracion(file) {
    return new Promise((res) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { try { URL.revokeObjectURL(v.src); } catch (_) {} res(v.duration || 0); };
      v.onerror = () => res(0);
      v.src = URL.createObjectURL(file);
    });
  }
  function limpiarAdjuntos() {
    attachments.forEach((a) => { try { URL.revokeObjectURL(a.url); } catch (_) {} });
    attachments = [];
    renderStrip();
  }
  function renderStrip() {
    if (!mediaStrip) return;
    mediaStrip.innerHTML = attachments.map((a, i) => {
      let inner;
      if (a.t === 'img') inner = '<img src="' + a.url + '" alt="">';
      else if (a.t === 'vid') inner = '<video src="' + a.url + '" muted></video><span class="cmn-mt">▶</span>';
      else inner = '<span class="cmn-mt">🎵</span>';
      return '<div class="cmn-mthumb cmn-mthumb-' + a.t + '">' + inner +
        '<button type="button" class="cmn-mthumb-x" data-rm="' + i + '" aria-label="Quitar">✕</button></div>';
    }).join('');
    mediaStrip.hidden = attachments.length === 0;
  }
  if (mediaStrip) mediaStrip.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    const i = parseInt(b.getAttribute('data-rm'), 10);
    if (attachments[i]) { try { URL.revokeObjectURL(attachments[i].url); } catch (_) {} attachments.splice(i, 1); renderStrip(); }
  });
  function actualizarHint() { if (limitHint) limitHint.textContent = LIMITES[currentCat()].txt; }
  if (catPills) catPills.addEventListener('change', () => {
    const L = LIMITES[currentCat()];
    const keep = []; const c = { img: 0, vid: 0, aud: 0 };
    attachments.forEach((a) => { c[a.t]++; if (c[a.t] <= L[a.t]) keep.push(a); else { try { URL.revokeObjectURL(a.url); } catch (_) {} } });
    if (keep.length !== attachments.length) { attachments = keep; renderStrip(); pubMsg.hidden = true; }
    sincronizarComposer();
  });
  actualizarHint();

  if (fileIn) fileIn.addEventListener('change', async () => {
    const L = LIMITES[currentCat()];
    const files = Array.from(fileIn.files || []);
    fileIn.value = '';
    for (const f of files) {
      const t = tipoDe(f);
      if (!t) { pubMsg.textContent = 'Archivo no soportado: ' + f.name; pubMsg.hidden = false; continue; }
      if (L[t] === 0) { pubMsg.textContent = currentCat() === 'comunidad' ? 'En Comunidad solo puedes adjuntar imágenes (no videos ni audios).' : 'Ese tipo de archivo no se permite en Fandom.'; pubMsg.hidden = false; continue; }
      if (cuentaTipo(t) >= L[t]) {
        pubMsg.textContent = 'Máx. ' + L[t] + ' ' + (t === 'img' ? 'imagen(es)' : t === 'vid' ? 'video(s)' : 'audio') + ' en ' + currentCat() + '.';
        pubMsg.hidden = false; continue;
      }
      if (f.size > (cfg.MAX_MB || 25) * 1024 * 1024) { pubMsg.textContent = f.name + ' pesa más de ' + (cfg.MAX_MB || 25) + ' MB.'; pubMsg.hidden = false; continue; }
      if (t === 'vid') {
        const dur = await videoDuracion(f);
        if (dur > L.vidSeg + 1) {
          pubMsg.textContent = 'El video "' + f.name + '" dura ~' + Math.round(dur) + 's. Máximo ' + L.vidSeg + 's en ' + currentCat() + '.';
          pubMsg.hidden = false; continue;
        }
      }
      attachments.push({ file: f, t: t, url: URL.createObjectURL(f) });
    }
    renderStrip();
  });

  async function subir(file) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const path = 'comunidad/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
    const up = await sb.storage.from(BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
    if (up.error) throw up.error;
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path: path };
  }
  if (pubBtn) pubBtn.addEventListener('click', async () => {
    if (!perfil) { openGate('login'); return; }
    const cat = currentCat();
    let cuerpo = (txt.value || '').trim();
    if (cat === 'fandom') {
      cuerpo = '';                                   // Fandom no lleva texto
      if (!attachments.length) { pubMsg.textContent = 'En Fandom · Edits solo se comparte material: adjunta una imagen, un video o un audio.'; pubMsg.hidden = false; return; }
    } else {
      if (!cuerpo && !attachments.length) { pubMsg.textContent = 'Escribe un mensaje o adjunta una imagen.'; pubMsg.hidden = false; return; }
    }
    pubBtn.disabled = true; pubMsg.hidden = true;
    log('publicando (' + currentCat() + ', ' + attachments.length + ' adjunto/s) …');
    try {
      const media = [];
      for (const a of attachments) {
        log('subiendo ' + a.t + ' …');
        const r = await subir(a.file);
        media.push({ t: a.t, url: r.url, path: r.path });
      }
      const texto = await empaquetarMenciones(cuerpo || '');
      const ins = await sb.from('publicaciones').insert({
        autor: user.id, categoria: cat, texto: texto, media: media
      }).select('id,created_at').single();
      if (ins.error) throw ins.error;
      await crearNotifs(texto, ins.data.id, null);
      log('publicación creada', 'ok');
      txt.value = ''; txt.style.height = 'auto'; mencionSel.clear();
      limpiarAdjuntos();

      // aparece AL INSTANTE (sin recargar el muro)
      const nuevo = {
        id: ins.data.id, categoria: cat, texto: texto, media: media, imagen_url: null,
        created_at: ins.data.created_at || new Date().toISOString(),
        autor: { id: perfil.id, alias: perfil.alias, alias_historial: perfil.alias_historial || [], avatar_url: perfil.avatar_url, es_admin: perfil.es_admin },
        pub_likes: [{ count: 0 }], comentarios: [{ count: 0 }]
      };
      if ((filterCat === 'todos' || filterCat === cat) && !feed.querySelector('.cmn-post[data-id="' + nuevo.id + '"]')) {
        await resolverMenciones([texto]);
        const vac = feed.querySelector('.cmn-empty'); if (vac) vac.remove();
        const soon = feed.querySelector('.cmn-soon'); if (soon) soon.remove();
        feed.insertAdjacentHTML('afterbegin', postHTML(nuevo));
      }
      try { ['todos', 'comunidad', 'fandom'].forEach((c) => { if (c !== filterCat) localStorage.removeItem('alz_feed_v3_' + c); }); } catch (_) {}
      snapFeed();
    } catch (e) {
      log('error publicando: ' + (e && e.message), 'err');
      pubMsg.textContent = errMsg(e); pubMsg.hidden = false;
    } finally { pubBtn.disabled = false; }
  });

  /* ---------- feed ---------- */
  const CATS = { comunidad: 'Comunidad', fandom: 'Fandom · Edits' };
  const DEV_BADGE = '<span class="cmn-dev" title="Desarrollador / admin" aria-label="admin">&#9881;&#65039;</span>';
  function aliasLine(p) {
    let s = '<strong>' + esc(p.alias || '???') + '</strong>';
    if (p && p.es_admin) s += DEV_BADGE;
    if (p.alias_historial && p.alias_historial.length) s += '<span class="cmn-alias-old" title="Alias anteriores">antes: ' + p.alias_historial.map(esc).join(', ') + '</span>';
    return s;
  }

  /* ============ MENCIONES (@alias) ============
     En el texto guardado, una mención se almacena como  @[uuid]  (referencia
     fija). Al mostrarla se resuelve al ALIAS ACTUAL de esa persona, así que si
     alguien cambia su alias, todas sus menciones se actualizan solas. */
  const MENCION_RE = /@\[([0-9a-fA-F-]{36})\]/g;
  const mencionAlias = new Map();   // uuid -> alias actual (para pintar)
  const mencionSel = new Map();     // aliasExacto -> uuid (elegidos en el autocompletar)
  const escRE = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  async function resolverMenciones(textos) {
    const ids = new Set();
    (textos || []).forEach((t) => {
      if (!t) return;
      let m; MENCION_RE.lastIndex = 0;
      while ((m = MENCION_RE.exec(t))) ids.add(m[1]);
    });
    if (!ids.size) return;
    const { data } = await sb.from('perfiles').select('id,alias').in('id', [...ids]);
    (data || []).forEach((p) => mencionAlias.set(p.id, p.alias));
  }
  function renderTexto(texto) {
    let out = esc(texto || '');
    out = out.replace(MENCION_RE, (m, id) => {
      const al = mencionAlias.get(id);
      if (!al) return '<span class="cmn-mention cmn-mention-off">@alguien</span>';
      return '<button type="button" class="cmn-mention cmn-av-btn" data-perfil="' + id + '" data-alias="' + esc(al) + '">@' + esc(al) + '</button>';
    });
    return out.replace(/\n/g, '<br>');
  }
  async function empaquetarMenciones(texto) {
    let t = texto || '';
    const pares = [...mencionSel.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [al, id] of pares) {
      t = t.replace(new RegExp('@' + escRE(al) + '(?![\\wÀ-ÿ.-])', 'giu'), '@[' + id + ']');
      mencionAlias.set(id, al);
    }
    // rescate: @palabra suelta (sin espacios) que coincida con un alias real
    const sueltas = [...new Set((t.match(/@([A-Za-z0-9À-ÿ._-]{2,30})(?![A-Za-z0-9À-ÿ._-])/g) || []).map((s) => s.slice(1)))];
    if (sueltas.length) {
      const { data } = await sb.from('perfiles').select('id,alias').in('alias', sueltas);
      (data || []).forEach((p) => {
        t = t.replace(new RegExp('@' + escRE(p.alias) + '(?![\\wÀ-ÿ.-])', 'giu'), '@[' + p.id + ']');
        mencionAlias.set(p.id, p.alias);
      });
    }
    return t;
  }

  /* crea las notificaciones para cada persona mencionada en el texto */
  async function crearNotifs(texto, pubId, comId) {
    if (!perfil) return;
    const ids = new Set();
    let m; MENCION_RE.lastIndex = 0;
    while ((m = MENCION_RE.exec(texto || ''))) { if (m[1] !== perfil.id) ids.add(m[1]); }
    if (!ids.size) return;
    const filas = [...ids].map((d) => ({
      destino: d, actor: perfil.id, tipo: 'mencion',
      publicacion: pubId || null, comentario: comId || null
    }));
    const { error } = await sb.from('notificaciones').insert(filas);
    if (error) log('crearNotifs: ' + error.message, 'warn');
  }

  /* si venimos de una notificación (#n=<pub>[.<comentario>]), ir hasta ahí */
  function irAMencion() {
    const mm = (location.hash || '').match(/#n=([0-9a-fA-F-]{36})(?:\.([0-9a-fA-F-]{36}))?/);
    if (!mm) return;
    const pub = mm[1], com = mm[2];
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
    const post = feed.querySelector('.cmn-post[data-id="' + pub + '"]');
    if (!post) return;
    post.scrollIntoView({ behavior: 'smooth', block: 'center' });
    post.classList.add('cmn-flash');
    setTimeout(() => post.classList.remove('cmn-flash'), 2400);
    if (com) {
      const btn = post.querySelector('[data-comments]');
      const box = post.querySelector('.cmn-comments');
      if (btn && box && box.hidden) btn.click();
      setTimeout(() => {
        const c = post.querySelector('[data-cid="' + com + '"]');
        if (c) {
          c.scrollIntoView({ behavior: 'smooth', block: 'center' });
          c.classList.add('cmn-flash');
          setTimeout(() => c.classList.remove('cmn-flash'), 2400);
        }
      }, 650);
    }
  }
  window.addEventListener('hashchange', irAMencion);

  /* autocompletar @alias en un textarea/input */
  function montarAutocompletar(inp) {
    if (!inp || inp.dataset.mnOn) return;
    inp.dataset.mnOn = '1';
    let pop = null, opts = [], hi = -1, tMr = null;

    function cerrar() { if (pop) { pop.remove(); pop = null; } opts = []; hi = -1; }
    function contexto() {
      const caret = inp.selectionStart || 0;
      const izq = (inp.value || '').slice(0, caret);
      const m = izq.match(/(^|[\s(])@([A-Za-z0-9À-ÿ._-]{1,30})$/);
      if (!m) return null;
      return { q: m[2], desde: caret - m[2].length - 1, hasta: caret };
    }
    async function buscar() {
      const c = contexto();
      if (!c) { cerrar(); return; }
      const pref = c.q.replace(/[%_]/g, '\\$&');
      const { data } = await sb.from('perfiles').select('id,alias,avatar_url').ilike('alias', pref + '%').order('alias').limit(6);
      opts = data || [];
      if (!opts.length) { cerrar(); return; }
      if (!pop) { pop = document.createElement('div'); pop.className = 'cmn-mnpop'; document.body.appendChild(pop); }
      const r = inp.getBoundingClientRect();
      pop.style.left = (window.scrollX + r.left) + 'px';
      pop.style.top = (window.scrollY + r.bottom + 4) + 'px';
      pop.style.width = Math.max(180, r.width) + 'px';
      hi = 0;
      pintar(c);
    }
    function pintar(c) {
      pop.innerHTML = opts.map((o, i) =>
        '<div class="cmn-mnpop-item' + (i === hi ? ' is-hi' : '') + '" data-i="' + i + '">' +
        '<span class="cmn-mnpop-av">' + (o.avatar_url && /^https?:/.test(o.avatar_url)
          ? '<img src="' + esc(o.avatar_url) + '" alt="">' : esc((o.alias || '?').charAt(0).toUpperCase())) + '</span>' +
        '<span>@' + esc(o.alias) + '</span></div>').join('');
      pop.querySelectorAll('.cmn-mnpop-item').forEach((el) => {
        el.addEventListener('mousedown', (ev) => { ev.preventDefault(); elegir(parseInt(el.dataset.i, 10), c); });
      });
    }
    function elegir(i, c) {
      const o = opts[i]; if (!o) return;
      const v = inp.value;
      const nuevo = v.slice(0, c.desde) + '@' + o.alias + ' ' + v.slice(c.hasta);
      inp.value = nuevo;
      const pos = c.desde + o.alias.length + 2;
      try { inp.setSelectionRange(pos, pos); } catch (_) {}
      mencionSel.set(o.alias, o.id);
      mencionAlias.set(o.id, o.alias);
      cerrar();
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.focus();
    }
    inp.addEventListener('input', () => { clearTimeout(tMr); tMr = setTimeout(buscar, 120); });
    inp.addEventListener('keydown', (e) => {
      if (!pop || !opts.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); hi = (hi + 1) % opts.length; pintar(contexto() || {}); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); hi = (hi - 1 + opts.length) % opts.length; pintar(contexto() || {}); }
      else if (e.key === 'Enter' || e.key === 'Tab') { const c = contexto(); if (c) { e.preventDefault(); elegir(hi, c); } }
      else if (e.key === 'Escape') { cerrar(); }
    });
    inp.addEventListener('blur', () => setTimeout(cerrar, 150));
  }
  function mediaHTML(media, imagenUrl) {
    let items = Array.isArray(media) ? media.filter((m) => m && m.url) : [];
    if (!items.length && imagenUrl) items = [{ t: 'img', url: imagenUrl }];
    if (!items.length) return '';
    const imgs = items.filter((m) => m.t === 'img');
    const vids = items.filter((m) => m.t === 'vid');
    const auds = items.filter((m) => m.t === 'aud');
    let html = '';
    if (imgs.length) {
      html += '<div class="cmn-gal g' + Math.min(imgs.length, 3) + '">' +
        imgs.map((m) => '<button type="button" class="cmn-gal-i" data-full="' + esc(m.url) + '"><img src="' + esc(m.url) + '" alt="" loading="lazy"></button>').join('') + '</div>';
    }
    vids.forEach((m) => { html += '<video class="cmn-post-vid" src="' + esc(m.url) + '" controls preload="metadata" playsinline></video>'; });
    auds.forEach((m) => { html += '<div class="cmn-aud"><audio class="cmn-post-aud" src="' + esc(m.url) + '" controls preload="none"></audio></div>'; });
    return html;
  }
  /* reacciones de estado (en vez de comentarios) */
  const REACCIONES = [
    { k: 'jaja',     e: '😂', t: 'jaja' },
    { k: 'sus',      e: '🤨', t: 'sus' },
    { k: 'aburrida', e: '🥱', t: 'me aburre' },
    { k: 'zzz',      e: '💤', t: 'zzz' }
  ];
  function reaccionBtns(id) {
    const mine = reaccionesMine.get(id) || new Set();
    const cnt = reaccionesCount.get(id) || {};
    return REACCIONES.map((r) =>
      '<button type="button" class="cmn-react' + (mine.has(r.k) ? ' is-on' : '') +
      '" data-react="' + id + '" data-tipo="' + r.k + '" title="' + r.t + '">' +
      r.e + '<span>' + (cnt[r.k] || 0) + '</span></button>').join('');
  }
  const ANON_SVG = '<svg class="cmn-av-anon-svg" viewBox="0 0 40 40" aria-hidden="true">' +
    '<circle cx="20" cy="15" r="7"></circle>' +
    '<path d="M7 35c1-8 6.5-12 13-12s12 4 13 12z"></path></svg>';
  function avatarInnerHTML(p) {
    const u = p && p.avatar_url;
    if (u && /^https?:\/\//.test(u)) return '<img src="' + esc(u) + '" alt="" class="cmn-av-img">';
    if (u === 'anon') return ANON_SVG;
    return esc(initial(p && p.alias));
  }
  function avatarHTML(p, cls) {
    const id = p && p.id ? ' data-perfil="' + esc(p.id) + '"' : '';
    const al = ' data-alias="' + esc((p && p.alias) || 'anonimos') + '"';
    return '<button type="button" class="cmn-avatar ' + (cls || 'sm') + ' cmn-av-btn"' + id + al + '>' + avatarInnerHTML(p) + '</button>';
  }
  function actionsHTML(id, nLikes, liked, nCom, ej, cat) {
    // las reacciones (jaja/sus/…) solo en Fandom · Edits; en Comunidad no cuadran
    const conReacciones = cat !== 'comunidad';
    return '<div class="cmn-post-actions">' +
      '<button type="button" class="cmn-like' + (liked ? ' is-liked' : '') + '" data-like="' + id +
      '" title="me encantó (se guarda en tu perfil)">&#9829; <span>' + nLikes + '</span></button>' +
      (ej ? '' : '<button type="button" class="cmn-cbtn" data-comments="' + id + '" title="Comentarios">&#128172; <span>' + (nCom || 0) + '</span></button>') +
      (conReacciones ? '<span class="cmn-react-wrap">' + reaccionBtns(id) + '</span>' : '') +
      '</div>';
  }
  function postHTML(row) {
    const p = row.autor || { alias: '???', alias_historial: [] };
    const liked = likesMine.has(row.id);
    const nLikes = (row.pub_likes && row.pub_likes[0] && row.pub_likes[0].count) || 0;
    const nCom = (row.comentarios && row.comentarios[0] && row.comentarios[0].count) || 0;
    const mio = perfil && p && p.id === perfil.id;
    return '<article class="cmn-post" data-id="' + row.id + '">' +
      '<header class="cmn-post-head">' + avatarHTML(p, 'sm') +
        '<div class="cmn-post-meta"><div class="cmn-post-alias">' + aliasLine(p) + '</div>' +
        '<div class="cmn-post-sub"><span class="cmn-cat cmn-cat-' + esc(row.categoria) + '">' + (CATS[row.categoria] || 'Comunidad') + '</span> · ' + timeAgo(row.created_at) + '</div></div>' +
        (mio ? '<button type="button" class="cmn-del" data-del="' + row.id + '" title="Eliminar mi publicación" aria-label="Eliminar">&#128465;</button>' : '') +
      '</header>' +
      (row.texto ? '<div class="cmn-post-text">' + renderTexto(row.texto) + '</div>' : '') +
      mediaHTML(row.media, row.imagen_url) +
      actionsHTML(row.id, nLikes, liked, nCom, false, row.categoria) +
      '<div class="cmn-comments" data-comments-for="' + row.id + '" hidden></div></article>';
  }

  /* publicaciones de ejemplo del canal (personaje "anonimos") — SOLO Fandom.
     No están en la base de datos: el corazón y las reacciones se guardan en
     este navegador (localStorage) para que se vean funcionales. */
  const EJEMPLOS = [
    { id: 'ej-1', texto: 'Edit del Expediente Nº 01 — el origen del Scartlanemia. Suban los suyos 👇', media: [{ t: 'img', url: 'assets/foto-scart.jpeg' }], fecha: '2026-08-20T15:00:00Z' },
    { id: 'ej-2', texto: 'Scartyaoi en 2D + el testimonio de campo de «GHOSTY».', media: [{ t: 'vid', url: 'assets/video1.mp4' }, { t: 'img', url: 'assets/psicopata scart.png' }, { t: 'aud', url: 'assets/testimonio-bigpapi.ogg' }], fecha: '2026-08-23T15:00:00Z' },
    { id: 'ej-3', texto: 'SCARTLAZARUS‑IMP, el impostor. Material sin clasificar del Expediente Nº 03.', media: [{ t: 'vid', url: 'assets/video2.mp4' }], fecha: '2026-08-26T15:00:00Z' },
    { id: 'ej-4', texto: 'SCARTLOQ mandó esto directo al canal seguro. Expediente Nº 04.', media: [{ t: 'vid', url: 'assets/mathew loco.mp4' }], fecha: '2026-08-29T15:00:00Z' },
    { id: 'ej-5', texto: 'Audio promocional interceptado de SCARTNOVIO. Fandom, hagan su magia.', media: [{ t: 'aud', url: 'assets/mathew put.ogg' }], fecha: '2026-08-31T15:00:00Z' }
  ];
  const esEjemplo = (id) => typeof id === 'string' && id.indexOf('ej-') === 0;
  function ejLikes()  { try { return JSON.parse(localStorage.getItem('alz_ej_like')  || '[]'); } catch (_) { return []; } }
  function ejReacts() { try { return JSON.parse(localStorage.getItem('alz_ej_react') || '{}'); } catch (_) { return {}; } }
  function setEjLikes(a)  { try { localStorage.setItem('alz_ej_like',  JSON.stringify(a)); } catch (_) {} }
  function setEjReacts(o) { try { localStorage.setItem('alz_ej_react', JSON.stringify(o)); } catch (_) {} }

  function ejemploHTML(ex) {
    const m = ex.media.map((x) => ({ t: x.t, url: encodeURI(x.url) }));
    const liked = likesMine.has(ex.id);
    return '<article class="cmn-post cmn-post-ej" data-id="' + ex.id + '">' +
      '<header class="cmn-post-head"><button type="button" class="cmn-avatar sm cmn-av-anon cmn-av-btn" data-alias="anonimos">A</button>' +
        '<div class="cmn-post-meta"><div class="cmn-post-alias"><strong>anonimos</strong>' +
          '<span class="cmn-ej-tag">ejemplo del canal</span></div>' +
        '<div class="cmn-post-sub"><span class="cmn-cat cmn-cat-fandom">Fandom · Edits</span> · ' + timeAgo(ex.fecha) + '</div></div></header>' +
      '<div class="cmn-post-text">' + renderTexto(ex.texto) + '</div>' +
      mediaHTML(m, null) +
      actionsHTML(ex.id, liked ? 1 : 0, liked, 0, true) + '</article>';
  }
  let ejemplosPuestos = false;
  // Los edits de ejemplo ("memes" del canal) se retiraron: Fandom · Edits
  // solo muestra lo que publica la gente.
  function htmlEjemplos() { return ''; }
  function ponerEjemplos() {
    if (ejemplosPuestos) return;
    const h = htmlEjemplos();
    ejemplosPuestos = true;
    if (h) feed.insertAdjacentHTML('beforeend', h);
  }

  /* ---- caché del muro: se pinta al instante al abrir y se refresca sin
     spinner; solo repinta si algo cambió de verdad ---- */
  function feedCacheKey() { return 'alz_feed_v3_' + filterCat; }
  function snapFeed() {
    if (filterCat === 'comunidad' && !feed.querySelector('.cmn-post') && !feed.querySelector('.cmn-empty')) return;
    try { localStorage.setItem(feedCacheKey(), feed.innerHTML); } catch (_) {}
  }
  // cualquier cambio en el muro (nueva pub, borrada, like, reacción…) guarda la caché
  let snapT = 0;
  try {
    new MutationObserver(() => {
      clearTimeout(snapT);
      snapT = setTimeout(snapFeed, 500);
    }).observe(feed, { childList: true, subtree: true, characterData: true, attributes: true });
  } catch (_) {}

  /* conteo de reacciones de las publicaciones reales visibles */
  async function cargarReacciones(ids) {
    if (!ids.length) return;
    ids.forEach((id) => reaccionesCount.set(id, {}));
    const { data, error } = await sb.from('pub_reacciones').select('pub,tipo,perfil').in('pub', ids);
    if (error) { log('cargarReacciones: ' + error.message, 'warn'); return; }
    (data || []).forEach((r) => {
      const c = reaccionesCount.get(r.pub) || {};
      c[r.tipo] = (c[r.tipo] || 0) + 1;
      reaccionesCount.set(r.pub, c);
      if (user && r.perfil === user.id) {
        if (!reaccionesMine.has(r.pub)) reaccionesMine.set(r.pub, new Set());
        reaccionesMine.get(r.pub).add(r.tipo);
      }
    });
  }

  feed.addEventListener('click', async (e) => {
    /* eliminar mi propia publicación */
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      if (!perfil) { openGate('login'); return; }
      const id = delBtn.getAttribute('data-del');
      if (!(await window.alzConfirm('¿Eliminar esta publicación? No se puede deshacer.', { aceptar: 'Eliminar', peligro: true }))) return;
      delBtn.disabled = true;
      const { error } = await sb.from('publicaciones').delete().eq('id', id).eq('autor', user.id);
      if (error) { delBtn.disabled = false; log('borrar error: ' + error.message, 'err'); await window.alzAlert(errMsg(error)); return; }
      log('publicación eliminada', 'ok');
      const art = delBtn.closest('.cmn-post');
      if (art) art.remove();
      likesMine.delete(id); reaccionesMine.delete(id); reaccionesCount.delete(id);
      return;
    }
    /* corazón "me encantó" → se guarda en el perfil (o en localStorage si es ejemplo) */
    const likeBtn = e.target.closest('[data-like]');
    if (likeBtn) {
      const id = likeBtn.getAttribute('data-like');
      const ej = esEjemplo(id);
      if (!ej && !perfil) { openGate('login'); return; }
      const span = likeBtn.querySelector('span');
      const n = parseInt(span.textContent, 10) || 0;
      const on = likesMine.has(id);
      if (on) { likesMine.delete(id); likeBtn.classList.remove('is-liked'); span.textContent = Math.max(0, n - 1); }
      else    { likesMine.add(id);   likeBtn.classList.add('is-liked');    span.textContent = n + 1; }
      if (ej)        { const a = ejLikes().filter((x) => x !== id); if (!on) a.push(id); setEjLikes(a); }
      else if (on)   { await sb.from('pub_likes').delete().eq('pub', id).eq('perfil', user.id); }
      else           { await sb.from('pub_likes').insert({ pub: id, perfil: user.id }); }
      return;
    }
    /* reacciones de estado (jaja / sus / me aburre / zzz) */
    const reactBtn = e.target.closest('[data-react]');
    if (reactBtn) {
      const id = reactBtn.getAttribute('data-react');
      const tipo = reactBtn.getAttribute('data-tipo');
      const ej = esEjemplo(id);
      if (!ej && !perfil) { openGate('login'); return; }
      const span = reactBtn.querySelector('span');
      const n = parseInt(span.textContent, 10) || 0;
      if (!reaccionesMine.has(id)) reaccionesMine.set(id, new Set());
      const set = reaccionesMine.get(id);
      const on = set.has(tipo);
      if (on) { set.delete(tipo); reactBtn.classList.remove('is-on'); span.textContent = Math.max(0, n - 1); }
      else    { set.add(tipo);    reactBtn.classList.add('is-on');    span.textContent = n + 1; }
      if (ej)        { const o = ejReacts(); o[id] = Array.from(set); setEjReacts(o); }
      else if (on)   { await sb.from('pub_reacciones').delete().eq('pub', id).eq('perfil', user.id).eq('tipo', tipo); }
      else           { await sb.from('pub_reacciones').insert({ pub: id, perfil: user.id, tipo: tipo }); }
      return;
    }
    /* abrir imagen en visor superpuesto */
    const galBtn = e.target.closest('[data-full]');
    if (galBtn) { abrirVisor(galBtn.getAttribute('data-full')); return; }
    /* abrir tarjeta de perfil */
    const avBtn = e.target.closest('.cmn-av-btn');
    if (avBtn) { abrirPerfilPop(avBtn, avBtn.getAttribute('data-perfil'), avBtn.getAttribute('data-alias')); return; }
    /* mostrar / ocultar comentarios */
    const cBtn = e.target.closest('[data-comments]');
    if (cBtn) {
      if (!perfil) { openGate('login'); return; }
      const id = cBtn.getAttribute('data-comments');
      const box = feed.querySelector('.cmn-comments[data-comments-for="' + id + '"]');
      if (!box) return;
      box.hidden = !box.hidden;
      if (!box.hidden && !box.dataset.loaded) { box.dataset.loaded = '1'; cargarComentarios(id, box); }
      return;
    }
  });

  feed.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-cform]');
    if (!form) return;
    e.preventDefault();
    if (!perfil) { openGate('login'); return; }
    const input = form.querySelector('input');
    const val = (input.value || '').trim();
    if (!val) return;
    input.disabled = true;
    const pubId = form.getAttribute('data-cform');
    const texto = await empaquetarMenciones(val);
    const cins = await sb.from('comentarios').insert({ publicacion_id: pubId, autor: user.id, texto: texto }).select('id').single();
    input.disabled = false; input.focus();
    if (cins.error) { log('comentar error: ' + cins.error.message, 'err'); await window.alzAlert(errMsg(cins.error)); return; }
    await crearNotifs(texto, pubId, cins.data.id);
    input.value = ''; mencionSel.clear();
    const box = feed.querySelector('.cmn-comments[data-comments-for="' + pubId + '"]');
    if (box) { box.dataset.loaded = ''; cargarComentarios(pubId, box); }
    const badge = feed.querySelector('[data-comments="' + pubId + '"] span');
    if (badge) badge.textContent = (parseInt(badge.textContent, 10) || 0) + 1;
  });

  async function cargarComentarios(pubId, box) {
    box.innerHTML = '<p class="cmn-c-load">Cargando…</p>';
    const { data, error } = await sb.from('comentarios')
      .select('id,texto,created_at,autor:perfiles!autor(id,alias,alias_historial,avatar_url,es_admin)')
      .eq('publicacion_id', pubId).order('created_at', { ascending: true });
    if (error) { box.innerHTML = '<p class="cmn-c-load">No se pudieron cargar.</p>'; return; }
    await resolverMenciones((data || []).map((c) => c.texto));
    const mio = (c) => perfil && c.autor && c.autor.id === perfil.id;
    const list = (data || []).map((c) => {
      const p = c.autor || { alias: '???' };
      return '<div class="cmn-c" data-cid="' + c.id + '">' + avatarHTML(p, 'xs') +
        '<div class="cmn-c-body"><div class="cmn-c-top">' +
          '<button type="button" class="cmn-c-alias cmn-av-btn"' + (p.id ? ' data-perfil="' + esc(p.id) + '"' : '') + ' data-alias="' + esc(p.alias) + '">' + esc(p.alias) + '</button>' +
          (p.es_admin ? DEV_BADGE : '') +
          '<span class="cmn-c-time">' + timeAgo(c.created_at) + '</span>' +
          (mio(c) ? '<button type="button" class="cmn-c-del" data-cdel="' + c.id + '" title="Eliminar">&#128465;</button>' : '') +
        '</div><div class="cmn-c-text">' + renderTexto(c.texto) + '</div></div></div>';
    }).join('');
    box.innerHTML =
      '<div class="cmn-c-list">' + (list || '<p class="cmn-c-load">Sé el primero en comentar.</p>') + '</div>' +
      '<form class="cmn-c-form" data-cform="' + pubId + '">' + avatarHTML(perfil, 'xs') +
        '<input type="text" maxlength="1000" placeholder="Comenta… escribe @ para mencionar" autocomplete="off" required>' +
        '<button type="submit" aria-label="Enviar">&#10148;</button></form>';
    const cin = box.querySelector('.cmn-c-form input');
    if (cin) montarAutocompletar(cin);
  }

  feed.addEventListener('click', async (e) => {
    const cdel = e.target.closest('[data-cdel]');
    if (!cdel) return;
    const cid = cdel.getAttribute('data-cdel');
    if (!(await window.alzConfirm('¿Eliminar tu comentario?', { aceptar: 'Eliminar', peligro: true }))) return;
    const { error } = await sb.from('comentarios').delete().eq('id', cid).eq('autor', user.id);
    if (error) { await window.alzAlert(errMsg(error)); return; }
    const row = cdel.closest('[data-cid]'); if (row) row.remove();
  });

  /* ================= VISOR DE IMÁGENES (lightbox) ================= */
  let visor = null;
  function abrirVisor(url) {
    if (!visor) {
      visor = document.createElement('div');
      visor.className = 'cmn-visor';
      visor.hidden = true;
      visor.innerHTML = '<img alt=""><button type="button" class="cmn-visor-x" aria-label="Cerrar">&times;</button>';
      document.body.appendChild(visor);
      visor.addEventListener('click', (e) => {
        if (e.target === visor || e.target.closest('.cmn-visor-x')) cerrarVisor();
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarVisor(); });
    }
    visor.querySelector('img').src = url;
    visor.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function cerrarVisor() {
    if (!visor || visor.hidden) return;
    visor.hidden = true;
    visor.querySelector('img').src = '';
    document.body.style.overflow = '';
  }

  /* foto de perfil en grande, recortada en círculo (fondo oscuro para salir) */
  function abrirFotoCirculo(url) {
    if (!url) return;
    cerrarPop();
    const ov = document.createElement('div');
    ov.className = 'cmn-fotocirc';
    ov.innerHTML = '<img src="' + esc(url) + '" alt="">';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    const salir = () => {
      ov.remove();
      document.removeEventListener('keydown', onK);
      document.body.style.overflow = '';
    };
    const onK = (e) => { if (e.key === 'Escape') salir(); };
    ov.addEventListener('click', (e) => { if (e.target === ov) salir(); }); // solo la parte oscura
    document.addEventListener('keydown', onK);
  }

  /* ================= TARJETA DE PERFIL + AMISTAD ================= */
  let pop = null;
  function cerrarPop() { if (pop) { pop.remove(); pop = null; document.removeEventListener('click', popFuera, true); } }
  function popFuera(e) { if (pop && !pop.contains(e.target) && !e.target.closest('.cmn-av-btn')) cerrarPop(); }
  async function estadoAmistad(otroId) {
    if (!perfil || !otroId || otroId === perfil.id) return { tipo: 'yo' };
    const { data } = await sb.from('amistades').select('id,solicitante,receptor,estado')
      .or('and(solicitante.eq.' + perfil.id + ',receptor.eq.' + otroId + '),and(solicitante.eq.' + otroId + ',receptor.eq.' + perfil.id + ')')
      .maybeSingle();
    if (!data) return { tipo: 'ninguna' };
    if (data.estado === 'aceptada') return { tipo: 'amigos', id: data.id };
    if (data.solicitante === perfil.id) return { tipo: 'enviada', id: data.id };
    return { tipo: 'recibida', id: data.id };
  }
  async function abrirPerfilPop(anchor, perfilId, alias) {
    cerrarPop();
    pop = document.createElement('div');
    pop.className = 'cmn-pop';
    pop.innerHTML = '<div class="cmn-pop-load">Cargando…</div>';
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const W = 234;
    let left = window.scrollX + r.right + 10;
    if (r.right + 10 + W > window.innerWidth) left = window.scrollX + r.left - W - 10;
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    let top = window.scrollY + r.top;
    const maxTop = window.scrollY + window.innerHeight - 190;
    if (top > maxTop) top = maxTop;
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
    setTimeout(() => document.addEventListener('click', popFuera, true), 0);

    let datos = { alias: alias || 'anonimos', alias_historial: [] };
    if (perfilId) {
      const { data } = await sb.from('perfiles').select('id,alias,alias_historial,avatar_url,es_admin').eq('id', perfilId).maybeSingle();
      if (data) datos = data;
    }
    if (!pop) return;
    const hist = (datos.alias_historial && datos.alias_historial.length)
      ? '<div class="cmn-pop-hist">Antes: ' + datos.alias_historial.map(esc).join(', ') + '</div>' : '';
    let accion = '';
    if (!perfilId || alias === 'anonimos') {
      accion = '<p class="cmn-pop-note">Perfil de ejemplo del canal.</p>';
    } else if (perfil && perfilId === perfil.id) {
      accion = '<p class="cmn-pop-note">Este eres tú.</p>';
    } else if (perfil) {
      const est = await estadoAmistad(perfilId);
      if (!pop) return;
      if (est.tipo === 'amigos')   accion = '<button type="button" class="cmn-pop-btn is-chat" data-dm="' + esc(perfilId) + '">Abrir chat</button>';
      else if (est.tipo === 'enviada')  accion = '<button type="button" class="cmn-pop-btn" disabled>Solicitud enviada</button>';
      else if (est.tipo === 'recibida') accion = '<button type="button" class="cmn-pop-btn is-ok" data-acc="' + esc(est.id) + '">Aceptar solicitud</button>';
      else accion = '<button type="button" class="cmn-pop-btn" data-add="' + esc(perfilId) + '">Enviar solicitud</button>';
    } else {
      accion = '<button type="button" class="cmn-pop-btn" data-login="1">Inicia sesión para agregar</button>';
    }
    const fotoReal = datos.avatar_url && /^https?:\/\//.test(datos.avatar_url) ? datos.avatar_url : '';
    const avBig = fotoReal
      ? '<button type="button" class="cmn-avatar lg cmn-pop-foto" data-foto="' + esc(fotoReal) + '" title="Ver foto">' + avatarInnerHTML(datos) + '</button>'
      : '<span class="cmn-avatar lg">' + avatarInnerHTML(datos) + '</span>';
    pop.innerHTML =
      '<div class="cmn-pop-head">' + avBig +
        '<div><div class="cmn-pop-alias">' + esc(datos.alias) + (datos.es_admin ? ' ' + DEV_BADGE : '') + '</div>' + hist + '</div></div>' +
      accion;
    pop.addEventListener('click', async (e) => {
      const foto = e.target.closest('[data-foto]');
      if (foto) { abrirFotoCirculo(foto.getAttribute('data-foto')); return; }
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.login) { cerrarPop(); openGate('login'); return; }
      if (b.dataset.add) {
        b.disabled = true; b.textContent = 'Enviando…';
        const { error } = await sb.from('amistades').insert({ solicitante: perfil.id, receptor: b.dataset.add });
        b.textContent = error ? 'Error, reintenta' : 'Solicitud enviada';
        if (!error) b.classList.add('is-done');
        return;
      }
      if (b.dataset.acc) {
        b.disabled = true; b.textContent = 'Aceptando…';
        const { error } = await sb.from('amistades').update({ estado: 'aceptada' }).eq('id', b.dataset.acc);
        b.textContent = error ? 'Error, reintenta' : '¡Ahora son amigos!';
        if (!error) { b.classList.add('is-done'); refrescarAmigos(); }
        return;
      }
      if (b.dataset.dm) { cerrarPop(); await abrirDM(b.dataset.dm); return; }
    });
  }

  /* ================= DOCK DE CHAT (abajo a la derecha) ================= */
  let dock, dockBody, dockTab = 'amigos', salaAbierta = null, canalSala = null, canalPresencia = null;
  const online = new Set();

  function initSocial() {
    if (dock || !perfil) return;
    dock = document.createElement('div');
    dock.className = 'alz-dock is-min';
    dock.innerHTML =
      '<button type="button" class="alz-dock-toggle">💬 <span>Chat</span><b class="alz-dock-badge" hidden>0</b></button>' +
      '<div class="alz-dock-panel">' +
        '<div class="alz-dock-tabs">' +
          '<button type="button" data-tab="amigos" class="is-on">Amigos</button>' +
          '<button type="button" data-tab="chats">Chats</button>' +
        '</div>' +
        '<div class="alz-dock-body"></div>' +
      '</div>';
    document.body.appendChild(dock);
    dockBody = dock.querySelector('.alz-dock-body');
    dock.querySelector('.alz-dock-toggle').addEventListener('click', () => {
      dock.classList.toggle('is-min');
      if (!dock.classList.contains('is-min')) { salaAbierta = null; pintarDock(); }
    });
    dock.querySelectorAll('[data-tab]').forEach((t) => t.addEventListener('click', () => {
      dockTab = t.getAttribute('data-tab');
      dock.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('is-on', x === t));
      salaAbierta = null; pintarDock();
    }));
    dock.addEventListener('click', onDockClick);
    dock.addEventListener('submit', onDockSubmit);

    presenciaConectar();
    refrescarAmigos();
    suscribirMensajes();
  }

  function presenciaConectar() {
    canalPresencia = sb.channel('alz-presencia', { config: { presence: { key: perfil.id } } });
    canalPresencia.on('presence', { event: 'sync' }, () => {
      online.clear();
      const st = canalPresencia.presenceState();
      Object.keys(st).forEach((k) => online.add(k));
      if (dockTab === 'amigos' && !salaAbierta) pintarDock();
    });
    canalPresencia.subscribe((status) => {
      if (status === 'SUBSCRIBED') canalPresencia.track({ alias: perfil.alias, at: Date.now() });
    });
  }

  let amigos = [], solicitudes = [];
  async function refrescarAmigos() {
    const a = await sb.rpc('mis_amigos');
    amigos = (a.data || []).map((x) => ({ id: x.id, alias: x.alias }));
    const s = await sb.from('amistades').select('id,solicitante,de:perfiles!solicitante(alias)')
      .eq('receptor', perfil.id).eq('estado', 'pendiente');
    solicitudes = (s.data || []).map((x) => ({ id: x.id, alias: (x.de && x.de.alias) || '???', de: x.solicitante }));
    if (dock && !dock.classList.contains('is-min') && dockTab === 'amigos' && !salaAbierta) pintarDock();
  }

  async function pintarDock() {
    if (!dockBody) return;
    if (salaAbierta) { pintarSala(); return; }
    if (canalSala) { try { sb.removeChannel(canalSala); } catch (_) {} canalSala = null; }
    dockBody.classList.remove('en-sala');
    if (dockTab === 'amigos') {
      let h = '';
      if (solicitudes.length) {
        h += '<div class="alz-sec">Solicitudes</div>';
        h += solicitudes.map((s) =>
          '<div class="alz-row"><span class="alz-av">' + esc(initial(s.alias)) + '</span>' +
          '<span class="alz-name">' + esc(s.alias) + '</span>' +
          '<button type="button" class="alz-mini is-ok" data-acc="' + s.id + '">Aceptar</button>' +
          '<button type="button" class="alz-mini" data-rej="' + s.id + '">✕</button></div>').join('');
      }
      h += '<div class="alz-sec">Amigos</div>';
      if (!amigos.length) {
        h += '<div class="alz-empty">Todavía no tienes amigos.<br>Toca la foto de alguien en el muro y envía una solicitud.</div>';
      } else {
        h += amigos.map((f) => {
          const on = online.has(f.id);
          return '<div class="alz-row alz-friend ' + (on ? 'is-on' : 'is-off') + '" data-dm="' + f.id + '">' +
            '<span class="alz-av">' + esc(initial(f.alias)) + '<i class="alz-dot"></i></span>' +
            '<span class="alz-name">' + esc(f.alias) + '</span>' +
            '<span class="alz-state">' + (on ? 'en línea' : 'ausente') + '</span></div>';
        }).join('');
      }
      dockBody.innerHTML = h;
    } else {
      const r = await sb.rpc('mis_salas');
      const salas = r.data || [];
      let h = '<button type="button" class="alz-newgrp" data-newgrp="1">＋ Crear grupo</button>';
      if (!salas.length) h += '<div class="alz-empty">Sin chats todavía. Abre uno desde tu lista de amigos.</div>';
      h += salas.map((s) => {
        const nom = s.tipo === 'grupo' ? (s.nombre || 'Grupo') : (s.otro_alias || '???');
        return '<div class="alz-row alz-chat" data-sala="' + s.id + '" data-tipo="' + s.tipo + '" data-nom="' + esc(nom) + '" data-creador="' + esc(s.creador || '') + '">' +
          '<span class="alz-av">' + (s.tipo === 'grupo' ? '#' : esc(initial(s.otro_alias))) + '</span>' +
          '<span class="alz-name">' + esc(nom) + '</span>' +
          '<span class="alz-last">' + esc((s.ultimo || '').slice(0, 24)) + '</span></div>';
      }).join('');
      dockBody.innerHTML = h;
    }
  }

  function soyCreadorDeLaSala() {
    return !!(salaAbierta && salaAbierta.tipo === 'grupo' && perfil && salaAbierta.creador && salaAbierta.creador === perfil.id);
  }
  async function pintarSala() {
    dockBody.classList.add('en-sala');
    dockBody.innerHTML = '<div class="alz-chat-head"><button type="button" class="alz-back" data-back="1">‹</button>' +
      '<strong>' + esc(salaAbierta.nom) + '</strong>' +
      (salaAbierta.tipo === 'grupo' ? '<button type="button" class="alz-inv" data-inv="1">Invitar</button>' : '') +
      (soyCreadorDeLaSala() ? '<button type="button" class="alz-del" data-delgrupo="1" title="Eliminar grupo">&#128465;</button>' : '') +
      '</div><div class="alz-msgs" id="alz-msgs"><p class="cmn-c-load">Cargando…</p></div>' +
      '<form class="alz-send" data-send="1"><input type="text" maxlength="4000" placeholder="Mensaje…" autocomplete="off" required><button type="submit">➤</button></form>';
    const cont = dockBody.querySelector('#alz-msgs');
    const { data, error } = await sb.from('mensajes')
      .select('id,texto,creado,autor:perfiles!autor(id,alias)')
      .eq('sala', salaAbierta.id).order('creado', { ascending: true }).limit(200);
    if (error) { cont.innerHTML = '<p class="cmn-c-load">' + esc(errMsg(error)) + '</p>'; return; }
    cont.innerHTML = (data || []).map(msgHTML).join('') || '<p class="cmn-c-load">Escribe el primer mensaje.</p>';
    cont.scrollTop = cont.scrollHeight;
    escucharSala(salaAbierta.id);
  }
  function msgHTML(m) {
    const mine = perfil && m.autor && m.autor.id === perfil.id;
    return '<div class="alz-msg ' + (mine ? 'mine' : '') + '">' +
      (mine ? '' : '<span class="alz-msg-who">' + esc(m.autor ? m.autor.alias : '???') + '</span>') +
      '<span class="alz-msg-txt">' + esc(m.texto).replace(/\n/g, '<br>') + '</span>' +
      '<span class="alz-msg-t">' + timeAgo(m.creado) + '</span></div>';
  }
  function escucharSala(salaId) {
    if (canalSala) { sb.removeChannel(canalSala); canalSala = null; }
    canalSala = sb.channel('sala-' + salaId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes', filter: 'sala=eq.' + salaId }, async (payload) => {
        const cont = dockBody && dockBody.querySelector('#alz-msgs');
        if (!cont) return;
        const m = payload.new;
        let alias = '???';
        if (perfil && m.autor === perfil.id) alias = perfil.alias;
        else { const p = await sb.from('perfiles').select('alias').eq('id', m.autor).maybeSingle(); alias = (p.data && p.data.alias) || '???'; }
        cont.insertAdjacentHTML('beforeend', msgHTML({ texto: m.texto, creado: m.creado, autor: { id: m.autor, alias: alias } }));
        cont.scrollTop = cont.scrollHeight;
      })
      .subscribe();
  }

  /* mensajes entrantes cuando el chat de esa sala no está abierto → badge */
  let noLeidos = 0;
  function suscribirMensajes() {
    sb.channel('alz-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, (payload) => {
        const m = payload.new;
        if (perfil && m.autor === perfil.id) return;
        if (salaAbierta && m.sala === salaAbierta.id) return;
        noLeidos++;
        const b = dock && dock.querySelector('.alz-dock-badge');
        if (b) { b.hidden = false; b.textContent = noLeidos > 9 ? '9+' : String(noLeidos); }
        if (dock && !dock.classList.contains('is-min') && dockTab === 'chats' && !salaAbierta) pintarDock();
      })
      .subscribe();
  }

  async function abrirDM(otroId) {
    if (!dock) initSocial();
    dock.classList.remove('is-min');
    const { data, error } = await sb.rpc('abrir_dm', { p_otro: otroId });
    if (error) { await window.alzAlert(errMsg(error)); return; }
    const amigo = amigos.find((a) => a.id === otroId);
    salaAbierta = { id: data, tipo: 'dm', nom: (amigo ? amigo.alias : '') };
    if (!amigo) {
      const p = await sb.from('perfiles').select('alias').eq('id', otroId).maybeSingle();
      salaAbierta.nom = (p.data && p.data.alias) || '???';
    }
    pintarSala();
  }

  /* lista de amigos para invitar a un grupo (reemplaza el prompt de "escribe el número") */
  async function abrirInvitar() {
    if (!salaAbierta) return;
    if (!amigos.length) {
      await window.alzAlert('Todavía no tienes amigos agregados. Toca la foto de alguien en el muro y envíale una solicitud primero.');
      return;
    }
    const ov = document.createElement('div');
    ov.className = 'alz-ask';
    ov.innerHTML = '<div class="alz-ask-card">' +
      '<p class="alz-ask-msg">Invitar a «' + esc(salaAbierta.nom) + '»</p>' +
      '<div class="alz-invite-list">' + amigos.map((a, i) =>
        '<button type="button" class="alz-row alz-invite-row" data-idx="' + i + '">' +
          '<span class="alz-av">' + esc(initial(a.alias)) + '</span>' +
          '<span class="alz-name">' + esc(a.alias) + '</span></button>'
      ).join('') + '</div>' +
      '<div class="alz-ask-btns"><button type="button" class="alz-ask-no">Cerrar</button></div></div>';
    document.body.appendChild(ov);
    const cerrar = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') cerrar(); };
    ov.querySelector('.alz-ask-no').addEventListener('click', cerrar);
    ov.addEventListener('click', (e) => { if (e.target === ov) cerrar(); });
    document.addEventListener('keydown', onKey);
    ov.querySelector('.alz-invite-list').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-idx]');
      if (!b || b.disabled) return;
      const a = amigos[parseInt(b.getAttribute('data-idx'), 10)];
      if (!a) return;
      b.disabled = true;
      const { error } = await sb.rpc('invitar_grupo', { p_sala: salaAbierta.id, p_perfil: a.id });
      cerrar();
      await window.alzAlert(error ? errMsg(error) : ('Invitaste a ' + a.alias + ' al grupo.'));
    });
  }

  async function onDockClick(e) {
    const b = e.target.closest('button, .alz-row');
    if (!b) return;
    if (b.dataset.back != null) { salaAbierta = null; if (canalSala) { sb.removeChannel(canalSala); canalSala = null; } pintarDock(); return; }
    if (b.dataset.acc) {
      await sb.from('amistades').update({ estado: 'aceptada' }).eq('id', b.dataset.acc);
      await refrescarAmigos(); return;
    }
    if (b.dataset.rej) {
      await sb.from('amistades').delete().eq('id', b.dataset.rej);
      await refrescarAmigos(); return;
    }
    if (b.dataset.newgrp != null) {
      const nom = await window.alzPrompt('Nombre del grupo:', { aceptar: 'Crear', placeholder: 'Ej. ALZ · edits' });
      if (!nom) return;
      const { data, error } = await sb.rpc('crear_grupo', { p_nombre: nom });
      if (error) { await window.alzAlert(errMsg(error)); return; }
      salaAbierta = { id: data, tipo: 'grupo', nom: nom, creador: perfil.id };
      pintarSala(); return;
    }
    if (b.dataset.inv != null && salaAbierta) { abrirInvitar(); return; }
    if (b.dataset.delgrupo != null && salaAbierta && soyCreadorDeLaSala()) {
      const ok = await window.alzConfirm(
        'Vas a eliminar el grupo «' + salaAbierta.nom + '» para todos sus miembros. Los mensajes se borran y esto no se puede deshacer.',
        { aceptar: 'Eliminar grupo', peligro: true, escribir: salaAbierta.nom }
      );
      if (!ok) return;
      const { error } = await sb.from('salas').delete().eq('id', salaAbierta.id);
      if (error) { await window.alzAlert(errMsg(error)); return; }
      const nom = salaAbierta.nom;
      salaAbierta = null;
      if (canalSala) { try { sb.removeChannel(canalSala); } catch (_) {} canalSala = null; }
      await pintarDock();
      await window.alzAlert('Se eliminó el grupo «' + nom + '».');
      return;
    }
    const chat = b.closest('.alz-chat') || (b.classList && b.classList.contains('alz-chat') ? b : null);
    if (chat) { salaAbierta = { id: chat.dataset.sala, tipo: chat.dataset.tipo, nom: chat.dataset.nom, creador: chat.dataset.creador || null }; pintarSala(); return; }
    const fr = b.closest('.alz-friend') || (b.classList && b.classList.contains('alz-friend') ? b : null);
    if (fr && fr.dataset.dm) { abrirDM(fr.dataset.dm); return; }
  }
  async function onDockSubmit(e) {
    const f = e.target.closest('[data-send]');
    if (!f || !salaAbierta) return;
    e.preventDefault();
    const input = f.querySelector('input');
    const val = (input.value || '').trim();
    if (!val) return;
    input.value = '';
    const { error } = await sb.from('mensajes').insert({ sala: salaAbierta.id, autor: user.id, texto: val });
    if (error) { await window.alzAlert(errMsg(error)); input.value = val; }
  }

  /* realtime de solicitudes de amistad entrantes */
  function suscribirAmistades() {
    sb.channel('alz-amis')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'amistades', filter: 'receptor=eq.' + perfil.id }, () => refrescarAmigos())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'amistades', filter: 'solicitante=eq.' + perfil.id }, () => refrescarAmigos())
      .subscribe();
  }

  /* realtime del muro: publicaciones y comentarios nuevos aparecen solos */
  let muroCanal = null;
  function suscribirMuro() {
    if (muroCanal) return;
    muroCanal = sb.channel('alz-muro')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'publicaciones' }, async (payload) => {
        const row = payload.new;
        if (user && row.autor === user.id) return;                       // ya lo veo (yo lo publiqué)
        if (filterCat !== 'todos' && row.categoria !== filterCat) return;
        if (feed.querySelector('.cmn-post[data-id="' + row.id + '"]')) return;
        const { data } = await sb.from('publicaciones')
          .select('id,categoria,texto,media,imagen_url,created_at,autor:perfiles!autor(id,alias,alias_historial,avatar_url,es_admin),pub_likes(count),comentarios(count)')
          .eq('id', row.id).maybeSingle();
        if (!data) return;
        await cargarReacciones([data.id]);
        await resolverMenciones([data.texto]);
        const vac = feed.querySelector('.cmn-empty'); if (vac) vac.remove();
        feed.insertAdjacentHTML('afterbegin', postHTML(data));
        log('llegó publicación de otra persona', 'ok');
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'publicaciones' }, (payload) => {
        const el = feed.querySelector('.cmn-post[data-id="' + (payload.old && payload.old.id) + '"]');
        if (el) el.remove();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comentarios' }, (payload) => {
        const c = payload.new;
        if (user && c.autor === user.id) return;                         // el mío ya lo pinté al enviarlo
        const badge = feed.querySelector('[data-comments="' + c.publicacion_id + '"] span');
        if (badge) badge.textContent = (parseInt(badge.textContent, 10) || 0) + 1;
        const box = feed.querySelector('.cmn-comments[data-comments-for="' + c.publicacion_id + '"]');
        if (box && box.dataset.loaded && !box.hidden) cargarComentarios(c.publicacion_id, box);
      })
      .subscribe();
  }

  let feedGen = 0;
  async function loadFeed(reset) {
    if (!sb) return;
    if (reset) { feedGen++; offset = 0; done = false; ejemplosPuestos = false; loading = false; }
    else if (loading || done) return;

    const gen = feedGen;          // esta carga pertenece a esta "generación"
    const cat = filterCat;        // y a este filtro; si cambian, se descarta
    const key = 'alz_feed_v3_' + cat;
    const primera = reset && offset === 0;
    const vigente = () => gen === feedGen && cat === filterCat;

    // 1) pinta YA lo guardado de la última visita (sin spinner)
    let cacheHtml = null;
    if (primera) {
      try { cacheHtml = localStorage.getItem(key); } catch (_) {}
      if (cacheHtml != null) feed.innerHTML = cacheHtml;
      else feed.innerHTML = '<p class="cmn-empty">Cargando muro…</p>';
    }

    // 2) refresca en segundo plano
    loading = true;
    if (moreBtn) moreBtn.disabled = true;
    let q = sb.from('publicaciones')
      .select('id,categoria,texto,media,imagen_url,created_at,autor:perfiles!autor(id,alias,alias_historial,avatar_url,es_admin),pub_likes(count),comentarios(count)')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (cat !== 'todos') q = q.eq('categoria', cat);
    const { data, error } = await q;

    if (!vigente()) { return; }   // cambiaste de filtro mientras cargaba → NO pintes nada

    loading = false;
    if (moreBtn) moreBtn.disabled = false;

    if (error) {
      log('loadFeed error: ' + error.message, 'err');
      if (cacheHtml == null && !feed.querySelector('.cmn-post')) {
        feed.innerHTML = '<p class="cmn-empty">No se pudo cargar el muro.<br><small>' + esc(errMsg(error)) + '</small></p>';
      }
      return;   // si había caché, se queda
    }

    const rows = data || [];
    if (rows.length) {
      await cargarReacciones(rows.map((r) => r.id));
      if (!vigente()) return;
      await resolverMenciones(rows.map((r) => r.texto));
      if (!vigente()) return;
    }

    if (primera) {
      const hayMas = rows.length >= PAGE;
      let html = rows.map(postHTML).join('');
      if (!hayMas) html += htmlEjemplos(cat);
      if (!html) {
        html = cat === 'comunidad'
          ? '<p class="cmn-empty">Todavía no hay nada en Comunidad. ¡Escribe algo y rompe el hielo!</p>'
          : '<p class="cmn-empty">Todavía no hay publicaciones. ¡Sé el primero!</p>';
      }
      // solo repinta si de verdad cambió algo respecto a lo cacheado → cero parpadeo
      if (html !== cacheHtml) feed.innerHTML = html;
      try { localStorage.setItem(key, html); } catch (_) {}
      offset = rows.length;
      done = !hayMas;
      ejemplosPuestos = true;
      if (moreBtn) moreBtn.hidden = !hayMas;
      return;
    }

    // "Cargar más" (paginación) → añade al final
    if (rows.length) feed.insertAdjacentHTML('beforeend', rows.map(postHTML).join(''));
    offset += rows.length;
    if (rows.length < PAGE) {
      done = true;
      if (moreBtn) moreBtn.hidden = true;
      ponerEjemplos();
    } else if (moreBtn) moreBtn.hidden = false;
    snapFeed();
  }
  if (moreBtn) moreBtn.addEventListener('click', () => loadFeed(false));
  filters.forEach((f) => f.addEventListener('click', () => {
    filters.forEach((x) => x.classList.remove('active'));
    f.classList.add('active');
    filterCat = f.getAttribute('data-cat-filter');
    if (composer) composer.hidden = !perfil;
    sincronizarComposer();
    loadFeed(true);
  }));

  /* ---------- panel "Me gustan" (contenido que marcaste con el corazón) ---------- */
  let likesModal = null;
  function ensureLikesModal() {
    if (likesModal) return likesModal;
    likesModal = document.createElement('div');
    likesModal.className = 'cmn-likes';
    likesModal.hidden = true;
    likesModal.innerHTML =
      '<div class="cmn-likes-card">' +
        '<div class="cmn-likes-head"><strong>&#9829; Me gustan</strong>' +
        '<button type="button" class="cmn-likes-x" aria-label="Cerrar">&times;</button></div>' +
        '<div class="cmn-likes-body"></div>' +
      '</div>';
    document.body.appendChild(likesModal);
    likesModal.addEventListener('click', (e) => {
      if (e.target === likesModal || e.target.closest('.cmn-likes-x')) likesModal.hidden = true;
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && likesModal && !likesModal.hidden) likesModal.hidden = true; });
    return likesModal;
  }
  function miniCard(o) {
    const thumb = o.thumb
      ? '<span class="cmn-lk-th"><img src="' + esc(o.thumb) + '" alt=""></span>'
      : '<span class="cmn-lk-th cmn-lk-th-txt">' + (o.icon || '&#9829;') + '</span>';
    return '<div class="cmn-lk-item">' + thumb +
      '<div class="cmn-lk-info"><div class="cmn-lk-who">' + esc(o.alias) + (o.ej ? ' · <em>ejemplo</em>' : '') + '</div>' +
      '<div class="cmn-lk-txt">' + esc(o.texto || '(sin texto)') + '</div></div></div>';
  }
  async function abrirMeGustan() {
    const box = ensureLikesModal();
    const body = box.querySelector('.cmn-likes-body');
    box.hidden = false;
    body.innerHTML = '<p class="cmn-empty">Cargando…</p>';
    const items = [];
    if (perfil) {
      const { data, error } = await sb.from('pub_likes')
        .select('pub,publicaciones(texto,media,imagen_url,autor:perfiles!autor(alias))')
        .eq('perfil', user.id);
      if (error) log('abrirMeGustan: ' + error.message, 'warn');
      (data || []).forEach((r) => {
        const p = r.publicaciones; if (!p) return;
        const media = Array.isArray(p.media) ? p.media : [];
        const img = (media.find((m) => m && m.t === 'img') || {}).url || p.imagen_url || null;
        items.push({ alias: (p.autor && p.autor.alias) || '???', texto: p.texto, thumb: img });
      });
    }
    body.innerHTML = items.length
      ? items.map(miniCard).join('')
      : '<p class="cmn-empty">Todavía no marcaste nada con &#9829;.<br>Dale al corazón en un edit y se guarda aquí.</p>';
  }

  /* ---------- arranque ---------- */
  async function boot() {
    buildChip();
    log('iniciando comunidad…');

    if (!sb) {
      feed.innerHTML = '<p class="cmn-empty">La comunidad no está conectada: faltan SUPABASE_URL / SUPABASE_ANON_KEY en config.js.</p>';
      log('SIN cliente Supabase (config.js incompleto)', 'err');
      return;
    }

    // ¿el enlace de recuperación trajo error en el hash?
    const h = location.hash || '';
    if (/error=|error_description=/.test(h)) {
      const p = new URLSearchParams(h.replace(/^#/, ''));
      log('el enlace de recuperación devolvió error: ' + (p.get('error_description') || p.get('error')), 'err');
    }

    sb.auth.onAuthStateChange((event, session) => {
      log('auth event: ' + event);
      if (event === 'PASSWORD_RECOVERY') {
        user = session && session.user ? session.user : user;
        openGate('nueva-clave');
      }
    });

    await probarConexion();

    const { data } = await sb.auth.getSession();
    if (data && data.session && data.session.user) {
      user = data.session.user;
      log('ya había sesión de ' + (user.email || user.id.slice(0, 8)));
      await cargarPerfil();
    } else {
      log('no hay sesión activa → hay que iniciar sesión');
    }

    renderChip();
    render();
    if (perfil) { log('todo listo, cargando muro'); arrancarSocial(); await loadFeed(true); irAMencion(); }
  }
  boot();
})();
