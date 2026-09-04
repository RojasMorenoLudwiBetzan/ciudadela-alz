-- =====================================================================
--  MIGRACIÓN — perfil v2
--  Corre esto UNA vez en:  Supabase > SQL Editor > New query > Run.
--  1) alias con espacios y tildes (2 a 30). NO afecta el inicio de sesión.
--  2) foto de perfil (avatar_url).
--  3) tiempo real para el muro y los comentarios.
-- =====================================================================

-- 1) alias flexible -------------------------------------------------------
alter table public.perfiles drop constraint if exists alias_formato;
alter table public.perfiles
  add constraint alias_formato
  check (
    char_length(alias) between 2 and 30
    and btrim(alias) = alias
    and alias ~ '^[A-Za-z0-9À-ÿ ._-]+$'
  );

-- 2) foto de perfil -----------------------------------------------------
alter table public.perfiles add column if not exists avatar_url text;

-- 3) tiempo real para muro + comentarios ------------------------------
do $$ begin alter publication supabase_realtime add table public.publicaciones; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.comentarios;   exception when others then null; end $$;

notify pgrst, 'reload schema';
