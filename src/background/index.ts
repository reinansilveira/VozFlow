import {
  acknowledgeDeliveryExecution,
  cancelSchedule,
  claimNextDueDelivery,
  createSchedule,
  finishDeliveryAttempt,
  getNextAlarmTime,
  prepareDeliveryAttempt,
  pauseSchedule,
  recoverLegacyTransientDeliveries,
  recoverStaleDeliveries,
  resumeSchedule,
  retryDelivery,
  returnDeliveryToRetry,
  updateSchedule,
} from '../shared/services/schedule-service';
import { getLicenseSnapshot, hasSendAccess, licenseStorageKey, requestLicense } from '../shared/services/license-service';
import {
  addContactTag,
  deleteTrigger,
  finishTriggerFiring,
  getAutomationSettings,
  getTriggers,
  recordContactActivity,
  recordTriggerStart,
  reserveTriggerFiring,
  saveAutomationSettings,
  saveTrigger,
  setTriggerEnabled,
} from '../shared/services/automation-service';
import {
  cancelEnrollment,
  deleteRemarketingFlow,
  enrollInRemarketingFlow,
  exitFlowsForMessage,
  saveRemarketingFlow,
  setRemarketingFlowEnabled,
} from '../shared/services/remarketing-service';
import { getAllItems, openLibrary, type LibraryData } from '../shared/services/library-service';
import { buildTriggerSteps } from '../shared/services/trigger-builder';
import type {
  ActiveChatChangedMessage,
  AutomationCommand,
  AutomationRuntimeMessage,
  ExtensionMessage,
  IncomingMessage,
  LicenseCommand,
  ScheduledCampaign,
  ScheduleCommand,
  ScheduledDeliveryPreparation,
  ScheduledDeliveryResult,
} from '../shared/types';
import { deserializeScheduledCampaign, serializeScheduleStep } from '../shared/utils/message-transport';
import { shouldRefreshLicense } from '../shared/utils/license-state';
import { isTransientScheduleError } from '../shared/utils/schedule-retry';
import { automationStorageKey, hasAutomationPlan } from '../shared/utils/automation-rules';
import { getMessageChatKeys, isRemarketingCampaign } from '../shared/utils/remarketing';
import { findMatchingTrigger } from '../shared/utils/trigger-match';

const whatsappUrl = 'https://web.whatsapp.com/';
const dashboardUrl = chrome.runtime.getURL('src/entries/dashboard/index.html');
const scheduleAlarmName = 'vozflow-next-scheduled-delivery';
const licenseAlarmName = 'vozflow-license-refresh';
const licenseRetryThrottleMs = 60_000;
const licenseWaitMessage = 'Aguardando licença: ative ou renove o VozFlow para continuar os envios agendados.';

type InterfaceMessage = { type: 'OPEN_DASHBOARD' | 'OPEN_SIDEPANEL' };
type ScheduleStateMessage = { type: 'SCHEDULE_STATE_CHANGED' };
type ScheduledDeliveryAcknowledgement = { type: 'SCHEDULE_DELIVERY_ACKNOWLEDGED'; deliveryId: string; executionId: string };
type BackgroundMessage = ActiveChatChangedMessage | AutomationCommand | AutomationRuntimeMessage | ExtensionMessage | LicenseCommand | InterfaceMessage | ScheduleCommand | ScheduledDeliveryPreparation | ScheduledDeliveryResult | ScheduledDeliveryAcknowledgement | ScheduleStateMessage | { type: 'VOZFLOW_PAGE_EVENT'; payload: unknown };

const getActiveWhatsAppTab = async (): Promise<chrome.tabs.Tab | undefined> => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.url?.startsWith(whatsappUrl) ? tab : undefined;
};

const getAnyWhatsAppTab = async (): Promise<chrome.tabs.Tab | undefined> => {
  const tabs = await chrome.tabs.query({ url: `${whatsappUrl}*` });
  return tabs.find((tab) => tab.active) || tabs[0];
};

