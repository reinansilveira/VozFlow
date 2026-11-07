export type MediaType = 'audio' | 'image' | 'text' | 'document';

export type UsageMetadata = {
  usageCount?: number;
  lastUsedAt?: number;
};

export type AudioItem = UsageMetadata & {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  duration: number;
  createdAt: number;
};

export type ImageItem = UsageMetadata & {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  mimeType: string;
  createdAt: number;
};

export type TextItem = UsageMetadata & {
  id: string;
  name: string;
  text: string;
  createdAt: number;
};

export type DocumentItem = UsageMetadata & {
  id: string;
  name: string;
  fileName: string;
  bytes: ArrayBuffer;
  mimeType: string;
  size: number;
  createdAt: number;
};

export type FunnelStep = {
  type: MediaType;
  contentId?: string;
  text?: string;
  delaySeconds: number;
};

export type Funnel = UsageMetadata & {
  id: string;
  name: string;
  steps: FunnelStep[];
  createdAt: number;
};

export type ActiveJob = {
  id: string;
  funnelName: string;
  chatName: string;
  step: number;
  total: number;
  remainingSeconds: number;
  indicator?: 'typing' | 'recording';
};

export type ScheduleStep = {
  type: MediaType;
  name?: string;
  fileName?: string;
  text?: string;
  mimeType?: string;
  bytes?: ArrayBuffer;
  delaySeconds: number;
};

export type SerializedScheduleStep = Omit<ScheduleStep, 'bytes'> & {
  bytesBase64?: string;
};

export type ScheduleRecipient = {
  id: string;
  name: string;
  phone: string;
  chatId: string;
};

export type ActiveChatContext = {
  chatId: string;
  chatName: string;
  phone: string;
  // Momento da última mensagem recebida do contato nesta conversa, quando houver.
  lastInboundAt?: number;
};

export type ActiveChatChangedMessage = ActiveChatContext & {
  type: 'ACTIVE_CHAT_CHANGED';
};

export type CampaignStatus = 'scheduled' | 'paused' | 'completed' | 'cancelled';
export type DeliveryStatus = 'pending' | 'processing' | 'retrying' | 'sent' | 'paused' | 'cancelled' | 'error';

export type CampaignKind = 'schedule' | 'remarketing';

export type ScheduledCampaign = {
  id: string;
  // Ausente em campanhas antigas: equivale a `schedule`.
  kind?: CampaignKind;
  name: string;
  contentName: string;
  contentType: 'text' | 'funnel';
  steps: ScheduleStep[];
  status: CampaignStatus;
  recipientCount: number;
  dailyLimit: number;
  intervalMinutes: number;
  weekdaysOnly: boolean;
  timezone: string;
  startsAt: number;
  createdAt: number;
  updatedAt: number;
  // Somente remarketing: etapas de origem na biblioteca, usadas para editar o fluxo.
  stepSources?: FunnelStep[];
};

export type SerializedScheduledCampaign = Omit<ScheduledCampaign, 'steps'> & {
  steps: SerializedScheduleStep[];
};

export type ScheduledDelivery = {
  id: string;
  campaignId: string;
  recipient: ScheduleRecipient;
  scheduledAt: number;
  dueAt: number;
  status: DeliveryStatus;
  currentStep: number;
  totalSteps: number;
  attemptCount: number;
  executionStartedAt?: number;
  executionAcknowledgedAt?: number;
  executionId?: string;
  messageId?: string;
  messageStep?: number;
  sentAt?: number;
  lastError?: string;
  lastFailureTransient?: boolean;
  // Campos do remarketing (uma entrega por inscrição).
  enrolledAt?: number;
  enrolledChatId?: string;
  enrollmentSource?: EnrollmentSource;
  lastStepSentAt?: number;
  exitRequestedAt?: number;
  exitReason?: EnrollmentExitReason;
};

export type EnrollmentSource = 'manual' | 'trigger' | 'reactivation';
export type EnrollmentExitReason = 'replied' | 'cancelled';

export type ScheduleCommand =
  | { type: 'CREATE_SCHEDULE'; campaign: SerializedScheduledCampaign; deliveries: ScheduledDelivery[] }
  | { type: 'UPDATE_SCHEDULE'; campaign: SerializedScheduledCampaign; deliveries: ScheduledDelivery[] }
  | { type: 'PAUSE_SCHEDULE'; campaignId: string }
  | { type: 'RESUME_SCHEDULE'; campaignId: string }
  | { type: 'CANCEL_SCHEDULE'; campaignId: string }
  | { type: 'RETRY_DELIVERY'; deliveryId: string }
  | { type: 'REFRESH_SCHEDULE_ALARM' };

export type ScheduledDeliveryResult = {
  type: 'SCHEDULE_DELIVERY_RESULT';
  deliveryId: string;
  executionId: string;
  ok: boolean;
  error?: string;
  retryable?: boolean;
  resolvedChatId?: string;
};

export type ScheduledDeliveryPreparation = {
  type: 'PREPARE_SCHEDULED_DELIVERY';
  deliveryId: string;
  executionId: string;
  currentStep: number;
  messageId: string;
  previousMessageId?: string;
  resolvedChatId: string;
};

