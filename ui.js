/* =====================================================================
   UI compartida — diálogos con el estilo de la web (reemplazan a los
   feos confirm() / prompt() / alert() del navegador).
     await window.alzConfirm('¿Seguro?', { aceptar:'Eliminar', peligro:true })  -> boolean
     await window.alzConfirm('¿Seguro?', { peligro:true, escribir:'nombre del grupo' }) -> boolean
       (exige escribir ese texto tal cual para poder confirmar — evita borrar sin querer)
     await window.alzPrompt('Nombre del grupo', { valor:'', aceptar:'Crear' })  -> string | null
     await window.alzAlert('Ya está.')                                          -> void
===================================================================== */
(function () {
  function base(inner) {
    const ov = document.createElement('div');
    ov.className = 'alz-ask';
    ov.innerHTML = '<div class="alz-ask-card">' + inner + '</div>';
    document.body.appendChild(ov);
    return ov;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.alzConfirm = function (mensaje, opts) {
    opts = opts || {};
    const necesitaEscribir = opts.escribir != null && opts.escribir !== '';
    return new Promise((resolve) => {
      const ov = base(
        '<p class="alz-ask-msg"></p>' +
        (necesitaEscribir
          ? '<p class="alz-ask-hint">Escribe <strong>' + esc(opts.escribir) + '</strong> para confirmar:</p>' +
            '<input class="alz-ask-input" type="text" autocomplete="off" spellcheck="false">'
          : '') +
        '<div class="alz-ask-btns">' +
          '<button type="button" class="alz-ask-no"></button>' +
          '<button type="button" class="alz-ask-si' + (opts.peligro ? ' is-peligro' : '') + '"></button>' +
        '</div>');
      ov.querySelector('.alz-ask-msg').textContent = mensaje;
      ov.querySelector('.alz-ask-no').textContent = opts.cancelar || 'Cancelar';
      const btnSi = ov.querySelector('.alz-ask-si');
      btnSi.textContent = opts.aceptar || 'Aceptar';
      const inp = ov.querySelector('.alz-ask-input');
      const coincide = () => !inp || inp.value.trim().toLowerCase() === String(opts.escribir).trim().toLowerCase();
      if (necesitaEscribir) {
        btnSi.disabled = true;
        inp.addEventListener('input', () => { btnSi.disabled = !coincide(); });
      }
      const fin = (v) => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => {
        if (e.key === 'Escape') fin(false);
        else if (e.key === 'Enter' && !btnSi.disabled) fin(true);
      };
      btnSi.addEventListener('click', () => { if (!btnSi.disabled) fin(true); });
      ov.querySelector('.alz-ask-no').addEventListener('click', () => fin(false));
      ov.addEventListener('click', (e) => { if (e.target === ov) fin(false); });
      document.addEventListener('keydown', onKey);
      setTimeout(() => (inp || btnSi).focus(), 30);
    });
  };

  window.alzAlert = function (mensaje, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const ov = base(
        '<p class="alz-ask-msg"></p>' +
        '<div class="alz-ask-btns alz-ask-btns-1">' +
          '<button type="button" class="alz-ask-si"></button>' +
        '</div>');
      ov.querySelector('.alz-ask-msg').textContent = mensaje;
      ov.querySelector('.alz-ask-si').textContent = opts.aceptar || 'Entendido';
      const fin = () => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(); };
      const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') fin(); };
      ov.querySelector('.alz-ask-si').addEventListener('click', fin);
      ov.addEventListener('click', (e) => { if (e.target === ov) fin(); });
      document.addEventListener('keydown', onKey);
      setTimeout(() => ov.querySelector('.alz-ask-si').focus(), 30);
    });
  };

  window.alzPrompt = function (mensaje, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const ov = base(
        '<p class="alz-ask-msg"></p>' +
        '<input class="alz-ask-input" type="text" maxlength="' + (opts.max || 60) + '">' +
        '<div class="alz-ask-btns">' +
          '<button type="button" class="alz-ask-no"></button>' +
          '<button type="button" class="alz-ask-si"></button>' +
        '</div>');
      ov.querySelector('.alz-ask-msg').textContent = mensaje;
      ov.querySelector('.alz-ask-no').textContent = opts.cancelar || 'Cancelar';
      ov.querySelector('.alz-ask-si').textContent = opts.aceptar || 'Aceptar';
      const inp = ov.querySelector('.alz-ask-input');
      inp.value = opts.valor || '';
      if (opts.placeholder) inp.placeholder = opts.placeholder;
      const fin = (v) => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const ok = () => { const t = inp.value.trim(); fin(t || null); };
      const onKey = (e) => { if (e.key === 'Escape') fin(null); else if (e.key === 'Enter') ok(); };
      ov.querySelector('.alz-ask-si').addEventListener('click', ok);
      ov.querySelector('.alz-ask-no').addEventListener('click', () => fin(null));
      ov.addEventListener('click', (e) => { if (e.target === ov) fin(null); });
      document.addEventListener('keydown', onKey);
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
    });
  };
})();
