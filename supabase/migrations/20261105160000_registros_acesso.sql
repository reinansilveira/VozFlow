-- Registros de acesso à aplicação (Marco Civil da Internet, art. 15): IP, data e hora de cada
-- verificação feita pela extensão, guardados em sigilo por 6 meses e apagados depois.
create table public.access_logs (
  id bigint generated always as identity primary key,
  ip text not null,
  operation text not null,
  phone text,
  installation_id text,
  created_at timestamptz not null default now()
);

create index access_logs_created_idx on public.access_logs (created_at);

-- Sem policies: nem o painel lê estes registros; só a service role, para atender ordem judicial.
alter table public.access_logs enable row level security;

create function public.vf_log_access(p_ip text, p_operation text, p_phone text, p_installation_id text) returns void
language plpgsql as $$
begin
  insert into public.access_logs (ip, operation, phone, installation_id)
  values (p_ip, p_operation, p_phone, p_installation_id);
  if random() < 0.01 then
    delete from public.access_logs where created_at < now() - interval '6 months';
  end if;
end;
$$;

revoke execute on function public.vf_log_access(text, text, text, text) from public, anon, authenticated;
