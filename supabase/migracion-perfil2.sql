-- =====================================================================
--  MIGRACIÓN — perfil v3
--  Corre esto UNA vez en:  Supabase > SQL Editor > New query > Run.
--  avatar_meta: guarda la imagen ORIGINAL + zoom/posición del recorte,
--  para poder reabrir el editor y volver a alejarte.
--
--  NOTA: si ya corriste una versión anterior que creaba la función
--  email_de_alias, bórrala (el inicio de sesión debe ser SOLO con el
--  alias original, no con el que cambiaste después):
--      drop function if exists public.email_de_alias(text);
-- =====================================================================

alter table public.perfiles add column if not exists avatar_meta jsonb;

drop function if exists public.email_de_alias(text);

notify pgrst, 'reload schema';
