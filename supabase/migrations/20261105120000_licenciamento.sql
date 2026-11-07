-- Licenciamento do VozFlow: planos, licenças, ativações, testes grátis, bloqueios,
-- eventos da Cakto e auditoria. Toda decisão de acesso acontece aqui ou nas Edge Functions;
-- a extensão nunca lê estas tabelas diretamente.

create extension if not exists pgcrypto with schema extensions;

create type public.license_status as enum ('ativa', 'suspensa', 'revogada', 'expirada');
create type public.license_source as enum ('manual', 'cakto');

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  id boolean primary key default true check (id),
  trial_days integer not null default 3 check (trial_days between 1 and 30),
  pass_hours integer not null default 72 check (pass_hours between 1 and 720),
  grace_days integer not null default 3 check (grace_days between 0 and 30),
  trials_per_installation integer not null default 1 check (trials_per_installation between 1 and 10),
  min_extension_version text not null default '1.1.0',
  updated_at timestamptz not null default now()
);

insert into public.app_settings default values;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  period_days integer not null check (period_days > 0),
  max_numbers integer not null default 1 check (max_numbers between 1 and 50),
  cakto_offer_id text unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  plan_id uuid references public.plans (id) on delete set null,
  status public.license_status not null default 'ativa',
  expires_at timestamptz,
  max_numbers integer not null default 1 check (max_numbers between 1 and 50),
  source public.license_source not null default 'manual',
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  cakto_order_id text unique,
  cakto_subscription_id text,
  auto_renew boolean not null default false,
  delivered_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index licenses_subscription_idx on public.licenses (cakto_subscription_id);

create table public.activations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses (id) on delete cascade,
  phone text not null,
  installation_id text not null,
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (license_id, phone)
);

create index activations_phone_idx on public.activations (phone);

create table public.trials (
  phone text primary key,
  installation_id text not null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  ended_by_admin boolean not null default false
);

create index trials_installation_idx on public.trials (installation_id);

