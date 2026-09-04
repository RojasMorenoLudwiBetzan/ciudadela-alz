-- =====================================================================
--  MIGRACIÓN — Comunidad v3
--  Corre esto UNA vez en:  Supabase > SQL Editor > New query > Run.
--  NO borra nada. Solo:
--    1) agrega la columna "media" (arregla "column publicaciones.media
--       does not exist")
--    2) crea la tabla de reacciones de estado (jaja / sus / aburrida / zzz)
--       que reemplaza a los comentarios.
-- =====================================================================

-- 1) columna media --------------------------------------------------------
alter table public.publicaciones
  add column if not exists media jsonb not null default '[]'::jsonb;

-- 2) reacciones de estado ----------------------------------------------------
create table if not exists public.pub_reacciones (
  pub    uuid not null references public.publicaciones(id) on delete cascade,
  perfil uuid not null references public.perfiles(id)      on delete cascade,
  tipo   text not null check (tipo in ('jaja','sus','aburrida','zzz')),
  creado timestamptz not null default now(),
  primary key (pub, perfil, tipo)
);

alter table public.pub_reacciones enable row level security;

drop policy if exists "reac lectura" on public.pub_reacciones;
create policy "reac lectura" on public.pub_reacciones
  for select to anon, authenticated using (true);

drop policy if exists "reac propia" on public.pub_reacciones;
create policy "reac propia" on public.pub_reacciones
  for insert to authenticated with check (perfil = auth.uid());

drop policy if exists "reac quitar propia" on public.pub_reacciones;
create policy "reac quitar propia" on public.pub_reacciones
  for delete to authenticated using (perfil = auth.uid());

-- refresca el cache de la API
notify pgrst, 'reload schema';
