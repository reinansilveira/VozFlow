import { useEffect, useState, type ReactElement } from 'react';
import { Icon } from '../../../shared/components/Icon';
import { Switch } from '../../../shared/components/Switch';
import type { AutomationState } from '../../../shared/hooks/use-automation';
import type { ScheduleLibrary } from '../../../shared/services/schedule-builder';
import type { AutomationTrigger } from '../../../shared/types';
import { automationLimits } from '../../../shared/utils/automation-rules';
import { buildTriggerFromForm, createEmptyTriggerForm, triggerToForm, type TriggerForm } from '../../../shared/utils/trigger-form';

type TriggersPanelProps = {
  automation: AutomationState;
  library: ScheduleLibrary;
  onNotice: (message: string, isError?: boolean) => void;
};

const formatDateTime = (timestamp: number): string => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(timestamp);

export const TriggersPanel = ({ automation, library, onNotice }: TriggersPanelProps): ReactElement => {
  const { triggers, flows, settings, firedToday, runCommand } = automation;
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationTrigger | undefined>();
  const [form, setForm] = useState<TriggerForm>(createEmptyTriggerForm);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(settings.triggerDailyLimit);

  useEffect(() => setDailyLimit(settings.triggerDailyLimit), [settings.triggerDailyLimit]);

  const update = (patch: Partial<TriggerForm>): void => setForm((current) => ({ ...current, ...patch }));
  const contentOptions = form.actionType === 'audio' ? library.audios : library.funnels;

  const openForm = (trigger?: AutomationTrigger): void => {
    setEditing(trigger);
    setForm(trigger ? triggerToForm(trigger) : createEmptyTriggerForm());
    setFormError('');
    setIsFormOpen(true);
  };

  const closeForm = (): void => {
    setIsFormOpen(false);
    setEditing(undefined);
    setFormError('');
  };

  const save = async (): Promise<void> => {
    const built = buildTriggerFromForm(form, editing, Date.now());
    if (!built.trigger) {
      setFormError(built.error);
      return;
    }
    const actionName = contentOptions.find((item) => item.id === form.contentId)?.name || 'o conteúdo escolhido';
    const confirmed = window.confirm(`Quando alguém enviar “${built.trigger.keywords.join('”, “')}”, o VozFlow vai enviar ${form.actionType === 'audio' ? 'o áudio' : 'o funil'} “${actionName}” automaticamente, no máximo uma vez a cada ${built.trigger.cooldownHours} h para a mesma conversa${built.trigger.allowGroups ? ', inclusive em grupos' : ''}.\n\nSalvar e ${built.trigger.enabled ? 'manter ligado' : 'manter desligado'}?`);
    if (!confirmed) return;
    setIsSaving(true);
    try {
      await runCommand({ type: 'AUTOMATION_SAVE_TRIGGER', trigger: built.trigger });
      onNotice(editing ? 'Gatilho atualizado.' : 'Gatilho criado e ligado.');
      closeForm();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o gatilho.');
    } finally {
      setIsSaving(false);
    }
  };

  const run = async (action: () => Promise<unknown>, success: string): Promise<void> => {
    try {
      await action();
      onNotice(success);
    } catch (actionError) {
      onNotice(actionError instanceof Error ? actionError.message : 'Não foi possível atualizar o gatilho.', true);
    }
  };

  const toggle = (trigger: AutomationTrigger, enabled: boolean): Promise<void> => run(
    () => runCommand({ type: 'AUTOMATION_SET_TRIGGER_ENABLED', triggerId: trigger.id, enabled }),
    enabled ? `Gatilho “${trigger.name}” ligado.` : `Gatilho “${trigger.name}” desligado.`,
  );

  const remove = (trigger: AutomationTrigger): void => {
    if (!window.confirm(`Excluir o gatilho “${trigger.name}”?`)) return;
    void run(() => runCommand({ type: 'AUTOMATION_DELETE_TRIGGER', triggerId: trigger.id }), 'Gatilho excluído.');
  };

  const saveDailyLimit = (): void => {
    void run(() => runCommand({ type: 'AUTOMATION_SAVE_SETTINGS', settings: { ...settings, triggerDailyLimit: dailyLimit } }), 'Limite diário atualizado.');
  };

  return <>
    <div className="automation__toolbar">
      <p><strong>{firedToday}</strong> de <strong>{settings.triggerDailyLimit}</strong> disparos hoje</p>
      <label className="automation__inline-field">Limite diário<input type="number" aria-label="Limite diário de disparos de gatilhos" min={automationLimits.triggerDailyLimit.min} max={automationLimits.triggerDailyLimit.max} value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value))} /></label>
      <button type="button" className="button" disabled={dailyLimit === settings.triggerDailyLimit} onClick={saveDailyLimit}>Salvar limite</button>
      <button type="button" className="button button--primary" onClick={() => (isFormOpen ? closeForm() : openForm())}><Icon name={isFormOpen ? 'close' : 'plus'} />{isFormOpen ? 'Fechar' : 'Novo gatilho'}</button>
    </div>

    {isFormOpen && <section className="schedule-form" aria-labelledby="trigger-form-title">
      <header className="schedule-form__heading"><div><span><Icon name="bolt" /></span><div><h3 id="trigger-form-title">{editing ? 'Editar gatilho' : 'Novo gatilho'}</h3><p>Responda automaticamente quando receber uma palavra-chave.</p></div></div></header>
      <div className="schedule-form__grid">
        <label className="schedule-field schedule-field--wide">Nome<input value={form.name} placeholder="Ex.: Pergunta de preço" onChange={(event) => update({ name: event.target.value })} /></label>
        <label className="schedule-field schedule-field--wide">Palavras-chave<textarea rows={2} value={form.keywords} placeholder="preço, valor, quanto custa" onChange={(event) => update({ keywords: event.target.value })} /><small>Separe por vírgula. Acentos e maiúsculas não importam.</small></label>
        <label className="schedule-field">Quando disparar<select value={form.matchMode} onChange={(event) => update({ matchMode: event.target.value as TriggerForm['matchMode'] })}><option value="contains">Mensagem contém a palavra</option><option value="exact">Mensagem é exatamente a palavra</option></select></label>
        <label className="schedule-field">Ação<select value={form.actionType} onChange={(event) => update({ actionType: event.target.value as TriggerForm['actionType'], contentId: '' })}><option value="audio">Enviar um áudio</option><option value="funnel">Iniciar um funil</option></select></label>
        <label className="schedule-field schedule-field--wide">{form.actionType === 'audio' ? 'Áudio' : 'Funil'}<select value={form.contentId} onChange={(event) => update({ contentId: event.target.value })}><option value="">{contentOptions.length ? 'Escolha um item da biblioteca' : form.actionType === 'audio' ? 'Nenhum áudio salvo ainda' : 'Nenhum funil salvo ainda'}</option>{contentOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="schedule-field">Atraso da resposta<input type="number" min={automationLimits.replyDelaySeconds.min} max={automationLimits.replyDelaySeconds.max} value={form.replyDelaySeconds} onChange={(event) => update({ replyDelaySeconds: Number(event.target.value) })} /><small>Segundos, com “gravando…” ou “digitando…”.</small></label>
        <label className="schedule-field">Não repetir por<input type="number" min={automationLimits.cooldownHours.min} max={automationLimits.cooldownHours.max} value={form.cooldownHours} onChange={(event) => update({ cooldownHours: Number(event.target.value) })} /><small>Horas, para a mesma conversa.</small></label>
        <label className="schedule-field">Tag do contato<input value={form.tag} placeholder="Opcional, ex.: interessado" onChange={(event) => update({ tag: event.target.value })} /></label>
        <label className="schedule-field">Depois, inscrever no fluxo<select value={form.remarketingFlowId} onChange={(event) => update({ remarketingFlowId: event.target.value })}><option value="">Nenhum</option>{flows.map((flow) => <option key={flow.id} value={flow.id}>{flow.name}</option>)}</select></label>
        <label className="schedule-check schedule-field--wide"><input type="checkbox" checked={form.allowGroups} onChange={(event) => update({ allowGroups: event.target.checked })} /><span>Responder também em grupos (desligado por padrão)</span></label>
      </div>
      {formError && <div className="schedule-form__errors" role="alert"><Icon name="warning" /><div><p>{formError}</p></div></div>}
      <footer className="schedule-form__actions"><button type="button" className="button" onClick={closeForm}>Cancelar</button><button type="button" className="button button--primary" disabled={isSaving} onClick={() => void save()}><Icon name="check" />{isSaving ? 'Salvando...' : 'Salvar gatilho'}</button></footer>
    </section>}

    {triggers.length === 0 && !isFormOpen && <div className="schedule-empty"><span><Icon name="bolt" /></span><h3>Nenhum gatilho ainda</h3><p>Crie um gatilho para responder com um áudio ou funil quando receber uma palavra-chave.</p><button type="button" className="button button--primary" onClick={() => openForm()}>Criar primeiro gatilho</button></div>}
    {triggers.length > 0 && <div className="campaign-list">{triggers.map((trigger) => <TriggerCard key={trigger.id} trigger={trigger} library={library} onToggle={(enabled) => void toggle(trigger, enabled)} onEdit={() => openForm(trigger)} onDelete={() => remove(trigger)} />)}</div>}
  </>;
};

