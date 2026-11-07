import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useResource } from '../hooks/use-resource';
import { fetchLicenses, fetchPlans } from '../services/admin-api';
import type { License, LicenseStatus } from '../types';
import { effectiveStatus, formatDate, formatPhone } from '../utils/format';
import { LicenseDetail } from './LicenseDetail';
import { LicenseForm } from './LicenseForm';
import { StateMessage } from './StateMessage';
import { StatusBadge } from './StatusBadge';

type Filter = 'todas' | LicenseStatus | 'a_entregar';

const filters: Array<{ id: Filter; label: string }> = [
  { id: 'todas', label: 'Todas' },
  { id: 'a_entregar', label: 'A entregar' },
  { id: 'ativa', label: 'Ativas' },
  { id: 'suspensa', label: 'Suspensas' },
  { id: 'revogada', label: 'Revogadas' },
  { id: 'expirada', label: 'Expiradas' },
];

const matchesFilter = (license: License, filter: Filter): boolean => {
  if (filter === 'todas') return true;
  if (filter === 'a_entregar') return !license.delivered_at && effectiveStatus(license) === 'ativa';
  return effectiveStatus(license) === filter;
};

const matchesSearch = (license: License, term: string): boolean => {
  if (!term) return true;
  const digits = term.replace(/\D/g, '');
  const haystack = [license.code, license.buyer_name, license.buyer_email, license.note, license.cakto_order_id].join(' ').toLowerCase();
  const phones = [license.buyer_phone, ...license.activations.map((activation) => activation.phone)].join(' ');
  return haystack.includes(term.toLowerCase()) || (digits.length >= 4 && phones.includes(digits));
};

export const LicensesView = ({ onChanged }: { onChanged: () => void }): ReactElement => {
  const licenses = useResource(fetchLicenses);
  const plans = useResource(fetchPlans);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('todas');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const visible = useMemo(
    () => (licenses.data ?? []).filter((license) => matchesFilter(license, filter) && matchesSearch(license, search.trim())),
    [licenses.data, filter, search],
  );
  const selected = licenses.data?.find((license) => license.id === selectedId) ?? null;

  const handleChanged = useCallback((): void => {
    void licenses.reload();
    onChanged();
  }, [licenses, onChanged]);

  return <section className="view">
    <header className="view__header">
      <h1>Licenças</h1>
      <button type="button" className="button button--primary" onClick={() => setShowForm((value) => !value)} aria-expanded={showForm}>{showForm ? 'Fechar' : 'Nova licença'}</button>
    </header>
    {showForm && <LicenseForm plans={plans.data ?? []} onCreated={handleChanged} />}
    <div className="toolbar">
      <label className="field toolbar__search">Buscar<input type="search" placeholder="Chave, nome, e-mail, pedido ou telefone" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="chips" role="group" aria-label="Filtrar por situação">
        {filters.map((item) => <button key={item.id} type="button" className={`chips__item ${filter === item.id ? 'chips__item--active' : ''}`} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
      </div>
    </div>
    <div className={`split ${selected ? 'split--open' : ''}`}>
      <div className="panel-card table-wrap">
        <StateMessage isLoading={licenses.isLoading && !licenses.data} error={licenses.error} isEmpty={visible.length === 0} emptyText="Nenhuma licença encontrada." onRetry={() => void licenses.reload()} />
        {visible.length > 0 && <table className="table">
          <thead><tr><th scope="col">Chave</th><th scope="col">Cliente</th><th scope="col">Situação</th><th scope="col">Vence</th><th scope="col">Números</th></tr></thead>
          <tbody>
            {visible.map((license) => <tr key={license.id} className={license.id === selectedId ? 'table__row--selected' : ''}>
              <td><button type="button" className="link-button table__code" onClick={() => setSelectedId(license.id)}>{license.code}</button>{!license.delivered_at && <span className="tag">a entregar</span>}</td>
              <td>{license.buyer_name || formatPhone(license.buyer_phone)}<small className="table__sub">{license.plan?.name ?? 'Sem plano'} · {license.source === 'cakto' ? 'Cakto' : 'Manual'}</small></td>
              <td><StatusBadge status={effectiveStatus(license)} /></td>
              <td>{formatDate(license.expires_at)}</td>
              <td>{license.activations.length}/{license.max_numbers}</td>
            </tr>)}
          </tbody>
        </table>}
      </div>
      {selected && <LicenseDetail key={selected.id} license={selected} onChanged={handleChanged} onClose={() => setSelectedId(null)} />}
    </div>
  </section>;
};
