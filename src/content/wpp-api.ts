import type { WhatsAppChat, WhatsAppChatId, WhatsAppContactApi } from './active-chat';
import type { WhatsAppIncomingMessage } from './incoming-message';
import type { WhatsAppSendResult } from './send-result';

export type WhatsAppConnectionApi = {
  getMigrationState?: () => {
    isLidMigrated?: boolean;
    isSyncdSessionMigrated?: boolean;
    shouldApplyNonMigratedMessagingRules?: boolean;
    currentLid?: { _serialized?: string; toString?: (...arguments_: unknown[]) => string };
    currentPn?: { _serialized?: string; toString?: (...arguments_: unknown[]) => string };
  };
  getMyUserId?: () => { _serialized?: string; toString?: (...arguments_: unknown[]) => string } | undefined;
  getMyUserLid?: () => { _serialized?: string; toString?: (...arguments_: unknown[]) => string };
  isAuthenticated?: () => boolean;
  isMainReady?: () => boolean;
  isOnline?: () => boolean;
};

export type WhatsAppUserPrefsApi = {
  clearGetMaybeLidUserCache?: () => void;
  getMaybeMeDeviceLid?: () => WhatsAppChatId | undefined;
  getMaybeMeLidUser?: () => WhatsAppChatId | undefined;
  getMeLidUserOrThrow?: () => WhatsAppChatId;
  getMePNandLIDWids?: () => [WhatsAppChatId | undefined, WhatsAppChatId | undefined];
};

export type WhatsAppWidFactoryApi = {
  createUserWid?: (user: string, server?: string) => WhatsAppChatId;
  toUserWidOrThrow?: (wid: WhatsAppChatId) => WhatsAppChatId;
};

export type WhatsAppChatApi = {
  getActiveChat: () => WhatsAppChat | undefined;
  get?: (chatId: string) => WhatsAppChat | undefined;
  find?: (chatId: string) => Promise<WhatsAppChat>;
  generateMessageID?: (chatId: string) => Promise<{ toString: (...arguments_: unknown[]) => string } | string>;
  getMessageById?: (messageId: string) => Promise<{ ack?: number } | undefined>;
  list?: (options?: { count?: number }) => Promise<WhatsAppChat[]>;
  getMessages?: (chatId: string, options?: { count?: number }) => Promise<WhatsAppIncomingMessage[]>;
  sendFileMessage: (chatId: string, file: File, options: Record<string, unknown>) => Promise<WhatsAppSendResult>;
  sendTextMessage: (chatId: string, text: string, options?: Record<string, unknown>) => Promise<WhatsAppSendResult>;
  markIsRecording: (chatId: string, duration: number) => Promise<void>;
  markIsComposing: (chatId: string, duration: number) => Promise<void>;
  markIsPaused: (chatId: string) => Promise<void>;
};

export type WhatsAppApi = {
  isReady?: boolean;
  isFullReady?: boolean;
  isInjected?: boolean;
  on?: (event: string, listener: (payload: unknown) => void) => void;
  loader: {
    injectLoader: () => void;
    onReady: (callback: () => void) => void;
    onFullReady?: (callback: () => void) => void;
  };
  chat: WhatsAppChatApi;
  contact?: WhatsAppContactApi;
  conn?: WhatsAppConnectionApi;
  whatsapp?: {
    UserPrefs?: WhatsAppUserPrefsApi;
    WidFactory?: WhatsAppWidFactoryApi;
  };
};
