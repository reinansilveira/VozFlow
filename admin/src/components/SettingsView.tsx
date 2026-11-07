import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useAction } from '../hooks/use-action';
import { useResource } from '../hooks/use-resource';
import { fetchSettings, invokeAdmin } from '../services/admin-api';
import type { Settings } from '../types';
import { Feedback } from './Feedback';
import { StateMessage } from './StateMessage';

const numberFields: Array<{ key: Exclude<keyof Settings, 'min_extension_version'>; label: string; min: number; max: number }> = [
  { key: 'trial_days', label: 'Dias de teste grátis', min: 1, max: 30 },
  { key: 'pass_hours', label: 'Validade do passe sem internet (horas)', min: 1, max: 720 },
  { key: 'grace_days', label: 'Tolerância após o vencimento (dias)', min: 0, max: 30 },
  { key: 'trials_per_installation', label: 'Testes por computador', min: 1, max: 10 },
];

export const SettingsView = (): ReactElement => {
  const settings = useResource(fetchSettings);
  const action = useAction();
  const [draft, setDraft] = useState<Settings | null>(null);

  useEffect(() => { if (settings.data) setDraft(settings.data); }, [settings.data]);

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!draft) return;
    const ok = await action.run(() => invokeAdmin('saveSettings', {
      trialDays: draft.trial_days,
      passHours: draft.pass_hours,
      graceDays: draft.grace_days,
      trialsPerInstallation: draft.trials_per_installation,
      minExtensionVersion: draft.min_extension_version,
    }), 'Configurações salvas.');
    if (ok) void settings.reload();
  };

  return <section className="view">
    <header className="view__header"><h1>Configurações</h1></header>
    <StateMessage isLoading={settings.isLoading && !settings.data} error={settings.error} isEmpty={false} emptyText="" onRetry={() => void settings.reload()} />
    {draft && <form className="panel-card form-grid" onSubmit={(event) => void save(event)}>
      {numberFields.map((field) => <label key={field.key} className="field">{field.label}<input type="number" min={field.min} max={field.max} value={draft[field.key]} onChange={(event) => setDraft({ ...draft, [field.key]: Number(event.target.value) })} /></label>)}
      <label className="field">Versão mínima da extensão<input pattern="\d+(\.\d+){0,3}" value={draft.min_extension_version} onChange={(event) => setDraft({ ...draft, min_extension_version: event.target.value })} /></label>
      <div className="form-grid__actions"><button type="submit" className="button button--primary" disabled={action.isBusy}>Salvar</button><Feedback feedback={action.feedback} /></div>
    </form>}
  </section>;
};
