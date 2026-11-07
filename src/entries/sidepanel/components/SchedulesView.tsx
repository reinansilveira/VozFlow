import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Icon } from '../../../shared/components/Icon';
import { useSchedules } from '../../../shared/hooks/use-schedules';
import { buildScheduleContent, type ScheduleLibrary } from '../../../shared/services/schedule-builder';
import type { ActiveChatContext, CampaignStatus, DeliveryStatus, ScheduleRecipient, ScheduledCampaign, ScheduledDelivery } from '../../../shared/types';
import { distributeRecipientDates, getDefaultScheduleStart, parseScheduleRecipients, toLocalDateTimeValue } from '../../../shared/utils/schedule-utils';
import { isTransientScheduleError } from '../../../shared/utils/schedule-retry';
import { isRemarketingCampaign } from '../../../shared/utils/remarketing';
import { normalizeWhatsAppErrorMessage } from '../../../shared/utils/whatsapp-error';
import { serializeScheduledCampaign } from '../../../shared/utils/message-transport';

type SchedulesViewProps = ScheduleLibrary & {
  activeChat: ActiveChatContext;
  onNotice: (message: string, isError?: boolean) => void;
};

type ScheduleForm = {
  name: string;
  contentKey: string;
  recipients: string;
  startsAt: string;
  dailyLimit: number;
  intervalMinutes: number;
  weekdaysOnly: boolean;
};

const createEmptyForm = (): ScheduleForm => ({
  name: '',
  contentKey: '',
  recipients: '',
  startsAt: getDefaultScheduleStart(),
  dailyLimit: 5,
  intervalMinutes: 5,
  weekdaysOnly: false,
});

