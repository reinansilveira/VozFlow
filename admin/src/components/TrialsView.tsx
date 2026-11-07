import { useState, type FormEvent, type ReactElement } from 'react';
import { useAction } from '../hooks/use-action';
import { useResource } from '../hooks/use-resource';
import { fetchTrials, invokeAdmin } from '../services/admin-api';
import type { Trial } from '../types';
import { formatDateTime, formatPhone } from '../utils/format';
import { Feedback } from './Feedback';
import { StateMessage } from './StateMessage';

const trialState = (trial: Trial): string => {
  if (trial.ended_by_admin) return 'Encerrado pelo admin';
  return Date.parse(trial.ends_at) > Date.now() ? 'Em andamento' : 'Terminou';
};

export const TrialsView = ({ onChanged }: { onChanged: () => void }): ReactElement => {
  const trials = useResource(fetchTrials);
  const action = useAction();
  const [phone, setPhone] = useState('');
  const [days, setDays] = useState(3);

  const runAndReload = async (task: () => Promise<unknown>, success: string): Promise<void> => {
    if (await action.run(task, success)) {
      void trials.reload();
      onChanged();
    }
  };

  const grant = (event: FormEvent): void => {
    event.preventDefault();
    void runAndReload(() => invokeAdmin('grantTrial', { phone, days }), `Teste de ${days} dia(s) concedido.`);
  };

  const end = (trial: Trial): void => {
    if (!window.confirm(`Encerrar o teste de ${formatPhone(trial.phone)} agora?`)) return;
    void runAndReload(() => invokeAdmin('endTrial', { phone: trial.phone }), 'Teste encerrado.');
  };

  return <section className="view">
    <header className="view__header"><h1>Testes grátis</h1></header>
    <form className="panel-card inline-form" onSubmit={grant}>
      <label className="field">WhatsApp (com DDI)<input inputMode="tel" required placeholder="5579999999999" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <label className="field">Dias<input type="number" min={1} max={30} value={days} onChange={(event) => setDays(Number(event.target.value))} /></label>
      <button type="submit" className="button button--primary" disabled={action.isBusy}>Conceder teste</button>
    </form>
    <Feedback feedback={action.feedback} />
    <div className="panel-card table-wrap">
      <StateMessage isLoading={trials.isLoading && !trials.data} error={trials.error} isEmpty={!trials.data?.length} emptyText="Nenhum teste iniciado ainda." onRetry={() => void trials.reload()} />
      {!!trials.data?.length && <table className="table">
        <thead><tr><th scope="col">Número</th><th scope="col">Início</th><th scope="col">Fim</th><th scope="col">Situação</th><th scope="col"><span className="visually-hidden">Ações</span></th></tr></thead>
        <tbody>
          {trials.data.map((trial) => <tr key={trial.phone}>
            <td>{formatPhone(trial.phone)}</td>
            <td>{formatDateTime(trial.started_at)}</td>
            <td>{formatDateTime(trial.ends_at)}</td>
            <td>{trialState(trial)}</td>
            <td>{trialState(trial) === 'Em andamento' && <button type="button" className="button button--ghost" disabled={action.isBusy} onClick={() => end(trial)}>Encerrar</button>}</td>
          </tr>)}
        </tbody>
      </table>}
    </div>
  </section>;
};