const openPanel = async (): Promise<void> => {
  const tab = await getActiveWhatsAppTab();
  if (!tab?.id) throw new Error('Abra o WhatsApp Web para usar o VozFlow.');
  await chrome.tabs.sendMessage(tab.id, { type: 'VOZFLOW_OPEN' });
};

const openDashboard = async (): Promise<void> => {
  const [existingTab] = await chrome.tabs.query({ url: dashboardUrl });

  if (existingTab?.id !== undefined) {
    await chrome.tabs.update(existingTab.id, { active: true });
    if (existingTab.windowId !== undefined) await chrome.windows.update(existingTab.windowId, { focused: true });
    return;
  }

  await chrome.tabs.create({ url: dashboardUrl });
};

const notifyScheduleStateChanged = (): void => {
  void chrome.runtime.sendMessage({ type: 'SCHEDULE_STATE_CHANGED' } satisfies ScheduleStateMessage).catch(() => undefined);
};

// Automação (gatilhos e remarketing) só roda com plano Pro, passe válido e sem a pausa geral.
const isAutomationRunnable = async (): Promise<boolean> => {
  const [settings, license] = await Promise.all([getAutomationSettings(), getLicenseSnapshot()]);
  if (settings.paused || !hasAutomationPlan(license)) return false;
  return hasSendAccess(license, license.phone);
};

const getCampaignFilter = async (): Promise<(campaign: ScheduledCampaign) => boolean> => {
  const automationRunnable = await isAutomationRunnable();
  return (campaign) => automationRunnable || !isRemarketingCampaign(campaign);
};

const syncScheduleAlarm = async (): Promise<void> => {
  await chrome.alarms.clear(scheduleAlarmName);
  const nextTime = await getNextAlarmTime(await getCampaignFilter());
  if (nextTime === undefined) return;
  await chrome.alarms.create(scheduleAlarmName, { when: Math.max(Date.now() + 500, nextTime) });
};

