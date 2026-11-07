-- Atividade recente para os avisos do site: assinaturas ativas vindas da Cakto e testes grátis dos
-- últimos 14 dias. Devolve só o DDD (dois dígitos), nunca o telefone completo, nome ou e-mail.
create function public.vf_recent_activity()
returns table (kind text, plan text, ddd text, happened_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'assinatura'::text, coalesce(p.name, 'VozFlow'),
      case when l.buyer_phone like '55%' then substr(l.buyer_phone, 3, 2) end,
      l.created_at
    from public.licenses l
    left join public.plans p on p.id = l.plan_id
    where l.source = 'cakto' and public.vf_license_effective(l) and l.created_at > now() - interval '14 days'
    union all
    select 'teste'::text, 'Teste grátis',
      case when t.phone like '55%' then substr(t.phone, 3, 2) end,
      t.started_at
    from public.trials t
    where t.installation_id <> 'admin' and t.started_at > now() - interval '14 days'
  ) eventos
  order by 4 desc
  limit 20;
$$;

revoke execute on function public.vf_recent_activity() from public, anon, authenticated;