const campaignStatusLabel: Record<CampaignStatus, string> = {
  scheduled: 'Agendada',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const deliveryStatusLabel: Record<DeliveryStatus, string> = {
  pending: 'Pendente',
  processing: 'Enviando',
  retrying: 'Nova tentativa',
  sent: 'Enviado',
  paused: 'Pausado',
  cancelled: 'Cancelado',
  error: 'Erro',
};

const formatDateTime = (timestamp: number): string => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(timestamp);

const getCampaignDeliveries = (campaignId: string, deliveries: ScheduledDelivery[]): ScheduledDelivery[] => deliveries.filter((delivery) => delivery.campaignId === campaignId);

const getDeliveryNotice = (delivery: ScheduledDelivery): string => {
  if (!delivery.lastError || delivery.status === 'processing') return '';
  const reason = normalizeWhatsAppErrorMessage(delivery.lastError);
  const isTemporary = delivery.lastFailureTransient || isTransientScheduleError(delivery.lastError);
  if (delivery.status === 'retrying' && isTemporary) {
    return `Aguardando o WhatsApp ficar pronto. Motivo: ${reason}`;
  }
  if (delivery.status === 'error' && isTemporary) {
    return `O WhatsApp não ficou pronto. Motivo: ${reason}`;
  }
  return reason;
};

const mergeRecipients = (captured: ScheduleRecipient[], manual: ScheduleRecipient[]): ScheduleRecipient[] => {
  const recipients = new Map<string, ScheduleRecipient>();
  captured.forEach((recipient) => recipients.set(recipient.chatId, recipient));
  manual.forEach((recipient) => {
    if (!recipients.has(recipient.chatId)) recipients.set(recipient.chatId, recipient);
  });
  return [...recipients.values()];
};

const createRecipientFromChat = (activeChat: ActiveChatContext): ScheduleRecipient => ({
  id: crypto.randomUUID(),
  name: activeChat.chatName,
  phone: activeChat.phone || 'Contato do WhatsApp',
  chatId: activeChat.chatId,
});

export const SchedulesView = ({ audios, images, texts, documents, funnels, activeChat, onNotice }: SchedulesViewProps): ReactElement => {
  const { campaigns: allCampaigns, deliveries, isLoading, error, runCommand } = useSchedules();
  // Fluxos de remarketing usam a mesma fila, mas são geridos na área Automação.
  const campaigns = useMemo(() => allCampaigns.filter((campaign) => !isRemarketingCampaign(campaign)), [allCampaigns]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<ScheduledCampaign | null>(null);
  const [form, setForm] = useState<ScheduleForm>(createEmptyForm);
  const [capturedRecipients, setCapturedRecipients] = useState<ScheduleRecipient[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const parsedRecipients = useMemo(() => parseScheduleRecipients(form.recipients), [form.recipients]);
  const recipients = useMemo(() => mergeRecipients(capturedRecipients, parsedRecipients.recipients), [capturedRecipients, parsedRecipients.recipients]);
  const startsAt = new Date(form.startsAt).getTime();
  const distribution = useMemo(() => Number.isFinite(startsAt)
    ? distributeRecipientDates(recipients, startsAt, form.dailyLimit, form.intervalMinutes, form.weekdaysOnly)
    : [], [form.dailyLimit, form.intervalMinutes, form.weekdaysOnly, recipients, startsAt]);
  const firstDelivery = distribution[0]?.scheduledAt;
  const lastDelivery = distribution.at(-1)?.scheduledAt;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';

  useEffect(() => {
    if (!isFormOpen || editingCampaign || !activeChat.chatId) return;
    setCapturedRecipients((current) => current.length ? current : [createRecipientFromChat(activeChat)]);
  }, [activeChat, editingCampaign, isFormOpen]);

  const closeForm = (): void => {
    setIsFormOpen(false);
    setEditingCampaign(null);
    setCapturedRecipients([]);
    setForm(createEmptyForm());
  };

  const openCreateForm = (): void => {
    setEditingCampaign(null);
    setCapturedRecipients(activeChat.chatId ? [createRecipientFromChat(activeChat)] : []);
    setForm(createEmptyForm());
    setIsFormOpen(true);
  };

  const openEditForm = async (campaign: ScheduledCampaign): Promise<void> => {
    const campaignDeliveries = getCampaignDeliveries(campaign.id, deliveries);
    if (campaignDeliveries.some((delivery) => delivery.status === 'sent' || delivery.status === 'processing')) {
      onNotice('Campanhas que já começaram não podem ser reprogramadas.', true);
      return;
    }
    try {
      if (campaign.status === 'scheduled') await runCommand({ type: 'PAUSE_SCHEDULE', campaignId: campaign.id });
      setEditingCampaign({ ...campaign, status: 'paused' });
      setCapturedRecipients(campaignDeliveries.map((delivery) => delivery.recipient));
      setForm({
        name: campaign.name,
        contentKey: 'snapshot',
        recipients: '',
        startsAt: toLocalDateTimeValue(campaign.startsAt),
        dailyLimit: campaign.dailyLimit,
        intervalMinutes: campaign.intervalMinutes,
        weekdaysOnly: campaign.weekdaysOnly,
      });
      setIsFormOpen(true);
    } catch (editError) {
      onNotice(editError instanceof Error ? editError.message : 'Não foi possível editar a campanha.', true);
    }
  };

  const addActiveChat = (): void => {
    if (!activeChat.chatId) {
      onNotice('Abra uma conversa no WhatsApp e tente novamente.', true);
      return;
    }
    if (capturedRecipients.some((recipient) => recipient.chatId === activeChat.chatId)) {
      onNotice(`“${activeChat.chatName}” já está na campanha.`);
      return;
    }
    setCapturedRecipients((current) => [...current, createRecipientFromChat(activeChat)]);
    onNotice(`Conversa com “${activeChat.chatName}” adicionada.`);
  };

  const removeCapturedRecipient = (recipientId: string): void => {
    setCapturedRecipients((current) => current.filter((recipient) => recipient.id !== recipientId));
  };

  const saveSchedule = async (): Promise<void> => {
    if (!editingCampaign && !form.contentKey) return onNotice('Selecione um texto ou funil.', true);
    if (parsedRecipients.errors.length) return onNotice(parsedRecipients.errors[0], true);
    if (!recipients.length) return onNotice('Adicione pelo menos um destinatário.', true);
    if (!Number.isFinite(startsAt) || startsAt <= Date.now()) return onNotice('Escolha uma data e hora futuras.', true);
    if (form.dailyLimit < 1 || form.dailyLimit > 100) return onNotice('O limite diário deve ficar entre 1 e 100.', true);
    if (form.intervalMinutes < 1 || form.intervalMinutes > 180) return onNotice('O intervalo deve ficar entre 1 e 180 minutos.', true);

    try {
      const content = editingCampaign
        ? { name: editingCampaign.contentName, type: editingCampaign.contentType, steps: editingCampaign.steps }
        : buildScheduleContent(form.contentKey, { audios, images, texts, documents, funnels });
      const now = Date.now();
      const campaignId = editingCampaign?.id || crypto.randomUUID();
      const generatedName = recipients.length === 1
        ? `${content.name} · ${recipients[0].name}`
        : `${content.name} · ${recipients.length} pessoas`;
      const campaign: ScheduledCampaign = {
        id: campaignId,
        name: form.name.trim() || generatedName,
        contentName: content.name,
        contentType: content.type,
        steps: content.steps,
        status: 'scheduled',
        recipientCount: distribution.length,
        dailyLimit: Math.floor(form.dailyLimit),
        intervalMinutes: Math.floor(form.intervalMinutes),
        weekdaysOnly: form.weekdaysOnly,
        timezone,
        startsAt,
        createdAt: editingCampaign?.createdAt || now,
        updatedAt: now,
      };
      const nextDeliveries = distribution.map<ScheduledDelivery>(({ recipient, scheduledAt }) => ({
        id: crypto.randomUUID(),
        campaignId,
        recipient,
        scheduledAt,
        dueAt: scheduledAt,
        status: 'pending',
        currentStep: 0,
        totalSteps: content.steps.length,
        attemptCount: 0,
      }));
      const confirmation = window.confirm(
        `${editingCampaign ? 'Atualizar' : 'Agendar'} “${content.name}” para ${distribution.length} pessoa(s)?\n\nPrimeiro envio: ${formatDateTime(firstDelivery!)}\nÚltimo envio: ${formatDateTime(lastDelivery!)}`,
      );
      if (!confirmation) return;

      setIsSaving(true);
      await runCommand({
        type: editingCampaign ? 'UPDATE_SCHEDULE' : 'CREATE_SCHEDULE',
        campaign: serializeScheduledCampaign(campaign),
        deliveries: nextDeliveries,
      });
      onNotice(editingCampaign ? 'Campanha atualizada e reativada.' : 'Campanha agendada com sucesso.');
      closeForm();
    } catch (saveError) {
      onNotice(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a campanha.', true);
    } finally {
      setIsSaving(false);
    }
  };

  const changeCampaignState = async (command: 'PAUSE_SCHEDULE' | 'RESUME_SCHEDULE' | 'CANCEL_SCHEDULE', campaignId: string): Promise<void> => {
    if (command === 'CANCEL_SCHEDULE' && !window.confirm('Cancelar esta campanha? Os envios restantes não serão realizados.')) return;
    try {
      await runCommand({ type: command, campaignId });
      onNotice(command === 'PAUSE_SCHEDULE' ? 'Campanha pausada.' : command === 'RESUME_SCHEDULE' ? 'Campanha retomada.' : 'Campanha cancelada.');
    } catch (stateError) {
      onNotice(stateError instanceof Error ? stateError.message : 'Não foi possível atualizar a campanha.', true);
    }
  };

  const retryFailedDelivery = async (deliveryId: string): Promise<void> => {
    try {
      await runCommand({ type: 'RETRY_DELIVERY', deliveryId });
      onNotice('Nova tentativa adicionada à fila.');
    } catch (retryError) {
      onNotice(retryError instanceof Error ? retryError.message : 'Não foi possível repetir o envio.', true);
    }
  };

  return <section className="workspace-view schedule-workspace">
    <header className="schedule-workspace__heading">
      <div><span>Agenda</span><h2>Campanhas agendadas</h2><p>Distribua mensagens ou funis por dia, horário e destinatário.</p></div>
      <button type="button" className="button button--primary" onClick={isFormOpen ? closeForm : openCreateForm}><Icon name={isFormOpen ? 'close' : 'plus'} />{isFormOpen ? 'Fechar' : 'Nova campanha'}</button>
    </header>

    <div className="schedule-notice" role="note"><Icon name="info" /><div><strong>Para o envio acontecer</strong><p>Deixe o computador ligado, o Chrome aberto e o WhatsApp conectado.</p></div></div>

    {isFormOpen && <section className="schedule-form" aria-labelledby="schedule-form-title">
      <header className="schedule-form__heading"><div><span><Icon name="calendar" /></span><div><h3 id="schedule-form-title">{editingCampaign ? 'Editar agendamento' : 'Agendar envio'}</h3><p>{editingCampaign ? 'Altere a data ou a distribuição.' : 'Só precisa escolher o conteúdo e o horário.'}</p></div></div><small>{timezone}</small></header>
      <div className="schedule-form__primary">
        <section className="schedule-recipients" aria-labelledby="schedule-recipients-title">
          <span id="schedule-recipients-title" className="schedule-recipients__label">1. Para quem</span>
          <div className={`active-chat ${capturedRecipients.length ? '' : 'active-chat--empty'}`}>
            <span className="active-chat__icon"><Icon name={capturedRecipients.length ? 'check' : 'messages'} /></span>
            <div><strong>{capturedRecipients[0]?.name || 'Abra uma conversa no WhatsApp'}</strong><small>{capturedRecipients.length ? 'Conversa selecionada automaticamente' : 'Assim que abrir, ela aparecerá aqui'}</small></div>
          </div>
        </section>
        <label className="schedule-field">2. O que enviar<select aria-label="Conteúdo do agendamento" value={form.contentKey} disabled={Boolean(editingCampaign)} onChange={(event) => setForm((current) => ({ ...current, contentKey: event.target.value }))}>{editingCampaign ? <option value="snapshot">{editingCampaign.contentName} · conteúdo preservado</option> : <><option value="">Escolha uma mensagem ou funil</option><optgroup label="Textos">{texts.map((text) => <option key={text.id} value={`text:${text.id}`}>{text.name}</option>)}</optgroup><optgroup label="Funis">{funnels.map((funnel) => <option key={funnel.id} value={`funnel:${funnel.id}`}>{funnel.name} · {funnel.steps.length} etapas</option>)}</optgroup></>}</select></label>
        <label className="schedule-field">3. Quando enviar<input aria-label="Data e hora do primeiro envio" type="datetime-local" min={toLocalDateTimeValue(Date.now())} value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} /></label>
      </div>
      <details className="schedule-advanced">
        <summary>Opções avançadas <small>mais pessoas e distribuição</small></summary>
        <div className="schedule-form__grid">
          <label className="schedule-field schedule-field--wide">Nome da campanha <small>Opcional: criamos um nome automaticamente.</small><input aria-label="Nome opcional da campanha" value={form.name} placeholder="Ex.: Retorno de outubro" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <section className="schedule-recipients" aria-labelledby="schedule-more-recipients-title">
            <span id="schedule-more-recipients-title" className="schedule-recipients__label">Mais destinatários</span>
            <button type="button" className="button" disabled={!activeChat.chatId || capturedRecipients.some((recipient) => recipient.chatId === activeChat.chatId)} onClick={addActiveChat}><Icon name="plus" />Adicionar conversa aberta agora</button>
            {capturedRecipients.length > 0 && <div className="recipient-chips" aria-label="Conversas adicionadas">{capturedRecipients.map((recipient) => <span className="recipient-chip" key={recipient.id}><Icon name="user" /><span><strong>{recipient.name}</strong><small>{recipient.phone}</small></span><button type="button" onClick={() => removeCapturedRecipient(recipient.id)} aria-label={`Remover ${recipient.name}`}><Icon name="close" /></button></span>)}</div>}
            <details className="manual-recipients"><summary>Adicionar por telefone</summary><label className="schedule-field">Lista manual<textarea aria-label="Destinatários por telefone" rows={4} value={form.recipients} placeholder={'Maria; 11999999999\nJoão; 11888888888'} onChange={(event) => setForm((current) => ({ ...current, recipients: event.target.value }))} /><small>Uma pessoa por linha: Nome; telefone. Para números brasileiros, o DDI 55 é adicionado automaticamente.</small></label></details>
          </section>
          <label className="schedule-field">Pessoas por dia<input aria-label="Pessoas por dia" type="number" min="1" max="100" value={form.dailyLimit} onChange={(event) => setForm((current) => ({ ...current, dailyLimit: Number(event.target.value) }))} /></label>
          <label className="schedule-field">Intervalo entre pessoas<input aria-label="Intervalo em minutos" type="number" min="1" max="180" value={form.intervalMinutes} onChange={(event) => setForm((current) => ({ ...current, intervalMinutes: Number(event.target.value) }))} /><small>Em minutos.</small></label>
          <label className="schedule-check schedule-field--wide"><input type="checkbox" checked={form.weekdaysOnly} onChange={(event) => setForm((current) => ({ ...current, weekdaysOnly: event.target.checked }))} /><span>Enviar somente de segunda a sexta</span></label>
        </div>
      </details>
      {parsedRecipients.errors.length > 0 && <div className="schedule-form__errors" role="alert"><Icon name="warning" /><div>{parsedRecipients.errors.slice(0, 3).map((message) => <p key={message}>{message}</p>)}</div></div>}
      <div className="schedule-summary" aria-live="polite"><Icon name="clock" /><p><strong>{distribution.length || 0} pessoa(s)</strong>{firstDelivery ? ` · primeiro envio em ${formatDateTime(firstDelivery)}` : ' · escolha o conteúdo e o horário'}</p></div>
      <footer className="schedule-form__actions"><button type="button" className="button" onClick={closeForm}>Cancelar</button><button type="button" className="button button--primary" disabled={isSaving} onClick={() => void saveSchedule()}><Icon name="check" />{isSaving ? 'Salvando...' : editingCampaign ? 'Atualizar agendamento' : 'Agendar mensagem'}</button></footer>
    </section>}

    {error && <div className="schedule-state schedule-state--error" role="alert"><Icon name="warning" /><div><strong>Não foi possível carregar a agenda</strong><p>{error}</p></div></div>}
    {isLoading && <div className="schedule-state" role="status"><Icon name="clock" /><div><strong>Carregando agenda...</strong><p>Buscando campanhas e entregas.</p></div></div>}
    {!isLoading && !error && campaigns.length === 0 && <div className="schedule-empty"><span><Icon name="calendar" /></span><h3>Nenhuma campanha agendada</h3><p>Crie uma campanha para distribuir textos ou funis entre seus contatos.</p><button type="button" className="button button--primary" onClick={openCreateForm}>Criar primeira campanha</button></div>}
    {!isLoading && campaigns.length > 0 && <div className="campaign-list">{campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} deliveries={getCampaignDeliveries(campaign.id, deliveries)} onPause={() => void changeCampaignState('PAUSE_SCHEDULE', campaign.id)} onResume={() => void changeCampaignState('RESUME_SCHEDULE', campaign.id)} onCancel={() => void changeCampaignState('CANCEL_SCHEDULE', campaign.id)} onEdit={() => void openEditForm(campaign)} onRetry={retryFailedDelivery} />)}</div>}
  </section>;
};

type CampaignCardProps = {
  campaign: ScheduledCampaign;
  deliveries: ScheduledDelivery[];
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onRetry: (deliveryId: string) => Promise<void>;
};

type DeliveryRowProps = Pick<CampaignCardProps, 'onRetry'> & {
  delivery: ScheduledDelivery;
};

const DeliveryRow = ({ delivery, onRetry }: DeliveryRowProps): ReactElement => {
  const notice = getDeliveryNotice(delivery);
  const stepLabel = delivery.totalSteps > 1 && !['sent', 'cancelled'].includes(delivery.status)
    ? ` · ${Math.min(delivery.currentStep + 1, delivery.totalSteps)}/${delivery.totalSteps}`
    : '';

  return <div className="delivery-row">
    <span className={`delivery-row__status delivery-row__status--${delivery.status}`} aria-label={deliveryStatusLabel[delivery.status]} />
    <div>
      <strong>{delivery.recipient.name}</strong>
      <small>{delivery.recipient.phone} · {formatDateTime(delivery.scheduledAt)}</small>
      {notice && <em title={notice}>{notice}</em>}
    </div>
    <span>{deliveryStatusLabel[delivery.status]}{stepLabel}</span>
    {delivery.status === 'error' && <button type="button" className="button" onClick={() => void onRetry(delivery.id)}>Tentar novamente</button>}
  </div>;
};

const CampaignCard = ({ campaign, deliveries, onPause, onResume, onCancel, onEdit, onRetry }: CampaignCardProps): ReactElement => {
  const sentCount = deliveries.filter((delivery) => delivery.status === 'sent').length;
  const errorCount = deliveries.filter((delivery) => delivery.status === 'error').length;
  const pendingCount = deliveries.filter((delivery) => ['pending', 'processing', 'retrying', 'paused'].includes(delivery.status)).length;
  const canEdit = !['completed', 'cancelled'].includes(campaign.status) && !deliveries.some((delivery) => delivery.status === 'sent' || delivery.status === 'processing');

  return <article className={`campaign-card campaign-card--${campaign.status}`}>
    <header className="campaign-card__heading"><div><span className={`campaign-card__status campaign-card__status--${campaign.status}`}>{campaignStatusLabel[campaign.status]}</span><h3>{campaign.name}</h3><p>{campaign.contentType === 'funnel' ? 'Funil' : 'Texto'} · {campaign.contentName}</p></div><span className="campaign-card__date"><Icon name="clock" />{formatDateTime(campaign.startsAt)}</span></header>
    <div className="campaign-card__progress"><span><i style={{ width: `${deliveries.length ? (sentCount / deliveries.length) * 100 : 0}%` }} /></span><p><strong>{sentCount}</strong> enviados · <strong>{pendingCount}</strong> pendentes{errorCount ? ` · ${errorCount} com erro` : ''}</p></div>
    <div className="campaign-card__meta"><span><Icon name="user" />{deliveries.length} pessoas</span><span><Icon name="calendar" />{campaign.dailyLimit}/dia</span><span><Icon name="clock" />{campaign.intervalMinutes} min</span></div>
    <details className="campaign-card__deliveries"><summary>Ver destinatários e status</summary><div>{deliveries.map((delivery) => <DeliveryRow key={delivery.id} delivery={delivery} onRetry={onRetry} />)}</div></details>
    {!['completed', 'cancelled'].includes(campaign.status) && <footer className="campaign-card__actions">{campaign.status === 'scheduled' ? <button type="button" className="button" onClick={onPause}><Icon name="pause" />Pausar</button> : <button type="button" className="button button--primary" onClick={onResume}><Icon name="send" />Retomar</button>}{canEdit && <button type="button" className="button" onClick={onEdit}><Icon name="edit" />Editar</button>}<button type="button" className="button button--danger" onClick={onCancel}><Icon name="trash" />Cancelar</button></footer>}
  </article>;
};
