/* =========================================
   FONDO SINIESTRO: FUEGO VIVO, BRASAS Y CHISPAS
   - lengua de fuego que ondula en el borde inferior
   - chispas con turbulencia de doble frecuencia (suben fluidas)
   - halo de calor por cada brasa
========================================= */

(function () {
  const canvas = document.getElementById('embers');
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COLORS = ['#ff2d0a', '#ff4a14', '#ff6a22', '#ff8c33', '#ffb347', '#ffd680'];

  let w = 0;
  let h = 0;
  let dpr = 1;
  let sparks = [];
  let flames = [];
  let rafId = null;
  let t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function makeSpark(fromEdge) {
    return {
      x: Math.random() * w,
      y: fromEdge ? h + rnd(0, 90) : Math.random() * h,
      vx: rnd(-0.3, 0.3),
      vy: -rnd(0.3, 1.5),
      size: rnd(0.5, 2.6),
      life: 0,
      maxLife: rnd(150, 460),
      // dos osciladores = trayectoria orgánica, no un zig-zag mecánico
      swA: Math.random() * Math.PI * 2,
      swB: Math.random() * Math.PI * 2,
      spA: rnd(0.008, 0.03),
      spB: rnd(0.02, 0.06),
      amp: rnd(0.15, 0.9),
      bright: rnd(0.55, 1),
      color: COLORS[(Math.random() * COLORS.length) | 0]
    };
  }

  function makeFlame(i, n) {
    return {
      base: (i + 0.5) / n,
      phase: Math.random() * Math.PI * 2,
      speed: rnd(0.0006, 0.0017),
      drift: rnd(0.03, 0.12),
      radius: rnd(0.12, 0.34)
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const target = Math.min(280, Math.max(60, Math.round((w * h) / 10000)));
    sparks = [];
    for (let i = 0; i < target; i++) sparks.push(makeSpark(false));

    const fn = Math.max(5, Math.round(w / 260));
    flames = [];
    for (let i = 0; i < fn; i++) flames.push(makeFlame(i, fn));
  }

  function drawFlames(time) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i];
      const sway = Math.sin(time * f.speed + f.phase) * f.drift
                 + Math.sin(time * f.speed * 2.3 + f.phase * 1.7) * f.drift * 0.4;
      const pulse = 0.55 + 0.45 * Math.sin(time * f.speed * 3 + f.phase);
      const cx = (f.base + sway) * w;
      const cy = h + h * 0.05 - pulse * h * 0.11;
      const r = f.radius * w * (0.8 + 0.35 * pulse);

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255, 178, 78, ' + (0.20 * pulse).toFixed(3) + ')');
      g.addColorStop(0.4, 'rgba(255, 92, 26, ' + (0.12 * pulse).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(120, 20, 8, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }

  function drawSparks() {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];

      s.life++;
      s.swA += s.spA;
      s.swB += s.spB;
      const turb = Math.sin(s.swA) + Math.sin(s.swB) * 0.5;
      s.x += s.vx + turb * s.amp * 0.6;
      s.y += s.vy;
      s.vy -= 0.0011;   // el aire caliente acelera hacia arriba
      s.vx *= 0.996;

      const t = s.life / s.maxLife;
      if (t >= 1 || s.y < -40) {
        sparks[i] = makeSpark(true);
        continue;
      }

      const fade = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      const flick = 0.5 + Math.random() * 0.5;
      const alpha = Math.max(0, fade) * flick * s.bright;

      ctx.fillStyle = s.color;

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha * 0.16;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function tick(now) {
    const time = (now || 0) - t0;
    ctx.clearRect(0, 0, w, h);
    drawFlames(time);
    drawSparks();
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId == null) rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  resize();
  window.addEventListener('resize', resize);

  if (reduce) {
    drawFlames(0);
    drawSparks();
    return;
  }

  start();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
})();

/* =====================================================================
   DONAR — vista previa del comprobante + botones "Copiar" de los
   métodos de pago. (Antes vivía en un <script> dentro de donaciones.html;
   ahora la web es una sola página.)
===================================================================== */
(function () {
  const form = document.getElementById('donate-attach-form');
  if (form) {
    const file = form.querySelector('input[name="foto"]');
    const fig = form.querySelector('.donate-preview');
    const img = fig ? fig.querySelector('img') : null;
    const msg = form.querySelector('.donate-msg');

    if (file && fig && img) {
      file.addEventListener('change', () => {
        const f = file.files && file.files[0];
        if (!f) { fig.hidden = true; img.removeAttribute('src'); return; }
        img.src = URL.createObjectURL(f);
        fig.hidden = false;
      });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const hasFoto = file && file.files && file.files[0];
      const descEl = form.querySelector('textarea[name="desc"]');
      const hasDesc = descEl && descEl.value.trim();
      if (!hasFoto && !hasDesc) {
        if (msg) { msg.textContent = 'Agrega una descripción o una foto del comprobante.'; msg.hidden = false; }
        return;
      }
      if (msg) { msg.textContent = '¡Recibido! Para confirmar tu donación, envía también esta captura por Discord.'; msg.hidden = false; }
      form.reset();
      if (fig) fig.hidden = true;
      if (img) img.removeAttribute('src');
    });
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pf-copy');
    if (!btn) return;
    const val = btn.getAttribute('data-copy') || '';
    const prev = btn.dataset.label || (btn.dataset.label = btn.textContent);
    const ok = () => {
      btn.textContent = '¡Copiado!';
      btn.classList.add('is-copied');
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {
        btn.textContent = prev;
        btn.classList.remove('is-copied');
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(val).then(ok).catch(() => { fallbackCopy(val); ok(); });
    } else {
      fallbackCopy(val);
      ok();
    }
  });
})();