const processNextScheduledDelivery = async (): Promise<void> => {
  await recoverStaleDeliveries();
  const claimed = await claimNextDueDelivery(await getCampaignFilter());
  if (!claimed) {
    await syncScheduleAlarm();
    return;
  }

  const { campaign, delivery } = claimed;
  const executionId = delivery.executionId;
  if (!executionId) {
    await syncScheduleAlarm();
    return;
  }
  const license = await getLicenseSnapshot();
  if (!(await hasSendAccess(license, license.phone))) {
    await returnDeliveryToRetry(delivery.id, executionId, licenseWaitMessage, true);
    await syncScheduleAlarm();
    notifyScheduleStateChanged();
    return;
  }
  const step = campaign.steps[delivery.currentStep];
  if (!step) {
    await returnDeliveryToRetry(delivery.id, executionId, 'A etapa programada não existe mais.');
    await syncScheduleAlarm();
    notifyScheduleStateChanged();
    return;
  }

  try {
    const tab = await getAnyWhatsAppTab();
    if (!tab?.id) throw new Error('Abra o WhatsApp Web para continuar os envios agendados.');
    await chrome.tabs.sendMessage(tab.id, {
      type: 'EXECUTE_SCHEDULED_STEP',
      deliveryId: delivery.id,
      executionId,
      chatId: delivery.recipient.chatId,
      chatName: delivery.recipient.name,
      currentStep: delivery.currentStep,
      messageId: delivery.messageStep === delivery.currentStep ? delivery.messageId : undefined,
      step: serializeScheduleStep(step),
    } satisfies ExtensionMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp Web indisponível.';
    await returnDeliveryToRetry(delivery.id, executionId, message, isTransientScheduleError(message));
  }

  await syncScheduleAlarm();
  notifyScheduleStateChanged();
};

const runScheduleCommand = async (message: ScheduleCommand): Promise<void> => {
  if (message.type === 'CREATE_SCHEDULE') await createSchedule(deserializeScheduledCampaign(message.campaign), message.deliveries);
  if (message.type === 'UPDATE_SCHEDULE') await updateSchedule(deserializeScheduledCampaign(message.campaign), message.deliveries);
  if (message.type === 'PAUSE_SCHEDULE') await pauseSchedule(message.campaignId);
  if (message.type === 'RESUME_SCHEDULE') await resumeSchedule(message.campaignId);
  if (message.type === 'CANCEL_SCHEDULE') await cancelSchedule(message.campaignId);
  if (message.type === 'RETRY_DELIVERY') await retryDelivery(message.deliveryId);
  await syncScheduleAlarm();
  notifyScheduleStateChanged();
};

const scheduleCommandTypes = new Set<ScheduleCommand['type']>([
  'CREATE_SCHEDULE',
  'UPDATE_SCHEDULE',
  'PAUSE_SCHEDULE',
  'RESUME_SCHEDULE',
  'CANCEL_SCHEDULE',
  'RETRY_DELIVERY',
  'REFRESH_SCHEDULE_ALARM',
]);

let lastLicenseAttemptAt = 0;

// Renova o passe quando o número muda, quando ele está perto de vencer ou depois de ficar sem conexão.
const refreshLicenseIfNeeded = async (phone: string | null, force = false): Promise<void> => {
  const snapshot = await getLicenseSnapshot();
  const connectedPhone = phone ?? snapshot.phone;
  if (!connectedPhone) return;
  const now = Date.now();
  const due = force || shouldRefreshLicense(snapshot, connectedPhone, now);
  const phoneChanged = snapshot.phone !== connectedPhone;
  if (!due || (!phoneChanged && !force && now - lastLicenseAttemptAt < licenseRetryThrottleMs)) return;
  lastLicenseAttemptAt = now;
  await requestLicense('pass-refresh', connectedPhone);
};

const runLicenseCommand = async (message: LicenseCommand): Promise<unknown> => {
  if (message.type === 'LICENSE_ACCOUNT_DETECTED') return refreshLicenseIfNeeded(message.phone);
  const snapshot = await getLicenseSnapshot();
  if (message.type === 'LICENSE_REFRESH') return requestLicense('pass-refresh', snapshot.phone);
  if (message.type === 'LICENSE_START_TRIAL') return requestLicense('trial-start', snapshot.phone);
  return requestLicense('license-activate', snapshot.phone, message.code.trim());
};

const licenseCommandTypes = new Set<LicenseCommand['type']>([
  'LICENSE_ACCOUNT_DETECTED',
  'LICENSE_START_TRIAL',
  'LICENSE_ACTIVATE',
  'LICENSE_REFRESH',
]);

const loadLibrary = async (): Promise<LibraryData> => {
  const database = await openLibrary();
  const [audios, images, texts, documents, funnels] = await Promise.all([
    getAllItems<LibraryData['audios'][number]>(database, 'audios'),
    getAllItems<LibraryData['images'][number]>(database, 'images'),
    getAllItems<LibraryData['texts'][number]>(database, 'texts'),
    getAllItems<LibraryData['documents'][number]>(database, 'documents'),
    getAllItems<LibraryData['funnels'][number]>(database, 'funnels'),
  ]);
  return { audios, images, texts, documents, funnels };
};

const runAutomationCommand = async (message: AutomationCommand): Promise<unknown> => {
  let result: unknown;
  if (message.type === 'AUTOMATION_SAVE_TRIGGER') await saveTrigger(message.trigger);
  if (message.type === 'AUTOMATION_DELETE_TRIGGER') await deleteTrigger(message.triggerId);
  if (message.type === 'AUTOMATION_SET_TRIGGER_ENABLED') await setTriggerEnabled(message.triggerId, message.enabled);
  if (message.type === 'AUTOMATION_SAVE_FLOW') await saveRemarketingFlow(deserializeScheduledCampaign(message.campaign));
  if (message.type === 'AUTOMATION_SET_FLOW_ENABLED') await setRemarketingFlowEnabled(message.flowId, message.enabled);
  if (message.type === 'AUTOMATION_DELETE_FLOW') await deleteRemarketingFlow(message.flowId);
  if (message.type === 'AUTOMATION_ENROLL') result = await enrollInRemarketingFlow(message.flowId, message.chatIds, message.source);
  if (message.type === 'AUTOMATION_CANCEL_ENROLLMENT') await cancelEnrollment(message.deliveryId);
  if (message.type === 'AUTOMATION_SAVE_SETTINGS') await saveAutomationSettings(message.settings);
  await syncScheduleAlarm();
  notifyScheduleStateChanged();
  return result;
};

const automationCommandTypes = new Set<AutomationCommand['type']>([
  'AUTOMATION_SAVE_TRIGGER',
  'AUTOMATION_DELETE_TRIGGER',
  'AUTOMATION_SET_TRIGGER_ENABLED',
  'AUTOMATION_SAVE_FLOW',
  'AUTOMATION_SET_FLOW_ENABLED',
  'AUTOMATION_DELETE_FLOW',
  'AUTOMATION_ENROLL',
  'AUTOMATION_CANCEL_ENROLLMENT',
  'AUTOMATION_SAVE_SETTINGS',
]);

// Mensagem recebida: registra o contato, encerra os fluxos de quem respondeu e avalia os gatilhos.
// O texto só é usado para comparar com as palavras-chave e não é guardado.
const handleIncomingMessage = async (message: IncomingMessage, tabId: number | undefined): Promise<void> => {
  if (!message.isGroup) {
    await recordContactActivity({ chatId: message.chatId, name: message.chatName, phone: message.phone, lastInboundAt: message.timestamp });
    const exited = await exitFlowsForMessage(getMessageChatKeys(message.chatId, message.phone), message.timestamp);
    if (exited) {
      await syncScheduleAlarm();
      notifyScheduleStateChanged();
    }
  }

  if (!message.text || tabId === undefined || !(await isAutomationRunnable())) return;
  const trigger = findMatchingTrigger(await getTriggers(), message);
  if (!trigger) return;
  const settings = await getAutomationSettings();
  const reservation = await reserveTriggerFiring(trigger, { chatId: message.chatId, chatName: message.chatName }, settings);
  if (!reservation.firing) return;
  await recordTriggerStart(trigger.id, reservation.firing.firedAt);

  try {
    const steps = buildTriggerSteps(trigger, await loadLibrary());
    await chrome.tabs.sendMessage(tabId, {
      type: 'RUN_TRIGGER',
      firingId: reservation.firing.id,
      chatId: message.chatId,
      chatName: message.chatName,
      steps: steps.map((step) => ({ ...serializeScheduleStep(step), delayMs: step.delaySeconds * 1000 })),
    } satisfies ExtensionMessage);
  } catch (error) {
    await finishTriggerFiring(reservation.firing.id, false, error instanceof Error ? error.message : 'Não foi possível iniciar o gatilho.');
    notifyScheduleStateChanged();
    return;
  }

  if (!message.isGroup) {
    if (trigger.tag) await addContactTag(message.chatId, trigger.tag);
    if (trigger.remarketingFlowId) {
      await enrollInRemarketingFlow(trigger.remarketingFlowId, [message.chatId], 'trigger').catch(() => undefined);
      await syncScheduleAlarm();
    }
  }
  notifyScheduleStateChanged();
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[licenseStorageKey] || changes[automationStorageKey])) void syncScheduleAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === scheduleAlarmName) void processNextScheduledDelivery();
  if (alarm.name === licenseAlarmName) void refreshLicenseIfNeeded(null);
});

