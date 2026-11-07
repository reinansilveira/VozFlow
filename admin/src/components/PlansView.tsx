import { useState, type FormEvent, type ReactElement } from 'react';
import { useAction } from '../hooks/use-action';
import { useResource } from '../hooks/use-resource';
import { fetchPlans, invokeAdmin } from '../services/admin-api';
import type { Plan } from '../types';
import { Feedback } from './Feedback';
import { StateMessage } from './StateMessage';

type Draft = { id?: string; name: string; periodDays: number; maxNumbers: number; caktoOfferId: string; active: boolean };

const emptyDraft: Draft = { name: '', periodDays: 30, maxNumbers: 1, caktoOfferId: '', active: true };
const toDraft = (plan: Plan): Draft => ({
  id: plan.id, name: plan.name, periodDays: plan.period_days, maxNumbers: plan.max_numbers, caktoOfferId: plan.cakto_offer_id ?? '', active: plan.active,
});

export const PlansView = (): ReactElement => {
  const plans = useResource(fetchPlans);
  const action = useAction();
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (await action.run(() => invokeAdmin('savePlan', draft), 'Plano salvo.')) {
      setDraft(emptyDraft);
      void plans.reload();
    }
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => setDraft((current) => ({ ...current, [key]: value }));

  return <section className="view">
    <header className="view__header"><h1>Planos</h1></header>
    <p className="view__intro">Cada oferta da Cakto (mensal ou anual) precisa estar ligada a um plano para a compra gerar a chave.</p>
    <form className="panel-card form-grid" onSubmit={(event) => void save(event)}>
      <h2 className="form-grid__title">{draft.id ? `Editar ${draft.name}` : 'Novo plano'}</h2>
      <label className="field">Nome<input required value={draft.name} placeholder="Mensal" onChange={(event) => set('name', event.target.value)} /></label>
      <label className="field">Período (dias)<input type="number" min={1} max={3660} value={draft.periodDays} onChange={(event) => set('periodDays', Number(event.target.value))} /></label>
      <label className="field">Limite de números<input type="number" min={1} max={50} value={draft.maxNumbers} onChange={(event) => set('maxNumbers', Number(event.target.value))} /></label>
      <label className="field">ID da oferta na Cakto<input value={draft.caktoOfferId} placeholder="Ex.: a8BcHrY" onChange={(event) => set('caktoOfferId', event.target.value)} /></label>
      <label className="checkbox"><input type="checkbox" checked={draft.active} onChange={(event) => set('active', event.target.checked)} />Plano ativo</label>
      <div className="form-grid__actions">
        <button type="submit" className="button button--primary" disabled={action.isBusy}>Salvar plano</button>
        {draft.id && <button type="button" className="button button--ghost" onClick={() => setDraft(emptyDraft)}>Cancelar edição</button>}
        <Feedback feedback={action.feedback} />
      </div>
    </form>
    <div className="panel-card table-wrap">
      <StateMessage isLoading={plans.isLoading && !plans.data} error={plans.error} isEmpty={!plans.data?.length} emptyText="Nenhum plano cadastrado. Crie o mensal e o anual." onRetry={() => void plans.reload()} />
      {!!plans.data?.length && <table className="table">
        <thead><tr><th scope="col">Plano</th><th scope="col">Período</th><th scope="col">Números</th><th scope="col">Oferta Cakto</th><th scope="col"><span className="visually-hidden">Ações</span></th></tr></thead>
        <tbody>
          {plans.data.map((plan) => <tr key={plan.id}>
            <td>{plan.name}{!plan.active && <span className="tag">inativo</span>}</td>
            <td>{plan.period_days} dias</td>
            <td>{plan.max_numbers}</td>
            <td>{plan.cakto_offer_id || <span className="tag tag--warning">sem oferta</span>}</td>
            <td><button type="button" className="button button--ghost" onClick={() => setDraft(toDraft(plan))}>Editar</button></td>
          </tr>)}
        </tbody>
      </table>}
    </div>
  </section>;
};
