-- =====================================================================
--  COMUNIDAD ALZ — social: amistades + chats privados y grupales
--  Corre esto en:  Supabase > SQL Editor > New query > Run.
--  Requiere que ya exista la tabla public.perfiles (comunidad.sql).
--  Es re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------------
-- AMISTADES  (solicitud -> aceptada)
-- ------------------------------------------------------------------
create table if not exists public.amistades (
  id           uuid primary key default gen_random_uuid(),
  solicitante  uuid not null references public.perfiles(id) on delete cascade,
  receptor     uuid not null references public.perfiles(id) on delete cascade,
  estado       text not null default 'pendiente' check (estado in ('pendiente','aceptada')),
  creado       timestamptz not null default now(),
  constraint amistad_distinta check (solicitante <> receptor),
  unique (solicitante, receptor)
);
-- una sola relación entre dos personas, sin importar quién la pidió
create unique index if not exists amistades_par_uniq
  on public.amistades (least(solicitante, receptor), greatest(solicitante, receptor));

alter table public.amistades enable row level security;

drop policy if exists "amistad ver" on public.amistades;
create policy "amistad ver" on public.amistades for select to authenticated
  using (solicitante = auth.uid() or receptor = auth.uid());

drop policy if exists "amistad pedir" on public.amistades;
create policy "amistad pedir" on public.amistades for insert to authenticated
  with check (solicitante = auth.uid());

drop policy if exists "amistad responder" on public.amistades;
create policy "amistad responder" on public.amistades for update to authenticated
  using (solicitante = auth.uid() or receptor = auth.uid())
  with check (solicitante = auth.uid() or receptor = auth.uid());

drop policy if exists "amistad borrar" on public.amistades;
create policy "amistad borrar" on public.amistades for delete to authenticated
  using (solicitante = auth.uid() or receptor = auth.uid());

-- ------------------------------------------------------------------
-- SALAS  (dm = privado 1 a 1  /  grupo)
-- ------------------------------------------------------------------
create table if not exists public.salas (
  id      uuid primary key default gen_random_uuid(),
  tipo    text not null check (tipo in ('dm','grupo')),
  nombre  text,
  creador uuid references public.perfiles(id) on delete set null,
  creado  timestamptz not null default now()
);

create table if not exists public.sala_miembros (
  sala     uuid not null references public.salas(id) on delete cascade,
  perfil   uuid not null references public.perfiles(id) on delete cascade,
  rol      text not null default 'miembro' check (rol in ('admin','miembro')),
  agregado timestamptz not null default now(),
  primary key (sala, perfil)
);

create table if not exists public.mensajes (
  id     uuid primary key default gen_random_uuid(),
  sala   uuid not null references public.salas(id) on delete cascade,
  autor  uuid not null references public.perfiles(id) on delete cascade,
  texto  text not null check (char_length(texto) between 1 and 4000),
  creado timestamptz not null default now()
);
create index if not exists mensajes_sala_idx on public.mensajes (sala, creado);

-- helper: ¿el usuario actual es miembro de esta sala?  (evita recursión en RLS)
create or replace function public.es_miembro(p_sala uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.sala_miembros where sala = p_sala and perfil = auth.uid()
  )
$$;
revoke all on function public.es_miembro(uuid) from public;
grant execute on function public.es_miembro(uuid) to authenticated;

alter table public.salas          enable row level security;
alter table public.sala_miembros  enable row level security;
alter table public.mensajes       enable row level security;

drop policy if exists "sala ver" on public.salas;
create policy "sala ver" on public.salas for select to authenticated
  using (public.es_miembro(id));

drop policy if exists "miembros ver" on public.sala_miembros;
create policy "miembros ver" on public.sala_miembros for select to authenticated
  using (public.es_miembro(sala));

drop policy if exists "miembro salir" on public.sala_miembros;
create policy "miembro salir" on public.sala_miembros for delete to authenticated
  using (perfil = auth.uid());

drop policy if exists "mensajes ver" on public.mensajes;
create policy "mensajes ver" on public.mensajes for select to authenticated
  using (public.es_miembro(sala));

