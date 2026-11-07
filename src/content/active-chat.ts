export type WhatsAppChatId = {
  _serialized?: string;
  user?: string;
  server?: string;
  toString?: (...arguments_: unknown[]) => string;
};

export type WhatsAppChat = {
  id?: WhatsAppChatId;
  formattedTitle?: string;
  name?: string;
  contact?: {
    formattedName?: string;
    name?: string;
    pushname?: string;
  };
};

export type WhatsAppContactApi = {
  getPnLidEntry?: (chatId: string) => Promise<{ lid?: WhatsAppChatId; phoneNumber?: WhatsAppChatId }>;
  queryExists?: (chatId: string) => Promise<{
    wid?: WhatsAppChatId;
    lid?: WhatsAppChatId;
  } | null>;
};

const chatIdPattern = /(?:^|[^0-9A-Za-z.:-])([0-9A-Za-z.-]+)(?::[0-9]+)?@(c\.us|g\.us|lid|newsletter)(?=$|[^0-9A-Za-z.-])/;

export const extractWhatsAppChatId = (value: string): string => {
  const match = value.match(chatIdPattern);
  return match ? `${match[1]}@${match[2]}` : '';
};

export const getSerializedWhatsAppId = (id?: WhatsAppChatId): string => {
  const serializedId = id?._serialized;
  if (serializedId) return extractWhatsAppChatId(serializedId);

  try {
    return extractWhatsAppChatId(id?.toString?.() || '');
  } catch {
    return '';
  }
};

export const getWhatsAppChatId = (chat?: WhatsAppChat): string => getSerializedWhatsAppId(chat?.id);

export const getWhatsAppChatName = (chat?: WhatsAppChat): string => (
  chat?.formattedTitle
  || chat?.name
  || chat?.contact?.formattedName
  || chat?.contact?.name
  || chat?.contact?.pushname
  || ''
).trim();

export const normalizeChatName = (name: string): string => name
  .normalize('NFD')
  .replace(/[\u0300-\u036f\uFE0F]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('pt-BR');

export const findChatByExactName = (chats: WhatsAppChat[], visibleName: string): WhatsAppChat | undefined => {
  const normalizedVisibleName = normalizeChatName(visibleName);
  if (!normalizedVisibleName) return undefined;

  const matches = chats.filter((chat) => normalizeChatName(getWhatsAppChatName(chat)) === normalizedVisibleName);
  return matches.length === 1 ? matches[0] : undefined;
};

export const getChatPhone = async (chatId: string, contactApi?: WhatsAppContactApi): Promise<string> => {
  if (chatId.endsWith('@c.us')) return chatId.slice(0, -'@c.us'.length).replace(/\D/g, '');
  if (!chatId.endsWith('@lid')) return '';

  try {
    const mapping = await contactApi?.getPnLidEntry?.(chatId);
    const phoneId = getSerializedWhatsAppId(mapping?.phoneNumber);
    return phoneId.endsWith('@c.us') ? phoneId.slice(0, -'@c.us'.length).replace(/\D/g, '') : '';
  } catch {
    return '';
  }
};

export const resolvePhoneChatId = async (
  chatId: string,
  contactApi?: WhatsAppContactApi,
  ownLidAvailable = false,
): Promise<string> => {
  if (chatId.endsWith('@lid') && !ownLidAvailable) {
    const mapping = await contactApi?.getPnLidEntry?.(chatId);
    const phoneId = getSerializedWhatsAppId(mapping?.phoneNumber);
    if (phoneId.endsWith('@c.us')) return phoneId;
    throw new Error('O WhatsApp ainda está sincronizando a identificação desta conversa. Tentaremos novamente.');
  }
  if (!chatId.endsWith('@c.us')) return chatId;

  const phone = chatId.slice(0, -'@c.us'.length);
  if (!contactApi?.queryExists) {
    throw new Error('O WhatsApp ainda não carregou a validação de contatos. Tentaremos novamente.');
  }

  const contact = await contactApi.queryExists(chatId);
  if (!contact) {
    throw new Error(`O número +${phone} não foi encontrado no WhatsApp. Confira o DDI e o DDD.`);
  }

  // Contas que ainda não migraram para LID continuam aceitando o identificador
  // telefônico validado. Forçar um LID nesse estado quebra o envio no WA-JS.
  if (!ownLidAvailable) return chatId;

  const wid = getSerializedWhatsAppId(contact.wid) || chatId;
  const lid = getSerializedWhatsAppId(contact.lid);
  if (lid.endsWith('@lid')) return lid;
  if (wid.endsWith('@c.us')) return wid;

  const mapping = await contactApi.getPnLidEntry?.(chatId);
  const mappedPhoneId = getSerializedWhatsAppId(mapping?.phoneNumber);
  if (mappedPhoneId.endsWith('@c.us')) return mappedPhoneId;
  const mappedLid = getSerializedWhatsAppId(mapping?.lid);
  if (mappedLid.endsWith('@lid')) return mappedLid;

  throw new Error(`O WhatsApp não liberou o identificador do número +${phone}. Abra essa conversa uma vez e tente novamente.`);
};