export type ExtensionMessage =
  | { type: 'OPEN_SIDEPANEL' }
  | { type: 'GET_ACTIVE_CHAT' }
  | { type: 'SEND_AUDIO'; audio: Pick<AudioItem, 'name' | 'bytes'> }
  | { type: 'SEND_IMAGE'; image: Pick<ImageItem, 'name' | 'mimeType' | 'bytes'> }
  | { type: 'SEND_TEXT'; text: Pick<TextItem, 'name' | 'text'> }
  | { type: 'SEND_DOCUMENT'; document: Pick<DocumentItem, 'name' | 'fileName' | 'mimeType' | 'bytes'> }
  | { type: 'START_FUNNEL'; jobId: string; steps: Array<FunnelStep & { name?: string; fileName?: string; mimeType?: string; bytes?: ArrayBuffer; delayMs: number }> }
  | { type: 'CANCEL_FUNNEL'; jobId: string }
  | { type: 'RUN_TRIGGER'; firingId: string; chatId: string; chatName: string; steps: Array<SerializedScheduleStep & { delayMs: number }> }
  | {
    type: 'EXECUTE_SCHEDULED_STEP';
    deliveryId: string;
    executionId: string;
    chatId: string;
    chatName: string;
    currentStep: number;
    messageId?: string;
    step: SerializedScheduleStep;
  };

// Licenciamento: estados devolvidos pelo servidor de licenças (SPEC, seção de licenciamento).
export type LicenseState =
  | 'teste_ativo'
  | 'teste_expirado'
  | 'teste_negado_instalacao'
  | 'licenca_ativa'
  | 'licenca_suspensa'
  | 'licenca_revogada'
  | 'licenca_expirada'
  | 'chave_invalida'
  | 'limite_numeros'
  | 'numero_bloqueado'
  | 'sem_acesso'
  | 'versao_desatualizada';

export type LicensePass = {
  v: 1;
  kind: 'trial' | 'license';
  phone: string;
  installationId: string;
  plan: string;
  licenseId: string | null;
  until: string | null;
  iat: number;
  exp: number;
};

// Estado local da licença, mantido pelo background em `chrome.storage.local`.
export type LicenseLocalState =
  | LicenseState
  | 'verificando'
  | 'whatsapp_desconectado'
  | 'nao_configurado';

export type LicenseSnapshot = {
  installationId: string;
  phone: string | null;
  state: LicenseLocalState;
  plan: string | null;
  until: string | null;
  pass: string | null;
  passExpiresAt: number | null;
  checkedAt: number | null;
  offline: boolean;
  minVersion: string | null;
};

export type LicenseCommand =
  | { type: 'LICENSE_ACCOUNT_DETECTED'; phone: string }
  | { type: 'LICENSE_START_TRIAL' }
  | { type: 'LICENSE_ACTIVATE'; code: string }
  | { type: 'LICENSE_REFRESH' };

// Automação (SPEC, "Gatilhos e remarketing").
export type TriggerMatchMode = 'contains' | 'exact';

export type TriggerAction = {
  type: 'audio' | 'funnel';
  contentId: string;
};

export type AutomationTrigger = {
  id: string;
  name: string;
  keywords: string[];
  matchMode: TriggerMatchMode;
  action: TriggerAction;
  enabled: boolean;
  replyDelaySeconds: number;
  cooldownHours: number;
  allowGroups: boolean;
  tag?: string;
  remarketingFlowId?: string;
  fireCount: number;
  lastFiredAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
};

export type TriggerFiringStatus = 'sending' | 'sent' | 'error';

export type TriggerFiring = {
  id: string;
  triggerId: string;
  chatId: string;
  chatName: string;
  firedAt: number;
  status: TriggerFiringStatus;
  error?: string;
};

export type KnownContact = {
  id: string;
  name: string;
  phone: string;
  tags: string[];
  lastInboundAt: number;
  updatedAt: number;
};

export type AutomationSettings = {
  paused: boolean;
  triggerDailyLimit: number;
};

export type IncomingMessage = {
  chatId: string;
  chatName: string;
  phone: string;
  text: string;
  isGroup: boolean;
  timestamp: number;
};

export type EnrollmentResult = {
  enrolled: number;
  skipped: Array<{ name: string; reason: string }>;
};

export type AutomationCommand =
  | { type: 'AUTOMATION_SAVE_TRIGGER'; trigger: AutomationTrigger }
  | { type: 'AUTOMATION_DELETE_TRIGGER'; triggerId: string }
  | { type: 'AUTOMATION_SET_TRIGGER_ENABLED'; triggerId: string; enabled: boolean }
  | { type: 'AUTOMATION_SAVE_FLOW'; campaign: SerializedScheduledCampaign }
  | { type: 'AUTOMATION_SET_FLOW_ENABLED'; flowId: string; enabled: boolean }
  | { type: 'AUTOMATION_DELETE_FLOW'; flowId: string }
  | { type: 'AUTOMATION_ENROLL'; flowId: string; chatIds: string[]; source: EnrollmentSource }
  | { type: 'AUTOMATION_CANCEL_ENROLLMENT'; deliveryId: string }
  | { type: 'AUTOMATION_SAVE_SETTINGS'; settings: AutomationSettings };

export type AutomationRuntimeMessage =
  | { type: 'AUTOMATION_INCOMING_MESSAGE'; message: IncomingMessage }
  | { type: 'AUTOMATION_TRIGGER_RESULT'; firingId: string; ok: boolean; error?: string };
