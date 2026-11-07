import type { ReactElement } from 'react';
import { useResource } from '../hooks/use-resource';
import { fetchEvents } from '../services/admin-api';
import { formatDateTime } from '../utils/format';
import { StateMessage } from './StateMessage';

const resultLabels: Record<string, string> = {
  licenca_criada: 'Licença criada',
  licenca_estendida: 'Validade estendida',
  licenca_suspensa: 'Licença suspensa',
  licenca_revogada: 'Licença revogada',
  renovacao_cancelada: 'Renovação cancelada',
  renovacao_retomada: 'Renovação retomada',
  sem_plano: 'Oferta sem plano',
  licenca_nao_encontrada: 'Licença não encontrada',
  ignorado: 'Ignorado',
};

const attentionResults = new Set(['sem_plano', 'licenca_nao_encontrada']);

export const EventsView = (): ReactElement => {
  const events = useResource(fetchEvents);
  return <section className="view">
    <header className="view__header">
      <h1>Eventos da Cakto</h1>
      <button type="button" className="button button--ghost" onClick={() => void events.reload()}>Atualizar</button>
    </header>
    <p className="view__intro">Últimos 100 avisos recebidos. "Oferta sem plano" indica uma oferta da Cakto ainda não ligada a um plano.</p>
    <div className="panel-card table-wrap">
      <StateMessage isLoading={events.isLoading && !events.data} error={events.error} isEmpty={!events.data?.length} emptyText="Nenhum evento recebido ainda." onRetry={() => void events.reload()} />
      {!!events.data?.length && <table className="table">
        <thead><tr><th scope="col">Recebido</th><th scope="col">Evento</th><th scope="col">Pedido</th><th scope="col">Oferta</th><th scope="col">Resultado</th></tr></thead>
        <tbody>
          {events.data.map((item) => <tr key={item.id}>
            <td>{formatDateTime(item.received_at)}</td>
            <td><code>{item.event}</code></td>
            <td className="table__mono">{item.order_id}</td>
            <td>{item.payload.offer?.name || item.payload.offer?.id || '—'}</td>
            <td><span className={`tag ${attentionResults.has(item.result ?? '') ? 'tag--warning' : ''}`}>{resultLabels[item.result ?? ''] ?? item.result ?? '—'}</span></td>
          </tr>)}
        </tbody>
      </table>}
    </div>
  </section>;
};