create table public.blocked_numbers (
  phone text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.payment_events (
  id bigint generated always as identity primary key,
  order_id text not null,
  event text not null,
  payload jsonb not null,
  result text,
  received_at timestamptz not null default now(),
  unique (order_id, event)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  license_id uuid references public.licenses (id) on delete set null,
  phone text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_license_idx on public.audit_log (license_id, created_at desc);

create table public.request_hits (
  key text not null,
  at timestamptz not null default now()
);

create index request_hits_key_idx on public.request_hits (key, at);

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger licenses_touch before update on public.licenses
for each row execute function public.touch_updated_at();

-- Acesso do painel: só administradores com sessão em duas etapas (aal2) leem os dados.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

alter table public.admins enable row level security;
alter table public.app_settings enable row level security;
alter table public.plans enable row level security;
alter table public.licenses enable row level security;
alter table public.activations enable row level security;
alter table public.trials enable row level security;
alter table public.blocked_numbers enable row level security;
alter table public.payment_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.request_hits enable row level security;

create policy admins_read on public.admins for select to authenticated using (public.is_admin());
create policy settings_read on public.app_settings for select to authenticated using (public.is_admin());
create policy plans_read on public.plans for select to authenticated using (public.is_admin());
create policy licenses_read on public.licenses for select to authenticated using (public.is_admin());
create policy activations_read on public.activations for select to authenticated using (public.is_admin());
create policy trials_read on public.trials for select to authenticated using (public.is_admin());
create policy blocked_read on public.blocked_numbers for select to authenticated using (public.is_admin());
create policy payment_events_read on public.payment_events for select to authenticated using (public.is_admin());
create policy audit_log_read on public.audit_log for select to authenticated using (public.is_admin());

-- Chave no formato VOZ-XXXX-XXXX-XXXX, sem caracteres ambíguos (0/O, 1/I/L).
create function public.vf_new_license_code() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  chars text;
  b integer;
begin
  loop
    chars := '';
    while length(chars) < 12 loop
      b := get_byte(gen_random_bytes(1), 0);
      -- Rejeita bytes acima do maior múltiplo de 31 para não enviesar a distribuição.
      if b < 248 then
        chars := chars || substr(alphabet, (b % 31) + 1, 1);
      end if;
    end loop;
    candidate := 'VOZ-' || substr(chars, 1, 4) || '-' || substr(chars, 5, 4) || '-' || substr(chars, 9, 4);
    exit when not exists (select 1 from public.licenses where code = candidate);
  end loop;
  return candidate;
end;
$$;

create function public.vf_license_effective(l public.licenses) returns boolean
language sql stable as $$
  select l.status = 'ativa' and (l.expires_at is null or l.expires_at > now());
$$;

-- Limite simples de requisições por chave (instalação, IP) numa janela de tempo.
create function public.vf_throttle(p_key text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql as $$
declare
  hits integer;
begin
  if random() < 0.02 then
    delete from public.request_hits where at < now() - interval '1 hour';
  end if;
  select count(*) into hits from public.request_hits
  where key = p_key and at > now() - make_interval(secs => p_window_seconds);
  if hits >= p_limit then
    return false;
  end if;
  insert into public.request_hits (key) values (p_key);
  return true;
end;
$$;

-- Estado de acesso de um número. Estados: numero_bloqueado, licenca_ativa, licenca_suspensa,
-- licenca_revogada, licenca_expirada, teste_ativo, teste_expirado, sem_acesso.
create function public.vf_access(p_phone text, p_installation_id text) returns jsonb
language plpgsql as $$
declare
  lic public.licenses;
  plan_name text;
  tr public.trials;
begin
  if exists (select 1 from public.blocked_numbers where phone = p_phone) then
    return jsonb_build_object('state', 'numero_bloqueado');
  end if;

  select l.* into lic from public.activations a
  join public.licenses l on l.id = a.license_id
  where a.phone = p_phone
  order by public.vf_license_effective(l) desc, l.expires_at desc nulls first
  limit 1;

  if found then
    if public.vf_license_effective(lic) then
      update public.activations set last_seen_at = now(), installation_id = p_installation_id
      where license_id = lic.id and phone = p_phone;
      select name into plan_name from public.plans where id = lic.plan_id;
      return jsonb_build_object(
        'state', 'licenca_ativa', 'kind', 'license', 'licenseId', lic.id,
        'plan', coalesce(plan_name, 'Licença'), 'until', lic.expires_at
      );
    end if;
    return jsonb_build_object('state', case
      when lic.status = 'suspensa' then 'licenca_suspensa'
      when lic.status = 'revogada' then 'licenca_revogada'
      else 'licenca_expirada' end);
  end if;

  select * into tr from public.trials where phone = p_phone;
  if found then
    if not tr.ended_by_admin and tr.ends_at > now() then
      return jsonb_build_object('state', 'teste_ativo', 'kind', 'trial', 'plan', 'Teste grátis', 'until', tr.ends_at);
    end if;
    return jsonb_build_object('state', 'teste_expirado');
  end if;

  return jsonb_build_object('state', 'sem_acesso');
end;
$$;

-- Inicia o teste grátis. Estado extra: teste_negado_instalacao.
create function public.vf_trial_start(p_phone text, p_installation_id text) returns jsonb
language plpgsql as $$
declare
  current_access jsonb;
  settings public.app_settings;
  used integer;
begin
  current_access := public.vf_access(p_phone, p_installation_id);
  if current_access ->> 'state' <> 'sem_acesso' then
    return current_access;
  end if;

  select * into settings from public.app_settings;
  select count(*) into used from public.trials where installation_id = p_installation_id;
  if used >= settings.trials_per_installation then
    insert into public.audit_log (actor, action, phone, details)
    values ('extensao', 'teste_negado_instalacao', p_phone, jsonb_build_object('installationId', p_installation_id));
    return jsonb_build_object('state', 'teste_negado_instalacao');
  end if;

  insert into public.trials (phone, installation_id, ends_at)
  values (p_phone, p_installation_id, now() + make_interval(days => settings.trial_days))
  on conflict (phone) do nothing;

  insert into public.audit_log (actor, action, phone, details)
  values ('extensao', 'teste_iniciado', p_phone, jsonb_build_object('installationId', p_installation_id));

  return public.vf_access(p_phone, p_installation_id);
end;
$$;

-- Ativa uma chave para o número conectado. Estados extras: chave_invalida, limite_numeros.
create function public.vf_license_activate(p_code text, p_phone text, p_installation_id text) returns jsonb
language plpgsql as $$
declare
  lic public.licenses;
  used integer;
begin
  if exists (select 1 from public.blocked_numbers where phone = p_phone) then
    return jsonb_build_object('state', 'numero_bloqueado');
  end if;

  select * into lic from public.licenses where code = upper(trim(p_code)) for update;
  if not found then
    return jsonb_build_object('state', 'chave_invalida');
  end if;

  if not public.vf_license_effective(lic) then
    return jsonb_build_object('state', case
      when lic.status = 'suspensa' then 'licenca_suspensa'
      when lic.status = 'revogada' then 'licenca_revogada'
      else 'licenca_expirada' end);
  end if;

  if not exists (select 1 from public.activations where license_id = lic.id and phone = p_phone) then
    select count(*) into used from public.activations where license_id = lic.id;
    if used >= lic.max_numbers then
      insert into public.audit_log (actor, action, license_id, phone)
      values ('extensao', 'ativacao_recusada_limite', lic.id, p_phone);
      return jsonb_build_object('state', 'limite_numeros');
    end if;
    insert into public.activations (license_id, phone, installation_id)
    values (lic.id, p_phone, p_installation_id);
    insert into public.audit_log (actor, action, license_id, phone, details)
    values ('extensao', 'licenca_ativada', lic.id, p_phone, jsonb_build_object('installationId', p_installation_id));
  end if;

  return public.vf_access(p_phone, p_installation_id);
end;
$$;

-- Aplica um evento da Cakto já autenticado. Telefones chegam normalizados pela Edge Function.
create function public.vf_cakto_event(
  p_event text,
  p_order_id text,
  p_subscription_id text,
  p_offer_id text,
  p_paid_at timestamptz,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text,
  p_payload jsonb
) returns text
language plpgsql as $$
declare
  lic public.licenses;
  pl public.plans;
  settings public.app_settings;
  new_expiry timestamptz;
  v_result text;
  blocked_phone text;
begin
  insert into public.payment_events (order_id, event, payload)
  values (p_order_id, p_event, p_payload)
  on conflict (order_id, event) do nothing;
  if not found then
    return 'duplicado';
  end if;

  select * into settings from public.app_settings;
  select * into lic from public.licenses
  where (p_subscription_id is not null and cakto_subscription_id = p_subscription_id)
     or cakto_order_id = p_order_id
  order by created_at
  limit 1
  for update;

  if p_event in ('purchase_approved', 'subscription_renewed') then
    select * into pl from public.plans where cakto_offer_id = p_offer_id;
    if not found and lic.id is null then
      v_result := 'sem_plano';
    else
      if pl.id is null then
        select * into pl from public.plans where id = lic.plan_id;
      end if;
      -- A validade parte do pagamento; repetir o evento ou receber os dois avisos da mesma
      -- cobrança produz a mesma data.
      new_expiry := coalesce(p_paid_at, now())
        + make_interval(days => coalesce(pl.period_days, 30) + settings.grace_days);

      if lic.id is null then
        insert into public.licenses (
          code, plan_id, expires_at, max_numbers, source, buyer_name, buyer_email, buyer_phone,
          cakto_order_id, cakto_subscription_id, auto_renew
        ) values (
          public.vf_new_license_code(), pl.id, new_expiry, pl.max_numbers, 'cakto', p_buyer_name,
          p_buyer_email, p_buyer_phone, p_order_id, p_subscription_id, p_subscription_id is not null
        ) returning * into lic;
        v_result := 'licenca_criada';
      else
        update public.licenses set
          expires_at = greatest(coalesce(expires_at, new_expiry), new_expiry),
          status = case when status = 'expirada' then 'ativa'::public.license_status else status end,
          cakto_subscription_id = coalesce(cakto_subscription_id, p_subscription_id)
        where id = lic.id;
        v_result := 'licenca_estendida';
      end if;
    end if;
  elsif lic.id is null then
    v_result := 'licenca_nao_encontrada';
  elsif p_event = 'refund_requested' then
    update public.licenses set status = 'suspensa' where id = lic.id and status = 'ativa';
    v_result := 'licenca_suspensa';
  elsif p_event in ('refund', 'chargeback') then
    update public.licenses set status = 'revogada', auto_renew = false where id = lic.id;
    for blocked_phone in
      select phone from public.activations where license_id = lic.id
      union
      select coalesce(p_buyer_phone, lic.buyer_phone)
    loop
      if blocked_phone is not null and blocked_phone <> '' then
        insert into public.blocked_numbers (phone, reason)
        values (blocked_phone, p_event || ' do pedido ' || p_order_id)
        on conflict (phone) do nothing;
      end if;
    end loop;
    v_result := 'licenca_revogada';
  elsif p_event = 'subscription_canceled' then
    update public.licenses set auto_renew = false where id = lic.id;
    v_result := 'renovacao_cancelada';
  elsif p_event = 'subscription_resumed' then
    update public.licenses set auto_renew = true where id = lic.id;
    v_result := 'renovacao_retomada';
  else
    v_result := 'ignorado';
  end if;

  update public.payment_events set result = v_result
  where order_id = p_order_id and event = p_event;

  insert into public.audit_log (actor, action, license_id, phone, details)
  values ('cakto', p_event, lic.id, p_buyer_phone,
    jsonb_build_object('orderId', p_order_id, 'resultado', v_result));

  return v_result;
end;
$$;

revoke execute on function public.vf_new_license_code() from public, anon, authenticated;
revoke execute on function public.vf_throttle(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.vf_access(text, text) from public, anon, authenticated;
revoke execute on function public.vf_trial_start(text, text) from public, anon, authenticated;
revoke execute on function public.vf_license_activate(text, text, text) from public, anon, authenticated;
revoke execute on function public.vf_cakto_event(text, text, text, text, timestamptz, text, text, text, jsonb)
  from public, anon, authenticated;