type TriggerCardProps = {
  trigger: AutomationTrigger;
  library: ScheduleLibrary;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
};

const TriggerCard = ({ trigger, library, onToggle, onEdit, onDelete }: TriggerCardProps): ReactElement => {
  const content = trigger.action.type === 'audio'
    ? library.audios.find((item) => item.id === trigger.action.contentId)
    : library.funnels.find((item) => item.id === trigger.action.contentId);
  const actionLabel = `${trigger.action.type === 'audio' ? 'Áudio' : 'Funil'} · ${content?.name || 'item removido da biblioteca'}`;

  return <article className={`campaign-card automation-card ${trigger.enabled ? '' : 'automation-card--off'}`}>
    <header className="campaign-card__heading">
      <div><span className={`campaign-card__status campaign-card__status--${trigger.enabled ? 'scheduled' : 'paused'}`}>{trigger.enabled ? 'Ligado' : 'Desligado'}</span><h3>{trigger.name}</h3><p>{actionLabel}</p></div>
      <Switch checked={trigger.enabled} label={trigger.enabled ? `Desligar ${trigger.name}` : `Ligar ${trigger.name}`} onChange={onToggle} />
    </header>
    <ul className="automation-card__keywords" aria-label="Palavras-chave">{trigger.keywords.map((keyword) => <li key={keyword}>{keyword}</li>)}</ul>
    <div className="campaign-card__meta"><span><Icon name="clock" />1× a cada {trigger.cooldownHours} h</span><span><Icon name="send" />{trigger.fireCount} disparos</span>{trigger.lastFiredAt && <span><Icon name="calendar" />{formatDateTime(trigger.lastFiredAt)}</span>}{trigger.allowGroups && <span><Icon name="user" />Grupos</span>}{trigger.tag && <span><Icon name="target" />{trigger.tag}</span>}</div>
    {!content && <p className="automation-card__error" role="alert"><Icon name="warning" />O conteúdo deste gatilho foi removido. Edite e escolha outro.</p>}
    {trigger.lastError && <p className="automation-card__error"><Icon name="warning" />Último erro: {trigger.lastError}</p>}
    <footer className="campaign-card__actions"><button type="button" className="button" onClick={onEdit}><Icon name="edit" />Editar</button><button type="button" className="button button--danger" onClick={onDelete}><Icon name="trash" />Excluir</button></footer>
  </article>;
};
