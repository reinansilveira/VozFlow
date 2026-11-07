
export type ProofStat = {
  value: number;
  suffix?: string;
  label: string;
};


export type ProofAvatar = {
  src?: string;
  initials?: string;
  icon?: string;
  alt: string;
};

export const proofHeadline = 'Junte-se a mais de 20 mil empreendedores que já atendem no WhatsApp com o VozFlow.';

export const proofAvatars: ProofAvatar[] = [
  { src: '/media/clientes/cliente-1.webp', alt: 'Cliente do VozFlow' },
  { src: '/media/clientes/cliente-2.webp', alt: 'Cliente do VozFlow' },
  { src: '/media/clientes/cliente-3.webp', alt: 'Cliente do VozFlow' },
  { src: '/media/clientes/cliente-4.webp', alt: 'Cliente do VozFlow' },
];


export const proofStats: ProofStat[] = [
  { value: 2100, label: 'Assinantes ativos' },
  { value: 210000, label: 'Mensagens enviadas por dia' },
  { value: 20000, label: 'Downloads' },
];
