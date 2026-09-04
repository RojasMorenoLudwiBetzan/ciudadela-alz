/* =====================================================================
   CONFIGURACIÓN DE SUPABASE  —  RELLENA ESTOS 2 VALORES
   ---------------------------------------------------------------------
   1. SUPABASE_URL     -> Supabase > Project Settings > Data API > Project URL
   2. SUPABASE_ANON_KEY-> Supabase > Project Settings > API Keys > anon / public

   La "anon key" es PÚBLICA por diseño: puede ir en el sitio estático.
   NUNCA pongas aquí la "service_role key".
===================================================================== */

window.AX_CONFIG = {
  SUPABASE_URL: "https://zojumeuoyjnkbggxhsvl.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvanVtZXVveWpua2JnZ3hoc3ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNzU5MTksImV4cCI6MjEwMzk1MTkxOX0._ymDGkyGF1toYM-1DK0NBvP202unmMwnBj28JefQ75w",

  // Bucket de Storage donde se suben las imágenes/vídeo/audio de la comunidad
  // y las fotos de perfil.
  BUCKET: "evidencia",

  // Límite de tamaño por archivo subido (MB).
  MAX_MB: 25,

  // =====================================================================
  // ENLACES DE SALIDA — RELLENA CON LOS LINKS REALES CUANDO LOS TENGAS.
  // Deja en null el que todavía no exista: el botón se muestra apagado
  // y sin enlace roto en vez de mandar a una página en blanco.
  // =====================================================================
  SOCIAL: {
    youtube: "https://www.youtube.com/@Scartlazarus/videos",
    tiktok: "https://www.tiktok.com/@scartlazarus",
    discord: "https://discord.gg/2uxSagwSME",
    instagram: "https://www.instagram.com/scartlazarus/",
    kick: "https://kick.com/scartlazarus"
  },

  // Link de invitación de Discord usado en Rangos / Donaciones / Comunidad.
  // Puede ser el mismo que SOCIAL.discord.
  DISCORD_INVITE: "https://discord.gg/2uxSagwSME",

  // IP / dirección del servidor de juego (se muestra en Rangos cuando exista).
  SERVER_IP: null,

  // =====================================================================
  // DATOS DE PAGO — página Donaciones.
  // Deja en null el que aún no tengas listo: la tarjeta se queda con la
  // etiqueta "PENDIENTE" en vez de mostrar un dato falso o vacío.
  // =====================================================================
  PAGOS: {
    yape: "931991026",
    bcp: "Cuenta BCP Soles: 57096013046028  ·  Cuenta interbancaria (CCI): 0025701960130460280",
    airtm: "katzemedizin@gmail.com",
    paypal: "katzemedizin@gmail.com",
    lemon: "$lemontag: scartlazarus  ·  Tel: +51 931 991 026  ·  CCI: 92200300000206483696"
  }
};