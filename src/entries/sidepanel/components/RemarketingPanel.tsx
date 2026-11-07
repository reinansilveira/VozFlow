import { useMemo, useState, type ReactElement } from 'react';
import { Icon } from '../../../shared/components/Icon';
import { Switch } from '../../../shared/components/Switch';
import type { AutomationState } from '../../../shared/hooks/use-automation';
import { buildStepsFromSources, type ScheduleLibrary } from '../../../shared/services/schedule-builder';
import type { ActiveChatContext, EnrollmentResult, FunnelStep, KnownContact, MediaType, ScheduledCampaign, ScheduledDelivery } from '../../../shared/types';
import { automationLimits } from '../../../shared/utils/automation-rules';
import {
  collectContactTags,
  delayUnitLabel,
  filterReactivationContacts,
  formatDelay,
  fromDelayParts,
  getEnrollmentLabel,
  summarizeEnrollments,
  toDelayParts,
  validateFlowSources,
  type DelayUnit,
} from '../../../shared/utils/automation-view';
import { serializeScheduledCampaign } from '../../../shared/utils/message-transport';
import { isActiveDelivery } from '../../../shared/utils/remarketing';

type RemarketingPanelProps = {
  automation: AutomationState;
  library: ScheduleLibrary;
  activeChat: ActiveChatContext;
  onNotice: (message: string, isError?: boolean) => void;
};

type FlowForm = { name: string; steps: FunnelStep[]; dailyLimit: number; intervalMinutes: number };

const createEmptyFlowForm = (): FlowForm => ({ name: '', steps: [{ type: 'text', text: '', delaySeconds: 86_400 }], dailyLimit: 20, intervalMinutes: 10 });

const describeEnrollment = (result: EnrollmentResult | undefined): string => {
  if (!result) return 'Inscrição concluída.';
  const skipped = result.skipped.length ? ` ${result.skipped.length} ignorado(s): ${result.skipped[0].reason}` : '';
  return `${result.enrolled} contato(s) inscrito(s).${skipped}`;
};