const initializeSchedule = async (): Promise<void> => {
  await recoverLegacyTransientDeliveries();
  await syncScheduleAlarm();
  await chrome.alarms.create(licenseAlarmName, { periodInMinutes: 30 });
};

chrome.runtime.onStartup.addListener(() => void initializeSchedule());
chrome.runtime.onInstalled.addListener(() => void initializeSchedule());

chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
  if (message.type === 'VOZFLOW_PAGE_EVENT' || message.type === 'SCHEDULE_STATE_CHANGED') return false;

  if (message.type === 'ACTIVE_CHAT_CHANGED') {
    if (message.lastInboundAt) {
      void recordContactActivity({ chatId: message.chatId, name: message.chatName, phone: message.phone, lastInboundAt: message.lastInboundAt }).catch(() => undefined);
    }
    return false;
  }

  if (message.type === 'AUTOMATION_INCOMING_MESSAGE') {
    void handleIncomingMessage(message.message, sender.tab?.id).then(
      () => sendResponse({ ok: true }),
      (error: Error) => sendResponse({ ok: false, error: error.message }),
    );
    return true;
  }

  if (message.type === 'AUTOMATION_TRIGGER_RESULT') {
    void finishTriggerFiring(message.firingId, message.ok, message.error).then(() => {
      notifyScheduleStateChanged();
      sendResponse({ ok: true });
    }, (error: Error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (automationCommandTypes.has(message.type as AutomationCommand['type'])) {
    void runAutomationCommand(message as AutomationCommand).then(
      (result) => sendResponse({ ok: true, result }),
      (error: Error) => sendResponse({ ok: false, error: error.message }),
    );
    return true;
  }

  if (message.type === 'SCHEDULE_DELIVERY_RESULT') {
    void finishDeliveryAttempt(
      message.deliveryId,
      message.executionId,
      message.ok,
      message.error,
      message.resolvedChatId,
      message.retryable,
    ).then(async () => {
      await syncScheduleAlarm();
      notifyScheduleStateChanged();
      sendResponse({ ok: true });
    }).catch((error: Error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'SCHEDULE_DELIVERY_ACKNOWLEDGED') {
    void acknowledgeDeliveryExecution(message.deliveryId, message.executionId).then(async () => {
      await syncScheduleAlarm();
      notifyScheduleStateChanged();
      sendResponse({ ok: true });
    }).catch((error: Error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'PREPARE_SCHEDULED_DELIVERY') {
    void prepareDeliveryAttempt(
      message.deliveryId,
      message.executionId,
      message.currentStep,
      message.messageId,
      message.resolvedChatId,
      message.previousMessageId,
    ).then(
      () => sendResponse({ ok: true }),
      (error: Error) => sendResponse({ ok: false, error: error.message }),
    );
    return true;
  }

  if (licenseCommandTypes.has(message.type as LicenseCommand['type'])) {
    void runLicenseCommand(message as LicenseCommand).then(
      (result) => sendResponse({ ok: true, result }),
      (error: Error) => sendResponse({ ok: false, error: error.message }),
    );
    return true;
  }

  if (scheduleCommandTypes.has(message.type as ScheduleCommand['type'])) {
    void runScheduleCommand(message as ScheduleCommand).then(
      () => sendResponse({ ok: true }),
      (error: Error) => sendResponse({ ok: false, error: error.message }),
    );
    return true;
  }

  if (message.type === 'OPEN_SIDEPANEL') {
    void openPanel().then(
      () => sendResponse({ ok: true }),
      (error: Error) => sendResponse({ ok: false, error: error.message }),
    );
    return true;
  }

  if (message.type === 'OPEN_DASHBOARD') {
    void openDashboard().then(
      () => sendResponse({ ok: true }),
      (error: Error) => sendResponse({ ok: false, error: error.message }),
    );
    return true;
  }

  const forwardMessage = async (): Promise<void> => {
    const tab = message.type === 'GET_ACTIVE_CHAT' ? await getAnyWhatsAppTab() : await getActiveWhatsAppTab();
    if (!tab?.id) throw new Error('Abra o WhatsApp Web e selecione uma conversa antes de enviar.');
    await chrome.tabs.sendMessage(tab.id, message);
  };

  void forwardMessage().then(
    () => sendResponse({ ok: true }),
    (error: Error) => sendResponse({ ok: false, error: error.message }),
  );
  return true;
});

void initializeSchedule();
