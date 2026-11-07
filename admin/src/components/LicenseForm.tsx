import { useState, type FormEvent, type ReactElement } from 'react';
import { useAction } from '../hooks/use-action';
import { invokeAdmin } from '../services/admin-api';
import type { Plan } from '../types';
import { addDays } from '../utils/format';
import { Feedback } from './Feedback';

type LicenseFormProps = { plans: Plan[]; onCreated: () => void };

// Chave manual (cortesia, parceiros ou venda fora da Cakto).
export const LicenseForm = ({ plans, onCreated }: LicenseFormProps): ReactElement => {
  const [planId, setPlanId] = useState('');
  const [days, setDays] = useState(30);
  const [maxNumbers, setMaxNumbers] = useState(1);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [note, setNote] = useState('');
  const action = useAction();

  const choosePlan = (id: string): void => {
    setPlanId(id);
    const plan = plans.find((item) => item.id === id);
    if (plan) {
      setDays(plan.period_days);
      setMaxNumbers(plan.max_numbers);
    }
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const created = await action.run(() => invokeAdmin('createLicense', {
      planId: planId || null,
      expiresAt: days > 0 ? addDays(null, days) : null,
      maxNumbers,
      buyerName,
      buyerPhone,
      buyerEmail,
      note,
    }), 'Licença criada. Copie a chave na lista abaixo.');
    if (!created) return;
    setBuyerName('');
    setBuyerPhone('');
    setBuyerEmail('');
    setNote('');
    onCreated();
  };

  return <form className="panel-card form-grid" onSubmit={(event) => void handleSubmit(event)}>
    <h2 className="form-grid__title">Nova licença manual</h2>
    <label className="field">Plano<select value={planId} onChange={(event) => choosePlan(event.target.value)}>
      <option value="">Sem plano</option>
      {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
    </select></label>
    <label className="field">Validade (dias, 0 = sem vencimento)<input type="number" min={0} max={3660} value={days} onChange={(event) => setDays(Number(event.target.value))} /></label>
    <label className="field">Limite de números<input type="number" min={1} max={50} value={maxNumbers} onChange={(event) => setMaxNumbers(Number(event.target.value))} /></label>
    <label className="field">Nome do cliente<input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} /></label>
    <label className="field">WhatsApp do cliente (com DDI)<input inputMode="tel" placeholder="5579999999999" value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} /></label>
    <label className="field">E-mail do cliente<input type="email" value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} /></label>
    <label className="field form-grid__wide">Observação<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
    <div className="form-grid__actions"><button className="button button--primary" type="submit" disabled={action.isBusy}>{action.isBusy ? 'Criando...' : 'Criar licença'}</button><Feedback feedback={action.feedback} /></div>
  </form>;
};
