-- =====================================================================
--  ADMIN + MÉTRICAS DE VISITAS
--  Corre esto UNA vez en:  Supabase > SQL Editor > New query > Run.
--  El administrador PRINCIPAL es la cuenta cuyo handle es 'ludwi@alz.pe'
--  (el primer alias con el que se creó la cuenta). Solo esa cuenta puede
--  dar / quitar admin a otras.
-- =====================================================================

alter table public.perfiles add column if not exists es_admin      boolean     not null default false;
alter table public.perfiles add column if not exists visitas       integer     not null default 0;
alter table public.perfiles add column if not exists ultima_visita timestamptz;

-- métrica global (una sola fila)
create table if not exists public.metricas (
  id            smallint primary key default 1,
  visitas_total bigint not null default 0,
  constraint metricas_una check (id = 1)
);
insert into public.metricas (id) values (1) on conflict (id) do nothing;
alter table public.metricas enable row level security;

drop policy if exists "metricas admin" on public.metricas;
create policy "metricas admin" on public.metricas for select to authenticated
  using (exists (select 1 from public.perfiles where id = auth.uid() and es_admin));

-- arranque: la cuenta principal queda como admin
update public.perfiles set es_admin = true where lower(handle) = 'ludwi@alz.pe';

-- ¿el usuario actual es admin?
create or replace function public.soy_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select es_admin from public.perfiles where id = auth.uid()), false)
$$;
grant execute on function public.soy_admin() to anon, authenticated;

-- registra una visita (el cliente la llama 1 vez por sesión de navegador)
create or replace function public.registrar_visita()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.metricas set visitas_total = visitas_total + 1 where id = 1;
  if auth.uid() is not null then
    update public.perfiles set visitas = visitas + 1, ultima_visita = now() where id = auth.uid();
  end if;
end $$;
grant execute on function public.registrar_visita() to anon, authenticated;

-- panel del admin: perfiles + sus visitas (solo admin recibe filas)
create or replace function public.panel_perfiles()
returns table (id uuid, alias text, es_admin boolean, visitas integer, ultima_visita timestamptz, creado timestamptz)
language sql security definer stable set search_path = public as $$
  select p.id, p.alias::text, p.es_admin, p.visitas, p.ultima_visita, p.created_at
  from public.perfiles p
  where public.soy_admin()
  order by p.ultima_visita desc nulls last, p.created_at desc
$$;
grant execute on function public.panel_perfiles() to authenticated;

-- total de entradas (solo admin)
create or replace function public.panel_total()
returns bigint language sql security definer stable set search_path = public as $$
  select case when public.soy_admin() then (select visitas_total from public.metricas where id = 1) else null end
$$;
grant execute on function public.panel_total() to authenticated;

-- SOLO 'ludwi@alz.pe' puede dar / quitar admin, escribiendo el correo real
-- (gmail…) o el alias completo (algo@alz.pe)
create or replace function public.set_admin(p_correo text, p_es boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_yo text;
begin
  select lower(handle) into v_yo from public.perfiles where id = auth.uid();
  if v_yo is distinct from 'ludwi@alz.pe' then
    raise exception 'Solo el administrador principal puede cambiar permisos.';
  end if;
  select u.id into v_uid from auth.users u where lower(u.email) = lower(btrim(p_correo)) limit 1;
  if v_uid is null then
    select id into v_uid from public.perfiles where lower(handle) = lower(btrim(p_correo)) limit 1;
  end if;
  if v_uid is null then
    return 'No hay ninguna cuenta con "' || p_correo || '".';
  end if;
  update public.perfiles set es_admin = coalesce(p_es, true) where id = v_uid;
  if coalesce(p_es, true) then
    return 'Listo: "' || p_correo || '" ahora es admin.';
  else
    return '"' || p_correo || '" ya no es admin.';
  end if;
end $$;
grant execute on function public.set_admin(text, boolean) to authenticated;

notify pgrst, 'reload schema';
