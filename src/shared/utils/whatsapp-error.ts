const lidUnavailablePattern = /no lid for user/i;

export const normalizeWhatsAppErrorMessage = (message: string): string => {
  if (lidUnavailablePattern.test(message)) {
    return 'O WhatsApp ainda está sincronizando a identificação da sua conta.';
  }

  return message;
};
