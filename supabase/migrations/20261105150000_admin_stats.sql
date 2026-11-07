-- Indicadores do painel administrativo. Só responde para administradores com sessão aal2.
create function public.vf_admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'trials', (select count(*) from public.trials),
    'activeTrials', (select count(*) from public.trials where not ended_by_admin and ends_at > now()),
    'convertedTrials', (select count(distinct t.phone) from public.trials t join public.activations a on a.phone = t.phone),
    'activeLicenses', (select count(*) from public.licenses l where public.vf_license_effective(l)),
    'pendingDelivery', (select count(*) from public.licenses where delivered_at is null and status = 'ativa'),
    'unmatchedEvents', (select count(*) from public.payment_events where result in ('sem_plano', 'licenca_nao_encontrada'))
  );
end;
$$;

revoke execute on function public.vf_admin_stats() from public, anon;
grant execute on function public.vf_admin_stats() to authenticated;
