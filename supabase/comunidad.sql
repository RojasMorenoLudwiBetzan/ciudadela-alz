-- =====================================================================
--  ALIANZA EXPLORATION — COMUNIDAD  (cuentas @scartlazarus.pe)
--  ---------------------------------------------------------------------
--  Autenticación:  Supabase Auth  (correo real + contraseña).
--  Identidad fija: "handle" = alias@scartlazarus.pe  (NO se puede cambiar).
--  Alias visible:  editable; los anteriores quedan en alias_historial.
--  Recuperación:   Supabase envía un enlace al correo real (built-in).
--
--  Ejecutar en:  Supabase > SQL Editor > New query.
--  Es RE-EJECUTABLE: puedes correrlo las veces que quieras sin romper nada.
-- =====================================================================

create extension if not exists citext;

-- ---------------------------------------------------------------------
-- LIMPIEZA de la versión anterior (identidad por "clave" en el navegador).
-- Solo borra las tablas de la comunidad; NO toca "cartillas" ni Storage.
-- Si aún no habías creado nada, no pasa nada.
-- ---------------------------------------------------------------------
drop table if exists public.pub_reacciones cascade;
drop table if exists public.pub_likes    cascade;
drop table if exists public.comentarios  cascade;
drop table if exists public.publicaciones cascade;
drop table if exists public.perfiles     cascade;
drop function if exists public._alz_hash(text)                         cascade;
drop function if exists public.crear_perfil(text, text)                cascade;
drop function if exists public.cambiar_alias(uuid, text, text)         cascade;
drop function if exists public.publicar(uuid, text, text, text, text, text) cascade;
drop function if exists public.comentar(uuid, text, uuid, text)        cascade;
drop function if exists public.dar_like_pub(uuid)                      cascade;
drop function if exists public.restaurar_perfil(text, text)            cascade;

-- ---------------------------------------------------------------------
-- PERFILES  (1 fila por usuario de auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  handle           text   not null unique,           -- alias@scartlazarus.pe  (FIJO)
  alias            citext not null unique,            -- alias visible (editable)
  alias_historial  text[] not null default '{}',
  created_at       timestamptz not null default now(),
  constraint alias_formato
    check (char_length(alias) between 2 and 20 and alias ~ '^[A-Za-z0-9_.]+$')
);

alter table public.perfiles enable row level security;

drop policy if exists "perfiles lectura" on public.perfiles;
create policy "perfiles lectura" on public.perfiles
  for select to anon, authenticated using (true);

drop policy if exists "perfil crear propio" on public.perfiles;
create policy "perfil crear propio" on public.perfiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "perfil editar propio" on public.perfiles;
create policy "perfil editar propio" on public.perfiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- el handle nunca cambia; al cambiar el alias, el anterior se guarda solo
create or replace function public.perfiles_guard()
returns trigger language plpgsql as $$
begin
  new.handle     := old.handle;
  new.id         := old.id;
  new.created_at := old.created_at;
  if new.alias is distinct from old.alias then
    new.alias_historial := (
      select array_agg(distinct a)
      from unnest(coalesce(old.alias_historial, '{}') || array[old.alias::text]) a
    );
  end if;
  return new;
end $$;

drop trigger if exists t_perfiles_guard on public.perfiles;
create trigger t_perfiles_guard before update on public.perfiles
  for each row execute function public.perfiles_guard();

-- ---------------------------------------------------------------------
-- PUBLICACIONES
-- ---------------------------------------------------------------------
create table if not exists public.publicaciones (
  id          uuid primary key default gen_random_uuid(),
  orden       bigint generated always as identity,
  autor       uuid not null references public.perfiles(id) on delete cascade,
  categoria   text not null default 'comunidad' check (categoria in ('comunidad','fandom')),
  texto       text not null default '' check (char_length(texto) <= 3000),
  media       jsonb not null default '[]'::jsonb,   -- [{t:'img'|'vid'|'aud', url, path}]
  imagen_url  text,
  imagen_path text,
  created_at  timestamptz not null default now()
);
create index if not exists publicaciones_fecha_idx on public.publicaciones (created_at desc);

alter table public.publicaciones enable row level security;

drop policy if exists "pub lectura" on public.publicaciones;
create policy "pub lectura" on public.publicaciones
  for select to anon, authenticated using (true);

drop policy if exists "pub crear propio" on public.publicaciones;
create policy "pub crear propio" on public.publicaciones
  for insert to authenticated with check (autor = auth.uid());

drop policy if exists "pub borrar propio" on public.publicaciones;
create policy "pub borrar propio" on public.publicaciones
  for delete to authenticated using (autor = auth.uid());

-- ---------------------------------------------------------------------
-- COMENTARIOS
-- ---------------------------------------------------------------------
create table if not exists public.comentarios (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  autor          uuid not null references public.perfiles(id) on delete cascade,
  texto          text not null check (char_length(texto) between 1 and 1000),
  created_at     timestamptz not null default now()
);
create index if not exists comentarios_pub_idx on public.comentarios (publicacion_id, created_at);

alter table public.comentarios enable row level security;

drop policy if exists "com lectura" on public.comentarios;
create policy "com lectura" on public.comentarios
  for select to anon, authenticated using (true);

drop policy if exists "com crear propio" on public.comentarios;
create policy "com crear propio" on public.comentarios
  for insert to authenticated with check (autor = auth.uid());

drop policy if exists "com borrar propio" on public.comentarios;
create policy "com borrar propio" on public.comentarios
  for delete to authenticated using (autor = auth.uid());

-- ---------------------------------------------------------------------
-- LIKES  (toggle real, 1 por usuario y publicación)
-- ---------------------------------------------------------------------
create table if not exists public.pub_likes (
  pub    uuid not null references public.publicaciones(id) on delete cascade,
  perfil uuid not null references public.perfiles(id) on delete cascade,
  primary key (pub, perfil)
);
alter table public.pub_likes enable row level security;

drop policy if exists "likes lectura" on public.pub_likes;
create policy "likes lectura" on public.pub_likes
  for select to anon, authenticated using (true);

drop policy if exists "like propio" on public.pub_likes;
create policy "like propio" on public.pub_likes
  for insert to authenticated with check (perfil = auth.uid());

drop policy if exists "unlike propio" on public.pub_likes;
create policy "unlike propio" on public.pub_likes
  for delete to authenticated using (perfil = auth.uid());

-- ---------------------------------------------------------------------
-- REACCIONES DE ESTADO  (emojis: jaja / sus / aburrida / zzz)
-- Reemplazan a los comentarios. 1 de cada tipo por usuario y publicacion.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Permitir iniciar sesión escribiendo el alias@scartlazarus.pe:
-- devuelve el correo real asociado a ese handle.
-- ---------------------------------------------------------------------
create or replace function public.email_de_handle(p_handle text)
returns text
language sql security definer set search_path = public
as $$
  select u.email
  from public.perfiles p
  join auth.users u on u.id = p.id
  where lower(p.handle) = lower(btrim(p_handle))
  limit 1
$$;
revoke all on function public.email_de_handle(text) from public;
grant execute on function public.email_de_handle(text) to anon, authenticated;

-- refresca el cache de la API
notify pgrst, 'reload schema';
