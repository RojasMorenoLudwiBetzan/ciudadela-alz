/* =====================================================================
   MÚSICA DE FONDO — La Ciudadela de ALZ
   - Suena en toda la web y NUNCA se detiene: musica 1 → 2 → 3 → 4 → 1 …
   - La posición se calcula por TIEMPO REAL (no se guarda "el segundo"),
     así que al cambiar de página la canción avanza como si nunca hubiera
     parado — nunca retrocede ni se queda en bucle.
   - El interruptor SOLO silencia/activa el sonido; la música sigue
     avanzando aunque la silencies.
   - Verde = suena. Gris = silenciada.
===================================================================== */
(function () {
  const KEY = 'alz_music_v2';
  const LISTA = [
    'musicas fondo web/musica 1.mp3',
    'musicas fondo web/musica 2.mp3',
    'musicas fondo web/musica 3.mp3',
    'musicas fondo web/musica 4.mp3'
  ];
  const VOL = 0.30;

  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('sw-musica.js').catch(() => {}); } catch (_) {}
  }

  function leer()   { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } }
  function guardar() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) {} }

  const st = leer();
  if (typeof st.on !== 'boolean') st.on = true;
  if (typeof st.i !== 'number' || st.i < 0 || st.i >= LISTA.length) st.i = 0;
  // "ancla" = instante (ms) en el que la pista i estaría en el segundo 0
  if (typeof st.ancla !== 'number' || !isFinite(st.ancla)) st.ancla = Date.now();

  const audio = new Audio();
  audio.loop = false;
  audio.preload = 'auto';
  audio.volume = VOL;

  let gesto = false;
  let gestoArmado = false;

  function pintar() {
    const son = !audio.muted && st.on;
    if (box) box.classList.toggle('is-on', son);
    if (sw) sw.setAttribute('aria-checked', String(son));
  }
  // mantiene el ancla al día: cuánto haría que empezó la pista actual
  function anclar() {
    st.ancla = Date.now() - (audio.currentTime || 0) * 1000;
    guardar();
  }

  function armarGesto() {
    if (gestoArmado) return;
    gestoArmado = true;
    const k = (e) => {
      if (e && e.target && e.target.closest && e.target.closest('.alz-music')) return;
      document.removeEventListener('pointerdown', k);
      document.removeEventListener('keydown', k);
      gestoArmado = false;
      gesto = true;
      audio.muted = !st.on;
      lanzar();
      pintar();
    };
    document.addEventListener('pointerdown', k, { passive: true });
    document.addEventListener('keydown', k);
  }

  function lanzar() {
    const conSonido = !audio.muted;
    const p = audio.play();
    if (p && p.then) {
      p.then(() => { if (conSonido) gesto = true; pintar(); }).catch(() => {
        if (!audio.muted) { audio.muted = true; audio.play().catch(() => {}); }
        armarGesto();
        pintar();
      });
    }
  }

  function cargar(idx) {
    st.i = ((idx % LISTA.length) + LISTA.length) % LISTA.length;
    // dónde iría la canción AHORA según el tiempo real transcurrido
    let elapsed = (Date.now() - st.ancla) / 1000;
    if (!isFinite(elapsed) || elapsed < 0) { elapsed = 0; st.ancla = Date.now(); }
    const s = elapsed > 1 ? Math.floor(elapsed) : 0;
    audio.src = encodeURI(LISTA[st.i]) + (s ? '#t=' + s : '');
    audio.load();
    const onMeta = () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      const dur = audio.duration || 0;
      if (dur && elapsed >= dur - 0.5) {
        // esa pista ya habría terminado → salta a la siguiente desde 0
        st.i = (st.i + 1) % LISTA.length;
        st.ancla = Date.now();
        guardar();
        cargar(st.i);
        return;
      }
      if (s && dur && s < dur - 1 && Math.abs((audio.currentTime || 0) - s) > 2) {
        try { audio.currentTime = s; } catch (_) {}
      }
      anclar();
      audio.muted = !st.on;
      lanzar();
    };
    audio.addEventListener('loadedmetadata', onMeta);
  }

  audio.addEventListener('ended', () => { st.i = (st.i + 1) % LISTA.length; st.ancla = Date.now(); guardar(); cargar(st.i); });
  audio.addEventListener('error', () => { st.i = (st.i + 1) % LISTA.length; st.ancla = Date.now(); cargar(st.i); });
  // solo se auto-reanuda si el corte NO fue porque saliste de la página
  // (pestaña/app en segundo plano); así, al salir, la música se calla de verdad.
  audio.addEventListener('pause', () => { if (!audio.ended && gesto && !document.hidden) audio.play().catch(() => {}); });

  let ultimo = 0;
  audio.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (now - ultimo < 2000) return;
    ultimo = now;
    anclar();
  });
  window.addEventListener('pagehide', anclar);
  window.addEventListener('beforeunload', anclar);

  /* al salir de la página (cambiar de app, minimizar, otra pestaña) la
     música se detiene de verdad — no sigue sonando de fondo. Al volver,
     recalcula por reloj real dónde iría ahora y sigue desde ahí (no se
     queda pegada en el punto donde la dejaste). */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      anclar();
      audio.pause();
    } else if (gesto) {
      cargar(st.i);
    }
  });

  /* ---------- interruptor (silenciar / activar) — vive en el encabezado fijo ---------- */
  const navInner = document.querySelector('.ax-nav-inner');
  let box = navInner && navInner.querySelector('.alz-music');
  if (!box) {
    box = document.createElement('div');
    box.className = 'alz-music';
    const anchor = navInner && (navInner.querySelector('.alz-bell') || navInner.querySelector('.ax-nav-brand'));
    if (anchor) anchor.insertAdjacentElement('afterend', box);
    else (navInner || document.body).appendChild(box);
  }
  box.innerHTML =
    '<span class="alz-music-ico" aria-hidden="true">&#9835;</span>' +
    '<button type="button" class="alz-music-sw" role="switch" aria-checked="false" aria-label="Sonido de la música">' +
      '<span class="alz-music-knob"></span></button>';
  const sw = box.querySelector('.alz-music-sw');
  audio.addEventListener('volumechange', pintar);

  sw.addEventListener('click', () => {
    gesto = true;
    st.on = !st.on;
    guardar();
    audio.muted = !st.on;
    audio.play().catch(() => {});
    pintar();
  });

  cargar(st.i);
  pintar();
})();