export const RemarketingPanel = ({ automation, library, activeChat, onNotice }: RemarketingPanelProps): ReactElement => {
  const { flows, enrollments, contacts, runCommand } = automation;
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledCampaign | undefined>();
  const [form, setForm] = useState<FlowForm>(createEmptyFlowForm);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const openForm = (flow?: ScheduledCampaign): void => {
    setEditing(flow);
    setForm(flow ? { name: flow.name, steps: (flow.stepSources ?? []).map((step) => ({ ...step })), dailyLimit: flow.dailyLimit, intervalMinutes: flow.intervalMinutes } : createEmptyFlowForm());
    setFormError('');
    setIsFormOpen(true);
  };

  const closeForm = (): void => {
    setIsFormOpen(false);
    setEditing(undefined);
  };

  const updateStep = (index: number, patch: Partial<FunnelStep>): void => setForm((current) => ({ ...current, steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step) }));

  const save = async (): Promise<void> => {
    const sourceError = !form.name.trim() ? 'Dê um nome ao fluxo.' : validateFlowSources(form.steps);
    if (sourceError) return setFormError(sourceError);
    try {
      const steps = buildStepsFromSources(form.steps, library, `do fluxo “${form.name.trim()}”`);
      const now = Date.now();
      const flow: ScheduledCampaign = {
        id: editing?.id || crypto.randomUUID(),
        kind: 'remarketing',
        name: form.name.trim(),
        contentName: form.name.trim(),
        contentType: 'funnel',
        steps,
        stepSources: form.steps,
        status: editing?.status ?? 'scheduled',
        recipientCount: editing?.recipientCount ?? 0,
        dailyLimit: Math.min(automationLimits.flowDailyLimit.max, Math.max(automationLimits.flowDailyLimit.min, Math.floor(form.dailyLimit))),
        intervalMinutes: Math.min(automationLimits.flowIntervalMinutes.max, Math.max(automationLimits.flowIntervalMinutes.min, Math.floor(form.intervalMinutes))),
        weekdaysOnly: false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
        startsAt: editing?.startsAt ?? now,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      };
      setIsSaving(true);
      await runCommand({ type: 'AUTOMATION_SAVE_FLOW', campaign: serializeScheduledCampaign(flow) });
      onNotice(editing ? 'Fluxo atualizado.' : 'Fluxo criado. Inscreva contatos para começar.');
      closeForm();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o fluxo.');
    } finally {
      setIsSaving(false);
    }
  };

  const run = async (action: () => Promise<unknown>, success: string | ((result: unknown) => string)): Promise<void> => {
    try {
      const result = await action();
      onNotice(typeof success === 'string' ? success : success(result));
    } catch (actionError) {
      onNotice(actionError instanceof Error ? actionError.message : 'Não foi possível atualizar o fluxo.', true);
    }
  };

  const enrollActiveChat = (flow: ScheduledCampaign): void => {
    if (!activeChat.chatId) return onNotice('Abra uma conversa no WhatsApp e tente novamente.', true);
    if (!window.confirm(`Inscrever “${activeChat.chatName}” no fluxo “${flow.name}”? O contato sai do fluxo quando responder.`)) return;
    void run(() => runCommand<EnrollmentResult>({ type: 'AUTOMATION_ENROLL', flowId: flow.id, chatIds: [activeChat.chatId], source: 'manual' }), (result) => describeEnrollment(result as EnrollmentResult));
  };

  const enrollContacts = async (flow: ScheduledCampaign, chatIds: string[]): Promise<void> => {
    if (!window.confirm(`Inscrever ${chatIds.length} contato(s) no fluxo “${flow.name}”?\n\nNo máximo ${flow.dailyLimit} pessoa(s) por dia, com ${flow.intervalMinutes} min entre pessoas. Quem responder sai do fluxo.`)) return;
    await run(() => runCommand<EnrollmentResult>({ type: 'AUTOMATION_ENROLL', flowId: flow.id, chatIds, source: 'reactivation' }), (result) => describeEnrollment(result as EnrollmentResult));
  };

  const remove = (flow: ScheduledCampaign): void => {
    if (!window.confirm(`Excluir o fluxo “${flow.name}” e todas as inscrições?`)) return;
    void run(() => runCommand({ type: 'AUTOMATION_DELETE_FLOW', flowId: flow.id }), 'Fluxo excluído.');
  };

  const mediaOptions = (type: MediaType): Array<{ id: string; name: string }> => type === 'audio' ? library.audios : type === 'image' ? library.images : type === 'document' ? library.documents : [];

  return <>
    <div className="automation__toolbar">
      <p>Só entram contatos que já enviaram mensagem. Quem responde sai do fluxo.</p>
      <button type="button" className="button button--primary" onClick={() => (isFormOpen ? closeForm() : openForm())}><Icon name={isFormOpen ? 'close' : 'plus'} />{isFormOpen ? 'Fechar' : 'Novo fluxo'}</button>
    </div>

    {isFormOpen && <section className="schedule-form" aria-labelledby="flow-form-title">
      <header className="schedule-form__heading"><div><span><Icon name="target" /></span><div><h3 id="flow-form-title">{editing ? 'Editar fluxo' : 'Novo fluxo de remarketing'}</h3><p>Sequência de follow-ups com intervalos.</p></div></div></header>
      <div className="schedule-form__grid">
        <label className="schedule-field schedule-field--wide">Nome<input value={form.name} placeholder="Ex.: Reativação de orçamentos" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
        {form.steps.map((step, index) => {
          const delay = toDelayParts(step.delaySeconds);
          return <fieldset key={index} className="automation-step schedule-field--wide">
            <legend>Etapa {index + 1} · {index === 0 ? 'depois da inscrição' : 'depois da etapa anterior'}</legend>
            <label className="schedule-field">Tipo<select value={step.type} onChange={(event) => updateStep(index, { type: event.target.value as MediaType, contentId: undefined, text: '' })}><option value="text">Texto</option><option value="audio">Áudio</option><option value="image">Imagem</option><option value="document">Documento</option></select></label>
            <label className="schedule-field">Esperar<input type="number" min="0" value={delay.value} onChange={(event) => updateStep(index, { delaySeconds: fromDelayParts(Number(event.target.value), delay.unit) })} /></label>
            <label className="schedule-field">Unidade<select value={delay.unit} onChange={(event) => updateStep(index, { delaySeconds: fromDelayParts(delay.value, event.target.value as DelayUnit) })}>{(Object.keys(delayUnitLabel) as DelayUnit[]).map((unit) => <option key={unit} value={unit}>{delayUnitLabel[unit]}</option>)}</select></label>
            {step.type === 'text'
              ? <label className="schedule-field schedule-field--wide">Mensagem<textarea rows={2} value={step.text || ''} onChange={(event) => updateStep(index, { text: event.target.value })} /></label>
              : <label className="schedule-field schedule-field--wide">Conteúdo<select value={step.contentId || ''} onChange={(event) => updateStep(index, { contentId: event.target.value })}><option value="">Escolha da biblioteca</option>{mediaOptions(step.type).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
            {form.steps.length > 1 && <button type="button" className="button button--danger" onClick={() => setForm((current) => ({ ...current, steps: current.steps.filter((_, stepIndex) => stepIndex !== index) }))}><Icon name="trash" />Remover etapa</button>}
          </fieldset>;
        })}
        <button type="button" className="button schedule-field--wide" onClick={() => setForm((current) => ({ ...current, steps: [...current.steps, { type: 'text', text: '', delaySeconds: 86_400 }] }))}><Icon name="plus" />Adicionar etapa</button>
        <label className="schedule-field">Pessoas por dia<input type="number" min={automationLimits.flowDailyLimit.min} max={automationLimits.flowDailyLimit.max} value={form.dailyLimit} onChange={(event) => setForm((current) => ({ ...current, dailyLimit: Number(event.target.value) }))} /></label>
        <label className="schedule-field">Intervalo entre pessoas<input type="number" min={automationLimits.flowIntervalMinutes.min} max={automationLimits.flowIntervalMinutes.max} value={form.intervalMinutes} onChange={(event) => setForm((current) => ({ ...current, intervalMinutes: Number(event.target.value) }))} /><small>Em minutos.</small></label>
      </div>
      {formError && <div className="schedule-form__errors" role="alert"><Icon name="warning" /><div><p>{formError}</p></div></div>}
      <footer className="schedule-form__actions"><button type="button" className="button" onClick={closeForm}>Cancelar</button><button type="button" className="button button--primary" disabled={isSaving} onClick={() => void save()}><Icon name="check" />{isSaving ? 'Salvando...' : 'Salvar fluxo'}</button></footer>
    </section>}

    {flows.length === 0 && !isFormOpen && <div className="schedule-empty"><span><Icon name="target" /></span><h3>Nenhum fluxo de remarketing</h3><p>Crie uma sequência de follow-ups para quem parou de responder.</p><button type="button" className="button button--primary" onClick={() => openForm()}>Criar primeiro fluxo</button></div>}
    {flows.length > 0 && <div className="campaign-list">{flows.map((flow) => <FlowCard
      key={flow.id}
      flow={flow}
      enrollments={enrollments.filter((delivery) => delivery.campaignId === flow.id)}
      contacts={contacts}
      onEnrollContacts={(chatIds) => enrollContacts(flow, chatIds)}
      canEnrollActiveChat={Boolean(activeChat.chatId)}
      onToggle={(enabled) => void run(() => runCommand({ type: 'AUTOMATION_SET_FLOW_ENABLED', flowId: flow.id, enabled }), enabled ? 'Fluxo ligado.' : 'Fluxo desligado.')}
      onEdit={() => openForm(flow)}
      onDelete={() => remove(flow)}
      onEnrollActiveChat={() => enrollActiveChat(flow)}
      onCancelEnrollment={(deliveryId) => void run(() => runCommand({ type: 'AUTOMATION_CANCEL_ENROLLMENT', deliveryId }), 'Inscrição cancelada.')}
    />)}</div>}
  </>;
};

type FlowCardProps = {
  flow: ScheduledCampaign;
  enrollments: ScheduledDelivery[];
  contacts: KnownContact[];
  onEnrollContacts: (chatIds: string[]) => Promise<void>;
  canEnrollActiveChat: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onEnrollActiveChat: () => void;
  onCancelEnrollment: (deliveryId: string) => void;
};

const FlowCard = ({ flow, enrollments, contacts, onEnrollContacts, canEnrollActiveChat, onToggle, onEdit, onDelete, onEnrollActiveChat, onCancelEnrollment }: FlowCardProps): ReactElement => {
  const isOn = flow.status === 'scheduled';
  const summary = summarizeEnrollments(enrollments);
  const [isReactivating, setIsReactivating] = useState(false);
  return <article className={`campaign-card automation-card ${isOn ? '' : 'automation-card--off'}`}>
    <header className="campaign-card__heading">
      <div><span className={`campaign-card__status campaign-card__status--${isOn ? 'scheduled' : 'paused'}`}>{isOn ? 'Ligado' : 'Desligado'}</span><h3>{flow.name}</h3><p>{flow.steps.length} etapa(s) · {flow.steps.map((step) => formatDelay(step.delaySeconds)).join(' → ')}</p></div>
      <Switch checked={isOn} label={isOn ? `Desligar ${flow.name}` : `Ligar ${flow.name}`} onChange={onToggle} />
    </header>
    <div className="campaign-card__meta"><span><Icon name="user" />{summary.active} ativos</span><span><Icon name="check" />{summary.finished} concluídos</span><span><Icon name="messages" />{summary.exited} saíram</span><span><Icon name="calendar" />{flow.dailyLimit}/dia</span><span><Icon name="clock" />{flow.intervalMinutes} min</span></div>
    {enrollments.length > 0 && <details className="campaign-card__deliveries"><summary>Ver inscritos</summary><div>{enrollments.map((delivery) => <div className="delivery-row" key={delivery.id}>
      <span className={`delivery-row__status delivery-row__status--${delivery.status}`} aria-hidden="true" />
      <div><strong>{delivery.recipient.name}</strong><small>{delivery.recipient.phone}</small>{delivery.lastError && delivery.status !== 'cancelled' && <em title={delivery.lastError}>{delivery.lastError}</em>}</div>
      <span>{getEnrollmentLabel(delivery)}</span>
      {isActiveDelivery(delivery) && !delivery.exitRequestedAt && <button type="button" className="button" onClick={() => onCancelEnrollment(delivery.id)}>Cancelar</button>}
    </div>)}</div></details>}
    {isReactivating && <ReactivationForm contacts={contacts} onCancel={() => setIsReactivating(false)} onSubmit={async (chatIds) => { await onEnrollContacts(chatIds); setIsReactivating(false); }} />}
    <footer className="campaign-card__actions"><button type="button" className="button button--primary" disabled={!canEnrollActiveChat} onClick={onEnrollActiveChat}><Icon name="plus" />Inscrever conversa aberta</button><button type="button" className="button" aria-expanded={isReactivating} onClick={() => setIsReactivating((current) => !current)}><Icon name="user" />Reativar contatos</button><button type="button" className="button" onClick={onEdit}><Icon name="edit" />Editar</button><button type="button" className="button button--danger" onClick={onDelete}><Icon name="trash" />Excluir</button></footer>
  </article>;
};

type ReactivationFormProps = {
  contacts: KnownContact[];
  onCancel: () => void;
  onSubmit: (chatIds: string[]) => Promise<void>;
};

const maxListedContacts = 100;

const ReactivationForm = ({ contacts, onCancel, onSubmit }: ReactivationFormProps): ReactElement => {
  const [tag, setTag] = useState('');
  const [inactiveDays, setInactiveDays] = useState(7);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const tags = useMemo(() => collectContactTags(contacts), [contacts]);
  const matches = useMemo(() => filterReactivationContacts(contacts, { tag, inactiveDays, now: Date.now() }).slice(0, maxListedContacts), [contacts, inactiveDays, tag]);
  const selectedIds = matches.filter((contact) => selected.has(contact.id)).map((contact) => contact.id);
  const allSelected = matches.length > 0 && selectedIds.length === matches.length;

  const toggle = (chatId: string): void => setSelected((current) => {
    const next = new Set(current);
    if (next.has(chatId)) next.delete(chatId);
    else next.add(chatId);
    return next;
  });

  return <section className="reactivation" aria-label="Reativar contatos">
    <div className="schedule-form__grid">
      <label className="schedule-field">Tag<select value={tag} onChange={(event) => setTag(event.target.value)}><option value="">Todas</option>{tags.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="schedule-field">Sem mensagens há pelo menos<input type="number" min="0" max="365" value={inactiveDays} onChange={(event) => setInactiveDays(Number(event.target.value))} /><small>Dias desde a última mensagem do contato.</small></label>
    </div>
    {contacts.length === 0 && <p className="reactivation__empty">O VozFlow ainda não conhece contatos. Eles aparecem aqui quando enviam mensagem ou quando você abre a conversa com o WhatsApp Web conectado.</p>}
    {contacts.length > 0 && matches.length === 0 && <p className="reactivation__empty">Nenhum contato corresponde aos filtros.</p>}
    {matches.length > 0 && <>
      <label className="schedule-check reactivation__all"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(matches.map((contact) => contact.id)))} /><span>Selecionar todos ({matches.length})</span></label>
      <ul className="reactivation__list">{matches.map((contact) => <li key={contact.id}><label className="schedule-check"><input type="checkbox" checked={selected.has(contact.id)} onChange={() => toggle(contact.id)} /><span><strong>{contact.name}</strong><small>{contact.phone || 'Contato do WhatsApp'}{contact.tags.length ? ` · ${contact.tags.join(', ')}` : ''}</small></span></label></li>)}</ul>
    </>}
    <footer className="schedule-form__actions"><button type="button" className="button" onClick={onCancel}>Cancelar</button><button type="button" className="button button--primary" disabled={!selectedIds.length} onClick={() => void onSubmit(selectedIds)}><Icon name="check" />Inscrever {selectedIds.length} contato(s)</button></footer>
  </section>;
};
