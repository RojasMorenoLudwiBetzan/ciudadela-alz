-- =====================================================================
--  NOTIFICACIONES  (te avisan cuando alguien te menciona con @)
--  Corre esto UNA vez en:  Supabase > SQL Editor > New query > Run.
--  Requiere las tablas perfiles / publicaciones / comentarios.
-- =====================================================================

create table if not exists public.notificaciones (
  id          uuid primary key default gen_random_uuid(),
  destino     uuid not null references public.perfiles(id)      on delete cascade,  -- quién la recibe
  actor       uuid          references public.perfiles(id)      on delete set null, -- quién menciona
  tipo        text not null default 'mencion',
  publicacion uuid          references public.publicaciones(id) on delete cascade,
  comentario  uuid          references public.comentarios(id)   on delete cascade,
  leida       boolean not null default false,
  creado      timestamptz not null default now()
);
create index if not exists notif_destino_idx on public.notificaciones (destino, creado desc);

alter table public.notificaciones enable row level security;

drop policy if exists "notif ver" on public.notificaciones;
create policy "notif ver" on public.notificaciones for select to authenticated
  using (destino = auth.uid());

drop policy if exists "notif crear" on public.notificaciones;
create policy "notif crear" on public.notificaciones for insert to authenticated
  with check (actor = auth.uid() and destino <> auth.uid());

drop policy if exists "notif marcar" on public.notificaciones;
create policy "notif marcar" on public.notificaciones for update to authenticated
  using (destino = auth.uid()) with check (destino = auth.uid());

drop policy if exists "notif borrar" on public.notificaciones;
create policy "notif borrar" on public.notificaciones for delete to authenticated
  using (destino = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.notificaciones;
exception when others then null; end $$;

notify pgrst, 'reload schema';