drop policy if exists "mensajes enviar" on public.mensajes;
create policy "mensajes enviar" on public.mensajes for insert to authenticated
  with check (autor = auth.uid() and public.es_miembro(sala));

-- ------------------------------------------------------------------
-- RPCs
-- ------------------------------------------------------------------
create or replace function public.abrir_dm(p_otro uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_sala uuid; v_yo uuid := auth.uid();
begin
  if v_yo is null or p_otro is null or p_otro = v_yo then
    raise exception 'destino inválido';
  end if;
  select s.id into v_sala
  from public.salas s
  join public.sala_miembros m1 on m1.sala = s.id and m1.perfil = v_yo
  join public.sala_miembros m2 on m2.sala = s.id and m2.perfil = p_otro
  where s.tipo = 'dm'
  limit 1;
  if v_sala is not null then return v_sala; end if;
  insert into public.salas (tipo, creador) values ('dm', v_yo) returning id into v_sala;
  insert into public.sala_miembros (sala, perfil, rol)
    values (v_sala, v_yo, 'miembro'), (v_sala, p_otro, 'miembro');
  return v_sala;
end $$;
grant execute on function public.abrir_dm(uuid) to authenticated;

create or replace function public.crear_grupo(p_nombre text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_sala uuid; v_yo uuid := auth.uid();
begin
  if v_yo is null then raise exception 'sin sesión'; end if;
  insert into public.salas (tipo, nombre, creador)
    values ('grupo', coalesce(nullif(btrim(p_nombre), ''), 'Grupo'), v_yo)
    returning id into v_sala;
  insert into public.sala_miembros (sala, perfil, rol) values (v_sala, v_yo, 'admin');
  return v_sala;
end $$;
grant execute on function public.crear_grupo(text) to authenticated;

create or replace function public.invitar_grupo(p_sala uuid, p_perfil uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_yo uuid := auth.uid();
begin
  if not exists (select 1 from public.sala_miembros where sala = p_sala and perfil = v_yo) then
    raise exception 'no eres miembro de ese grupo';
  end if;
  if not exists (select 1 from public.salas where id = p_sala and tipo = 'grupo') then
    raise exception 'solo se puede invitar a grupos';
  end if;
  insert into public.sala_miembros (sala, perfil, rol)
    values (p_sala, p_perfil, 'miembro')
  on conflict (sala, perfil) do nothing;
end $$;
grant execute on function public.invitar_grupo(uuid, uuid) to authenticated;

create or replace function public.mis_amigos()
returns table (id uuid, alias text)
language sql security definer stable set search_path = public as $$
  select p.id, p.alias::text
  from public.amistades a
  join public.perfiles p
    on p.id = case when a.solicitante = auth.uid() then a.receptor else a.solicitante end
  where a.estado = 'aceptada'
    and (a.solicitante = auth.uid() or a.receptor = auth.uid())
$$;
grant execute on function public.mis_amigos() to authenticated;

create or replace function public.mis_salas()
returns table (id uuid, tipo text, nombre text, otro_alias text, otro_id uuid,
               ultimo text, ultimo_at timestamptz)
language sql security definer stable set search_path = public as $$
  select s.id, s.tipo, s.nombre,
    (select p.alias::text from public.sala_miembros m
       join public.perfiles p on p.id = m.perfil
       where m.sala = s.id and m.perfil <> auth.uid() limit 1) as otro_alias,
    (select m.perfil from public.sala_miembros m
       where m.sala = s.id and m.perfil <> auth.uid() limit 1) as otro_id,
    (select x.texto  from public.mensajes x where x.sala = s.id order by x.creado desc limit 1) as ultimo,
    (select x.creado from public.mensajes x where x.sala = s.id order by x.creado desc limit 1) as ultimo_at
  from public.salas s
  where public.es_miembro(s.id)
  order by ultimo_at desc nulls last, s.creado desc
$$;
grant execute on function public.mis_salas() to authenticated;

-- ------------------------------------------------------------------
-- Realtime
-- ------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.mensajes;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.amistades;
exception when others then null; end $$;

notify pgrst, 'reload schema';
