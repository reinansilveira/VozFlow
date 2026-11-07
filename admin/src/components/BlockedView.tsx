import { useState, type FormEvent, type ReactElement } from 'react';
import { useAction } from '../hooks/use-action';
import { useResource } from '../hooks/use-resource';
import { fetchBlocked, invokeAdmin } from '../services/admin-api';
import { formatDateTime, formatPhone } from '../utils/format';
import { Feedback } from './Feedback';
import { StateMessage } from './StateMessage';

export const BlockedView = ({ onChanged }: { onChanged: () => void }): ReactElement => {
  const blocked = useResource(fetchBlocked);
  const action = useAction();
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');

  const runAndReload = async (task: () => Promise<unknown>, success: string): Promise<void> => {
    if (await action.run(task, success)) {
      void blocked.reload();
      onChanged();
    }
  };

  const block = (event: FormEvent): void => {
    event.preventDefault();
    if (!window.confirm(`Bloquear ${phone}? O número não poderá testar nem ativar chaves.`)) return;
    void runAndReload(() => invokeAdmin('blockNumber', { phone, reason }), 'Número bloqueado.');
    setPhone('');
    setReason('');
  };

  return <section className="view">
    <header className="view__header"><h1>Números bloqueados</h1></header>
    <p className="view__intro">Números de reembolso e chargeback entram aqui automaticamente.</p>
    <form className="panel-card inline-form" onSubmit={block}>
      <label className="field">WhatsApp (com DDI)<input inputMode="tel" required placeholder="5579999999999" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <label className="field">Motivo<input value={reason} placeholder="Ex.: abuso do teste" onChange={(event) => setReason(event.target.value)} /></label>
      <button type="submit" className="button button--danger" disabled={action.isBusy}>Bloquear</button>
    </form>
    <Feedback feedback={action.feedback} />
    <div className="panel-card table-wrap">
      <StateMessage isLoading={blocked.isLoading && !blocked.data} error={blocked.error} isEmpty={!blocked.data?.length} emptyText="Nenhum número bloqueado." onRetry={() => void blocked.reload()} />
      {!!blocked.data?.length && <table className="table">
        <thead><tr><th scope="col">Número</th><th scope="col">Motivo</th><th scope="col">Desde</th><th scope="col"><span className="visually-hidden">Ações</span></th></tr></thead>
        <tbody>
          {blocked.data.map((item) => <tr key={item.phone}>
            <td>{formatPhone(item.phone)}</td>
            <td>{item.reason}</td>
            <td>{formatDateTime(item.created_at)}</td>
            <td><button type="button" className="button button--ghost" disabled={action.isBusy} onClick={() => void runAndReload(() => invokeAdmin('unblockNumber', { phone: item.phone }), 'Número desbloqueado.')}>Desbloquear</button></td>
          </tr>)}
        </tbody>
      </table>}
    </div>
  </section>;
};
