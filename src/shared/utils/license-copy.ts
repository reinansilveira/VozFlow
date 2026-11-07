import type { LicenseLocalState } from '../types';

// Textos de cada estado da licença, compartilhados pelo painel e pelos avisos de envio bloqueado.

export type LicenseAction = 'trial' | 'activate' | 'buy' | 'support' | 'retry' | 'update';
export type LicenseTone = 'ok' | 'warning' | 'blocked' | 'neutral';

export type LicenseCopy = {
  title: string;
  description: string;
  tone: LicenseTone;
  actions: LicenseAction[];
};

export const licenseCopy: Record<LicenseLocalState, LicenseCopy> = {
  verificando: { title: 'Verificando sua licença', description: 'Abra uma conversa no WhatsApp Web para concluir a verificação.', tone: 'neutral', actions: ['retry'] },
  whatsapp_desconectado: { title: 'WhatsApp desconectado', description: 'Conecte o WhatsApp Web para verificar sua licença.', tone: 'neutral', actions: ['retry'] },
  nao_configurado: { title: 'Licenciamento indisponível', description: 'Esta versão do VozFlow foi gerada sem o servidor de licenças.', tone: 'blocked', actions: ['support'] },
  sem_acesso: { title: 'Teste grátis por 3 dias', description: 'Use todos os recursos sem cartão. Depois, é só assinar.', tone: 'neutral', actions: ['trial', 'activate', 'buy'] },
  teste_ativo: { title: 'Teste grátis ativo', description: 'Aproveite todos os recursos durante o teste.', tone: 'ok', actions: ['activate', 'buy'] },
  teste_expirado: { title: 'Seu teste terminou', description: 'Assine para continuar enviando. Sua biblioteca continua salva.', tone: 'blocked', actions: ['buy', 'activate'] },
  teste_negado_instalacao: { title: 'Teste já utilizado', description: 'Este computador já usou o teste grátis. Assine para continuar.', tone: 'blocked', actions: ['buy', 'activate'] },
  licenca_ativa: { title: 'Licença ativa', description: 'Tudo certo para enviar.', tone: 'ok', actions: [] },
  licenca_suspensa: { title: 'Licença suspensa', description: 'Há uma pendência na sua assinatura. Fale com o suporte.', tone: 'blocked', actions: ['support', 'retry'] },
  licenca_revogada: { title: 'Licença cancelada', description: 'Esta licença não está mais ativa. Assine novamente para continuar.', tone: 'blocked', actions: ['buy', 'support'] },
  licenca_expirada: { title: 'Licença vencida', description: 'Renove a assinatura para voltar a enviar. Sua biblioteca continua salva.', tone: 'blocked', actions: ['buy', 'activate'] },
  chave_invalida: { title: 'Chave não encontrada', description: 'Confira a chave recebida após a compra e tente de novo.', tone: 'warning', actions: ['activate', 'support'] },
  limite_numeros: { title: 'Limite de números atingido', description: 'Esta chave já está em uso no limite do plano. Fale com o suporte para trocar o número.', tone: 'warning', actions: ['support', 'activate'] },
  numero_bloqueado: { title: 'Número bloqueado', description: 'Este número não pode usar o VozFlow. Fale com o suporte.', tone: 'blocked', actions: ['support'] },
  versao_desatualizada: { title: 'Atualize o VozFlow', description: 'Esta versão não é mais aceita. Atualize a extensão para continuar.', tone: 'blocked', actions: ['update'] },
};

export const licenseBlockedMessage = (state: LicenseLocalState): string => {
  if (state === 'sem_acesso') return 'Para enviar, comece o teste grátis ou ative sua chave no painel do VozFlow.';
  return `Envio bloqueado: ${licenseCopy[state].title.toLowerCase()}. Abra o VozFlow para resolver.`;
};
