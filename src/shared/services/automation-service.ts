import type {
  AutomationSettings,
  AutomationTrigger,
  KnownContact,
  TriggerFiring,
} from '../types';
import {
  automationStorageKey,
  evaluateTriggerFiring,
  firingRetentionMs,
  normalizeAutomationSettings,
  type TriggerFiringDecision,
} from '../utils/automation-rules';
import { isGroupChatId } from '../utils/remarketing';
import { getAllItems, getItem, openLibrary, removeItem, saveItem } from './library-service';

// Gatilhos, contatos conhecidos e configuração da automação, guardados no computador do usuário.

export const getAutomationSettings = async (): Promise<AutomationSettings> => {
  const stored = (await chrome.storage.local.get(automationStorageKey))[automationStorageKey] as Partial<AutomationSettings> | undefined;
  return normalizeAutomationSettings(stored);
};

export const saveAutomationSettings = async (settings: AutomationSettings): Promise<void> => {
  await chrome.storage.local.set({ [automationStorageKey]: normalizeAutomationSettings(settings) });
};

export const getTriggers = async (database?: IDBDatabase): Promise<AutomationTrigger[]> => {
  const triggers = await getAllItems<AutomationTrigger>(database || await openLibrary(), 'triggers');
  return triggers.sort((first, second) => first.createdAt - second.createdAt);
};

export const saveTrigger = async (trigger: AutomationTrigger): Promise<void> => {
  const database = await openLibrary();
  const existing = await getItem<AutomationTrigger>(database, 'triggers', trigger.id);
  // As estatísticas pertencem ao background; a edição não pode zerá-las.
  await saveItem(database, 'triggers', {
    ...trigger,
    fireCount: existing?.fireCount ?? 0,
    lastFiredAt: existing?.lastFiredAt,
    lastError: existing?.lastError,
    createdAt: existing?.createdAt ?? trigger.createdAt,
    updatedAt: Date.now(),
  } satisfies AutomationTrigger);
};

export const deleteTrigger = async (triggerId: string): Promise<void> => {
  await removeItem(await openLibrary(), 'triggers', triggerId);
};

export const setTriggerEnabled = async (triggerId: string, enabled: boolean): Promise<void> => {
  const database = await openLibrary();
  const trigger = await getItem<AutomationTrigger>(database, 'triggers', triggerId);
  if (!trigger) throw new Error('Gatilho não encontrado.');
  await saveItem(database, 'triggers', { ...trigger, enabled, updatedAt: Date.now() } satisfies AutomationTrigger);
};

export type FiringReservation = { decision: TriggerFiringDecision; firing?: TriggerFiring };

// Confere o período sem repetição e o limite diário e grava a reserva na mesma transação,
// para que duas mensagens seguidas nunca gerem dois disparos.
export const reserveTriggerFiring = async (
  trigger: AutomationTrigger,
  chat: { chatId: string; chatName: string },
  settings: AutomationSettings,
  now = Date.now(),
): Promise<FiringReservation> => {
  const database = await openLibrary();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('triggerFirings', 'readwrite');
    const store = transaction.objectStore('triggerFirings');
    let reservation: FiringReservation = { decision: { allowed: false, reason: 'paused' } };
    const request = store.getAll();
    request.onsuccess = () => {
      const firings = request.result as TriggerFiring[];
      firings.filter((firing) => now - firing.firedAt > firingRetentionMs).forEach((firing) => store.delete(firing.id));
      const recent = firings.filter((firing) => now - firing.firedAt <= firingRetentionMs);
      const decision = evaluateTriggerFiring({ trigger, chatId: chat.chatId, firings: recent, settings, now });
      if (!decision.allowed) {
        reservation = { decision };
        return;
      }
      const firing: TriggerFiring = {
        id: crypto.randomUUID(),
        triggerId: trigger.id,
        chatId: chat.chatId,
        chatName: chat.chatName,
        firedAt: now,
        status: 'sending',
      };
      store.add(firing);
      reservation = { decision, firing };
    };
    transaction.oncomplete = () => resolve(reservation);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('A reserva do gatilho foi interrompida.'));
  });
};

export const recordTriggerStart = async (triggerId: string, firedAt: number): Promise<void> => {
  const database = await openLibrary();
  const trigger = await getItem<AutomationTrigger>(database, 'triggers', triggerId);
  if (!trigger) return;
  await saveItem(database, 'triggers', { ...trigger, fireCount: trigger.fireCount + 1, lastFiredAt: firedAt } satisfies AutomationTrigger);
};

export const finishTriggerFiring = async (firingId: string, ok: boolean, error?: string): Promise<void> => {
  const database = await openLibrary();
  const firing = await getItem<TriggerFiring>(database, 'triggerFirings', firingId);
  if (!firing || firing.status !== 'sending') return;
  await saveItem(database, 'triggerFirings', {
    ...firing,
    status: ok ? 'sent' : 'error',
    error: ok ? undefined : error || 'O WhatsApp não concluiu o envio.',
  } satisfies TriggerFiring);
  const trigger = await getItem<AutomationTrigger>(database, 'triggers', firing.triggerId);
  if (!trigger) return;
  await saveItem(database, 'triggers', {
    ...trigger,
    lastError: ok ? undefined : `${firing.chatName}: ${error || 'o WhatsApp não concluiu o envio.'}`,
  } satisfies AutomationTrigger);
};

export const getTriggerFirings = async (database?: IDBDatabase): Promise<TriggerFiring[]> => {
  const firings = await getAllItems<TriggerFiring>(database || await openLibrary(), 'triggerFirings');
  return firings.sort((first, second) => second.firedAt - first.firedAt);
};

export const getKnownContacts = async (database?: IDBDatabase): Promise<KnownContact[]> => {
  const contacts = await getAllItems<KnownContact>(database || await openLibrary(), 'contacts');
  return contacts.sort((first, second) => second.lastInboundAt - first.lastInboundAt);
};

// Registra que o contato já conversou com o usuário (base para o remarketing). Grupos não entram.
export const recordContactActivity = async (activity: {
  chatId: string;
  name: string;
  phone: string;
  lastInboundAt: number;
}): Promise<void> => {
  if (!activity.chatId || isGroupChatId(activity.chatId) || !activity.lastInboundAt) return;
  const database = await openLibrary();
  const existing = await getItem<KnownContact>(database, 'contacts', activity.chatId);
  const name = activity.name.trim() || existing?.name || activity.phone || activity.chatId;
  const phone = activity.phone || existing?.phone || '';
  if (existing && existing.lastInboundAt >= activity.lastInboundAt && existing.name === name && existing.phone === phone) return;
  await saveItem(database, 'contacts', {
    id: activity.chatId,
    name,
    phone,
    tags: existing?.tags ?? [],
    lastInboundAt: Math.max(existing?.lastInboundAt ?? 0, activity.lastInboundAt),
    updatedAt: Date.now(),
  } satisfies KnownContact);
};

export const addContactTag = async (chatId: string, tag: string): Promise<void> => {
  const cleanTag = tag.trim();
  if (!cleanTag) return;
  const database = await openLibrary();
  const contact = await getItem<KnownContact>(database, 'contacts', chatId);
  if (!contact || contact.tags.some((item) => item.toLocaleLowerCase('pt-BR') === cleanTag.toLocaleLowerCase('pt-BR'))) return;
  await saveItem(database, 'contacts', { ...contact, tags: [...contact.tags, cleanTag], updatedAt: Date.now() } satisfies KnownContact);
};
