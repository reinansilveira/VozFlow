import { useCallback, type ReactElement } from 'react';
import { useResource } from '../hooks/use-resource';
import { fetchStats } from '../services/admin-api';

type StatItem = { label: string; value: number | string; hint?: string };

export const StatsBar = ({ refreshKey }: { refreshKey: number }): ReactElement => {
  // refreshKey força uma nova leitura depois de cada alteração feita no painel.
  const load = useCallback(() => fetchStats(), [refreshKey]);
  const { data } = useResource(load);
  const conversion = data && data.trials ? `${Math.round((data.convertedTrials / data.trials) * 100)}%` : '—';
  const items: StatItem[] = [
    { label: 'Licenças ativas', value: data?.activeLicenses ?? '—' },
    { label: 'Testes em andamento', value: data?.activeTrials ?? '—', hint: `${data?.trials ?? 0} no total` },
    { label: 'Conversão do teste', value: conversion, hint: `${data?.convertedTrials ?? 0} viraram clientes` },
    { label: 'Chaves a entregar', value: data?.pendingDelivery ?? '—' },
    { label: 'Eventos sem plano', value: data?.unmatchedEvents ?? '—' },
  ];
  return <section className="stats" aria-label="Indicadores">
    {items.map((item) => <div className="stats__item" key={item.label}>
      <span className="stats__label">{item.label}</span>
      <strong className="stats__value">{item.value}</strong>
      {item.hint && <span className="stats__hint">{item.hint}</span>}
    </div>)}
  </section>;
};
