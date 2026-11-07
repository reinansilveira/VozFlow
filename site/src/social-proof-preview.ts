// Números de EXEMPLO para ver o visual no `npm run site:dev`.
// Só é carregado com import.meta.env.DEV; o build de produção não inclui este arquivo.
import type { ProofAvatar, ProofStat } from './social-proof';

export const previewHeadline = '+ de 20 mil empreendedores já mudaram seus negócios com a gente.';

export const previewAvatars: ProofAvatar[] = [
  { initials: 'AS', alt: 'Cliente de exemplo' },
  { initials: 'BL', alt: 'Cliente de exemplo' },
  { initials: 'CD', alt: 'Cliente de exemplo' },
];

export const previewStats: ProofStat[] = [
  { value: 2100, label: 'Assinantes ativos' },
  { value: 210000, label: 'Mensagens enviadas por dia' },
  { value: 20000, label: 'Downloads' },
];
