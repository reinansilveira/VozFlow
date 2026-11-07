import {
  getSerializedWhatsAppId,
  getWhatsAppChatId,
  resolvePhoneChatId,
  type WhatsAppChatId,
} from './active-chat';
import type { WhatsAppApi, WhatsAppUserPrefsApi, WhatsAppWidFactoryApi } from './wpp-api';

const compatibleUserPrefs = new WeakSet<WhatsAppUserPrefsApi>();
const ownLidCacheRefreshAt = new WeakMap<WhatsAppUserPrefsApi, number>();
const ownLidCacheRefreshThrottleMs = 5_000;

const getRawWhatsAppId = (id: WhatsAppChatId): string => {
  if (id._serialized) return id._serialized;

  try {
    return id.toString?.() || '';
  } catch {
    return '';
  }
};

const isUserLid = (lid: WhatsAppChatId | undefined): boolean => {
  if (!lid) return false;
  const rawLid = getRawWhatsAppId(lid);
  return !rawLid.includes(':') && getSerializedWhatsAppId(lid).endsWith('@lid');
};

const normalizeLid = (
  lid: WhatsAppChatId | undefined,
  widFactory?: WhatsAppWidFactoryApi,
): WhatsAppChatId | undefined => {
  if (!lid) return undefined;
  if (isUserLid(lid)) return lid;

  const serializedLid = getSerializedWhatsAppId(lid);
  if (!serializedLid.endsWith('@lid')) return undefined;

  const rawLid = getRawWhatsAppId(lid);
  if (!rawLid.includes(':')) return undefined;

  try {
    const userLid = widFactory?.toUserWidOrThrow?.(lid);
    if (isUserLid(userLid)) return userLid;
  } catch {
    // Alguns builds não expõem o normalizador novo; tentamos a fábrica abaixo.
  }

  try {
    const user = lid.user || rawLid.split(':')[0];
    const userLid = user ? widFactory?.createUserWid?.(user, 'lid') : undefined;
    if (isUserLid(userLid)) return userLid;
  } catch {
    // Sem um Wid de usuário real, o identificador de dispositivo não é usado.
  }

  return undefined;
};

const readValidLid = (
  readLid: (() => WhatsAppChatId | undefined) | undefined,
  widFactory?: WhatsAppWidFactoryApi,
): WhatsAppChatId | undefined => {
  if (!readLid) return undefined;
  return normalizeLid(readLid(), widFactory);
};

const installOwnLidCompatibility = (
  userPrefs?: WhatsAppUserPrefsApi,
  widFactory?: WhatsAppWidFactoryApi,
  readMigrationLid?: () => WhatsAppChatId | undefined,
): void => {
  const hasFallbackGetter = Boolean(
    userPrefs?.getMaybeMeLidUser
    || userPrefs?.getMaybeMeDeviceLid
    || userPrefs?.getMePNandLIDWids,
  );
  if (!userPrefs || compatibleUserPrefs.has(userPrefs) || (!hasFallbackGetter && !readMigrationLid)) return;

  const originalStrictGetter = userPrefs.getMeLidUserOrThrow?.bind(userPrefs);
  const optionalUserGetter = userPrefs.getMaybeMeLidUser?.bind(userPrefs);
  const optionalDeviceGetter = userPrefs.getMaybeMeDeviceLid?.bind(userPrefs);
  const pairedGetter = userPrefs.getMePNandLIDWids?.bind(userPrefs);

  try {
    const compatibleGetter = (): WhatsAppChatId => {
      let originalError: unknown;
      try {
        const strictLid = readValidLid(originalStrictGetter, widFactory);
        if (strictLid) return strictLid;
      } catch (error) {
        originalError = error;
      }

      for (const readFallback of [
        optionalUserGetter,
        optionalDeviceGetter,
        pairedGetter ? () => pairedGetter()[1] : undefined,
        readMigrationLid,
      ]) {
        try {
          const fallbackLid = readValidLid(readFallback, widFactory);
          if (fallbackLid) return fallbackLid;
        } catch {
          // Cada getter pertence a uma geração diferente do WhatsApp Web.
        }
      }
      if (originalError) throw originalError;
      throw new Error('O WhatsApp ainda não disponibilizou o LID da conta.');
    };
    userPrefs.getMeLidUserOrThrow = compatibleGetter;
    if (userPrefs.getMeLidUserOrThrow === compatibleGetter) compatibleUserPrefs.add(userPrefs);
  } catch {
    // Alguns builds podem expor o módulo como somente leitura. Nesse caso, o
    // polling normal continua ativo sem alterar o estado interno do WhatsApp.
  }
};

const refreshOwnLidCache = (userPrefs?: WhatsAppUserPrefsApi): boolean => {
  if (!userPrefs?.clearGetMaybeLidUserCache) return false;

  const now = Date.now();
  const lastRefreshAt = ownLidCacheRefreshAt.get(userPrefs);
  if (
    lastRefreshAt !== undefined
    && now >= lastRefreshAt
    && now - lastRefreshAt < ownLidCacheRefreshThrottleMs
  ) {
    return false;
  }

  ownLidCacheRefreshAt.set(userPrefs, now);
  try {
    userPrefs.clearGetMaybeLidUserCache();
    return true;
  } catch {
    // A falha também respeita o throttle para não pressionar o runtime.
    return false;
  }
};

