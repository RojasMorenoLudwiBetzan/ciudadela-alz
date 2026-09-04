/* =====================================================================
   PANEL DE ADMIN — solo visible para cuentas con es_admin.
   - Botón ⚙ arriba a la izquierda del encabezado.
   - Muestra: entradas totales, perfiles de las cuentas y sus visitas,
     últimas publicaciones y comentarios de la comunidad.
   - El admin PRINCIPAL ('ludwi@alz.pe') puede dar/quitar admin por correo.
   - También registra una visita por sesión de navegador.
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

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fecha = (iso) => iso ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  // ---- registrar visita (1 por sesión) ----
  // Esperamos a que la sesión esté lista para que auth.uid() cuente tu visita
  sb.auth.getSession().then(() => {
    // 1 visita por sesión de navegador; el flag SOLO se pone si la función existió
    try {
      if (!sessionStorage.getItem('alz_visita2')) {
        sb.rpc('registrar_visita').then((r) => {
          if (r && !r.error) { try { sessionStorage.setItem('alz_visita2', '1'); } catch (_) {} }
        }).catch(() => {});
      }
    } catch (_) {}

    // ¿soy admin?
    sb.rpc('soy_admin').then((r) => { if (r && r.data === true) montar(); }).catch(() => {});
  });

  let panel = null;

  let montado = false;
  function montar() {
    if (montado) return;
    montado = true;

    const hub = navInner.querySelector('.ax-hub') || navInner;

    let b = navInner.querySelector('.alz-admin-btn');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'alz-admin-btn';
      hub.appendChild(b);
    }
    b.hidden = false;
    b.removeAttribute('aria-hidden');
    b.classList.add('ax-ad-btn');
    b.title = 'Zona de administración';
    b.setAttribute('aria-haspopup', 'true');
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML = '<span class="ax-ad-txt">AD</span>';

    // menú de la "AD": panel de admin + interruptor del audio de fondo
    const menu = document.createElement('div');
    menu.className = 'ax-ad-menu';
    menu.hidden = true;
    menu.innerHTML =
      '<button type="button" class="ax-ad-item" data-ad="panel">' +
        '<span class="ax-ad-ico">&#9881;&#65039;</span><span>Panel de administración</span></button>' +
      '<div class="ax-ad-vol"><span class="ax-ad-vol-lbl">Audio de fondo</span>' +
        '<span class="ax-ad-vol-slot"></span></div>';
    b.insertAdjacentElement('afterend', menu);

    // mueve el interruptor de volumen (creado por musica.js) dentro del menú
    function meterMusica() {
      const music = navInner.querySelector('.alz-music');
      const slot = menu.querySelector('.ax-ad-vol-slot');
      if (music && slot && music.parentElement !== slot) slot.appendChild(music);
    }
    meterMusica();
    // por si musica.js aún no lo había creado
    setTimeout(meterMusica, 300);
    setTimeout(meterMusica, 1200);

    function cerrar() { menu.hidden = true; b.setAttribute('aria-expanded', 'false'); }
    function alternar() {
      const abrirlo = menu.hidden;
      menu.hidden = !abrirlo;
      b.setAttribute('aria-expanded', abrirlo ? 'true' : 'false');
    }

    b.addEventListener('click', (e) => { e.stopPropagation(); alternar(); });
    menu.addEventListener('click', (e) => {
      if (e.target.closest('.alz-music')) return;   // tocar el switch no cierra el menú
      const it = e.target.closest('[data-ad]');
      if (it && it.getAttribute('data-ad') === 'panel') { cerrar(); abrir(); }
    });
    document.addEventListener('click', (e) => {
      if (menu.hidden) return;
      if (e.target.closest('.ax-ad-btn') || e.target.closest('.ax-ad-menu')) return;
      cerrar();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
  }

  async function abrir() {
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'alz-admin';
      panel.innerHTML =
        '<div class="alz-admin-card">' +
          '<div class="alz-admin-h"><strong>&#9881;&#65039; Panel de administración</strong>' +
            '<button type="button" class="alz-admin-x" aria-label="Cerrar">&times;</button></div>' +
          '<div class="alz-admin-body">Cargando…</div>' +
        '</div>';
      document.body.appendChild(panel);
      panel.addEventListener('click', (e) => {
        if (e.target === panel || e.target.closest('.alz-admin-x')) panel.hidden = true;
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel && !panel.hidden) panel.hidden = true; });
      panel.addEventListener('click', onPanelClick);
    }
    panel.hidden = false;
    cargar();
  }

  async function cargar() {
    const body = panel.querySelector('.alz-admin-body');
    body.innerHTML = '<p class="alz-admin-load">Cargando…</p>';

    const [tot, perf] = await Promise.all([
      sb.rpc('panel_total'),
      sb.rpc('panel_perfiles')
    ]);

    const total = (tot && tot.data != null) ? tot.data : '—';
    const perfiles = (perf && perf.data) || [];
    const sumaReg = perfiles.reduce((a, p) => a + (p.visitas || 0), 0);

    const filasPerf = perfiles.map((p) =>
      '<tr><td>' + esc(p.alias) + (p.es_admin ? ' <span class="alz-admin-tag">admin</span>' : '') + '</td>' +
      '<td class="alz-admin-num">' + (p.visitas || 0) + '</td>' +
      '<td>' + fecha(p.ultima_visita) + '</td></tr>').join('');

    body.innerHTML =
      '<div class="alz-admin-kpi"><span>Visitas totales · registrados + anónimos</span><b>' + total + '</b></div>' +

      '<div class="alz-admin-sec">Cuentas registradas y cuántas veces entraron (' + perfiles.length + ')</div>' +
      '<div class="alz-admin-tw"><table><thead><tr><th>Alias</th><th>Veces que entró</th><th>Última vez</th></tr></thead>' +
        '<tbody>' + (filasPerf || '<tr><td colspan="3">—</td></tr>') +
        '<tr class="alz-admin-sum"><td>Suma de registrados</td><td class="alz-admin-num">' + sumaReg + '</td><td></td></tr>' +
        '</tbody></table></div>' +

      '<div class="alz-admin-sec">Dar / quitar admin <em>(solo el admin principal)</em></div>' +
      '<div class="alz-admin-grant">' +
        '<input type="text" class="alz-admin-mail" placeholder="correo real o alias@alz.pe" autocomplete="off">' +
        '<button type="button" class="alz-admin-give">Dar admin</button>' +
        '<button type="button" class="alz-admin-take">Quitar</button>' +
      '</div>' +
      '<p class="alz-admin-msg" hidden></p>';
  }

  async function onPanelClick(e) {
    const dar = e.target.closest('.alz-admin-give');
    const quitar = e.target.closest('.alz-admin-take');
    if (!dar && !quitar) return;
    const inp = panel.querySelector('.alz-admin-mail');
    const msg = panel.querySelector('.alz-admin-msg');
    const correo = (inp.value || '').trim();
    if (!correo) { msg.hidden = false; msg.textContent = 'Escribe un correo.'; return; }
    (dar || quitar).disabled = true;
    const { data, error } = await sb.rpc('set_admin', { p_correo: correo, p_es: !!dar });
    (dar || quitar).disabled = false;
    msg.hidden = false;
    msg.textContent = error ? (error.message || 'No se pudo.') : (data || 'Hecho.');
    if (!error) { inp.value = ''; cargar(); }
  }
})();
