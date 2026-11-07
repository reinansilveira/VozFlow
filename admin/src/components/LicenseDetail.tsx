import { useCallback, useState, type ReactElement } from 'react';
import { useAction } from '../hooks/use-action';
import { useResource } from '../hooks/use-resource';
import { fetchAudit, invokeAdmin } from '../services/admin-api';
import type { License, LicenseStatus } from '../types';
import { actionLabel, addDays, deliveryMessage, describeDetails, effectiveStatus, formatDate, formatDateTime, formatPhone, whatsappLink } from '../utils/format';
import { Feedback } from './Feedback';
import { StatusBadge } from './StatusBadge';

type LicenseDetailProps = { license: License; onChanged: () => void; onClose: () => void };

const statusActions: Array<{ status: LicenseStatus; label: string; done: string; confirm?: string; tone?: 'danger' }> = [
  { status: 'ativa', label: 'Reativar', done: 'Licença reativada.' },
  { status: 'suspensa', label: 'Suspender', done: 'Licença suspensa.' },
  { status: 'revogada', label: 'Revogar', done: 'Licença revogada.', tone: 'danger', confirm: 'Revogar esta licença? O cliente perde o acesso na próxima verificação.' },
];

const History = ({ licenseId, refreshKey }: { licenseId: string; refreshKey: number }): ReactElement => {
  // refreshKey recarrega o histórico depois de cada ação.
  const load = useCallback(() => fetchAudit(licenseId), [licenseId, refreshKey]);
  const { data, isLoading, error } = useResource(load);
  if (isLoading) return <p className="state-message">Carregando histórico...</p>;
  if (error) return <p className="state-message state-message--error">{error}</p>;
  if (!data?.length) return <p className="state-message">Sem registros.</p>;
  return <ol className="history">
    {data.map((entry) => <li key={entry.id} className="history__item">
      <span className="history__action">{actionLabel(entry.action)}</span>
      {describeDetails(entry.details) && <span className="history__details">{describeDetails(entry.details)}</span>}
      <span className="history__meta">{formatDateTime(entry.created_at)} · {entry.actor}{entry.phone ? ` · ${formatPhone(entry.phone)}` : ''}</span>
    </li>)}
  </ol>;
};

export const LicenseDetail = ({ license, onChanged, onClose }: LicenseDetailProps): ReactElement => {
  const action = useAction();
  const [note, setNote] = useState(license.note ?? '');
  const [maxNumbers, setMaxNumbers] = useState(license.max_numbers);
  const [refreshKey, setRefreshKey] = useState(0);
  const status = effectiveStatus(license);

  const update = async (changes: Record<string, unknown>, success: string): Promise<void> => {
    const ok = await action.run(() => invokeAdmin('updateLicense', { licenseId: license.id, ...changes }), success);
    if (ok) {
      setRefreshKey((value) => value + 1);
      onChanged();
    }
  };

  const changeStatus = (next: (typeof statusActions)[number]): void => {
    if (next.confirm && !window.confirm(next.confirm)) return;
    void update({ status: next.status }, next.done);
  };

  const unbind = async (phone: string): Promise<void> => {
    if (!window.confirm(`Desvincular ${formatPhone(phone)}? O número perde o acesso e libera uma vaga na chave.`)) return;
    const ok = await action.run(() => invokeAdmin('unbindNumber', { licenseId: license.id, phone }), 'Número desvinculado.');
    if (ok) {
      setRefreshKey((value) => value + 1);
      onChanged();
    }
  };

  const copyKey = async (): Promise<void> => {
    await action.run(() => navigator.clipboard.writeText(license.code), 'Chave copiada.');
  };

  return <aside className="detail" aria-label={`Licença ${license.code}`}>
    <header className="detail__header">
      <div>
        <h2 className="detail__code">{license.code}</h2>
        <p className="detail__meta"><StatusBadge status={status} /> {license.plan?.name ?? 'Sem plano'} · vence {formatDate(license.expires_at)}</p>
      </div>
      <button type="button" className="button button--ghost" onClick={onClose} aria-label="Fechar detalhes">Fechar</button>
    </header>

    <section className="detail__section">
      <h3>Entrega</h3>
      <p className="detail__text">{license.buyer_name || 'Cliente sem nome'} · {formatPhone(license.buyer_phone)} · {license.buyer_email || 'sem e-mail'}</p>
      <p className="detail__text">{license.delivered_at ? `Entregue em ${formatDateTime(license.delivered_at)}` : 'Chave ainda não entregue.'}</p>
      <div className="button-row">
        <button type="button" className="button" onClick={() => void copyKey()}>Copiar chave</button>
        {license.buyer_phone && <a className="button" href={whatsappLink(license.buyer_phone, deliveryMessage(license))} target="_blank" rel="noreferrer">Enviar pelo WhatsApp</a>}
        <button type="button" className="button" disabled={action.isBusy} onClick={() => void update({ delivered: !license.delivered_at }, license.delivered_at ? 'Entrega desmarcada.' : 'Marcada como entregue.')}>{license.delivered_at ? 'Desmarcar entrega' : 'Marcar como entregue'}</button>
      </div>
    </section>

    <section className="detail__section">
      <h3>Situação e validade</h3>
      <div className="button-row">
        {statusActions.filter((item) => item.status !== license.status).map((item) => <button key={item.status} type="button" className={`button ${item.tone === 'danger' ? 'button--danger' : ''}`} disabled={action.isBusy} onClick={() => changeStatus(item)}>{item.label}</button>)}
        <button type="button" className="button" disabled={action.isBusy} onClick={() => void update({ expiresAt: addDays(license.expires_at, 30) }, 'Validade estendida em 30 dias.')}>+30 dias</button>
        <button type="button" className="button" disabled={action.isBusy} onClick={() => void update({ expiresAt: addDays(license.expires_at, 365) }, 'Validade estendida em 1 ano.')}>+1 ano</button>
      </div>
      <div className="inline-form">
        <label className="field">Limite de números<input type="number" min={1} max={50} value={maxNumbers} onChange={(event) => setMaxNumbers(Number(event.target.value))} /></label>
        <button type="button" className="button" disabled={action.isBusy || maxNumbers === license.max_numbers} onClick={() => void update({ maxNumbers }, 'Limite atualizado.')}>Salvar limite</button>
      </div>
      <div className="inline-form">
        <label className="field">Observação<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <button type="button" className="button" disabled={action.isBusy || note === (license.note ?? '')} onClick={() => void update({ note }, 'Observação salva.')}>Salvar</button>
      </div>
      <Feedback feedback={action.feedback} />
    </section>

    <section className="detail__section">
      <h3>Números vinculados ({license.activations.length}/{license.max_numbers})</h3>
      {license.activations.length === 0 ? <p className="state-message">Nenhum número ativou esta chave ainda.</p> : <ul className="numbers">
        {license.activations.map((activation) => <li key={activation.phone} className="numbers__item">
          <span><strong>{formatPhone(activation.phone)}</strong><small>Ativado em {formatDateTime(activation.activated_at)} · visto em {formatDateTime(activation.last_seen_at)}</small></span>
          <button type="button" className="button button--ghost" disabled={action.isBusy} onClick={() => void unbind(activation.phone)}>Desvincular</button>
        </li>)}
      </ul>}
    </section>

    <section className="detail__section">
      <h3>Histórico</h3>
      <History licenseId={license.id} refreshKey={refreshKey} />
    </section>
  </aside>;
};