export const getMigrationLid = (wpp?: WhatsAppApi): string => {
  try {
    return getSerializedWhatsAppId(wpp?.conn?.getMigrationState?.().currentLid);
  } catch {
    return '';
  }
};

export const getOwnLid = (wpp?: WhatsAppApi): string => {
  const userPrefs = wpp?.whatsapp?.UserPrefs;
  const widFactory = wpp?.whatsapp?.WidFactory;
  installOwnLidCompatibility(userPrefs, widFactory, () => wpp?.conn?.getMigrationState?.().currentLid);

  const readOwnLid = (): string => {
    for (const readLid of [
      wpp?.conn?.getMyUserLid?.bind(wpp.conn),
      userPrefs?.getMeLidUserOrThrow?.bind(userPrefs),
    ]) {
      try {
        const ownLid = readValidLid(readLid, widFactory);
        if (ownLid) return getSerializedWhatsAppId(ownLid);
      } catch {
        // Os atalhos para a identidade variam entre versões do WhatsApp Web.
      }
    }
    return '';
  };

  try {
    const ownLid = readOwnLid();
    if (ownLid.endsWith('@lid')) {
      if (userPrefs) ownLidCacheRefreshAt.delete(userPrefs);
      return ownLid;
    }
  } catch {
    // O cache opcional pode ter sido preenchido negativamente durante o reload.
  }

  if (!refreshOwnLidCache(userPrefs)) return '';

  try {
    const ownLid = readOwnLid();
    if (!ownLid.endsWith('@lid')) return '';
    if (userPrefs) ownLidCacheRefreshAt.delete(userPrefs);
    return ownLid;
  } catch {
    return '';
  }
};

// Número de telefone da conta conectada (apenas dígitos), usado pelo licenciamento.
// Ignora identificadores @lid, que não são telefone.
export const getOwnPhone = (wpp?: WhatsAppApi): string => {
  if (!wpp?.conn?.isAuthenticated?.()) return '';
  for (const readId of [
    () => wpp.conn?.getMyUserId?.(),
    () => wpp.whatsapp?.UserPrefs?.getMePNandLIDWids?.()[0],
    () => wpp.conn?.getMigrationState?.().currentPn,
  ]) {
    try {
      const serialized = getSerializedWhatsAppId(readId());
      if (serialized.endsWith('@c.us')) return serialized.split('@')[0].replace(/\D/g, '');
    } catch {
      // Cada geração do WhatsApp Web expõe a identidade por um caminho diferente.
    }
  }
  return '';
};

export const isLidMigratedSession = (wpp?: WhatsAppApi): boolean => {
  try {
    const migrationState = wpp?.conn?.getMigrationState?.();
    return Boolean(
      migrationState?.isLidMigrated
      || migrationState?.isSyncdSessionMigrated
      || getSerializedWhatsAppId(migrationState?.currentLid),
    );
  } catch {
    return false;
  }
};

export const isWppBaseOperational = (wpp?: WhatsAppApi): boolean => {
  if (!wpp?.isFullReady) return false;

  try {
    const connection = wpp.conn;
    if (!connection?.isMainReady || !connection.isAuthenticated || !connection.isOnline || !connection.getMigrationState) {
      return false;
    }

    const connectionReady = connection.isMainReady()
      && connection.isAuthenticated()
      && connection.isOnline();
    if (!connectionReady) return false;

    return true;
  } catch {
    return false;
  }
};

export const isWppOperational = (wpp?: WhatsAppApi): boolean => {
  if (!isWppBaseOperational(wpp)) return false;

  try {
    const migrationState = wpp?.conn?.getMigrationState?.();
    // Depois de um reload, o WhatsApp pode anunciar uma conta migrada antes de
    // carregar o LID proprio no runtime. Enviar nessa janela causa exatamente
    // "No LID for user" dentro do WA-JS. Uma conta nao migrada nao possui
    // currentLid e pode continuar usando o identificador telefonico @c.us.
    const requiresOwnLid = Boolean(
      migrationState?.isLidMigrated
      || migrationState?.isSyncdSessionMigrated
      || getSerializedWhatsAppId(migrationState?.currentLid),
    );
    return !requiresOwnLid || Boolean(getOwnLid(wpp));
  } catch {
    return false;
  }
};

export const resolveScheduledDestination = async (wpp: WhatsAppApi, chatId: string): Promise<string> => {
  let ownLidAvailable = Boolean(getOwnLid(wpp));
  const compatibleId = await resolvePhoneChatId(chatId, wpp.contact, ownLidAvailable);
  if (!wpp.chat.find) {
    throw new Error('O WhatsApp ainda está carregando a identificação segura da conversa. Tentaremos novamente.');
  }

  const chat = await wpp.chat.find(compatibleId);
  const canonicalId = getWhatsAppChatId(chat) || compatibleId;
  ownLidAvailable = Boolean(getOwnLid(wpp));

  if (canonicalId.endsWith('@lid') && !ownLidAvailable) {
    throw new Error('O WhatsApp ainda está preparando a identificação segura da conta. O envio continua na fila.');
  }

  if (canonicalId.endsWith('@g.us') && !ownLidAvailable) {
    throw new Error('O WhatsApp ainda está sincronizando o identificador da sua conta. A mensagem será tentada novamente.');
  }

  return canonicalId;
};
