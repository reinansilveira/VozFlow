// Normaliza telefones (já com código do país) para dígitos no formato E.164 sem "+". Celulares brasileiros antigos,
// sem o nono dígito (como o WhatsApp às vezes informa), ganham o 9 após o DDD para que o
// mesmo número sempre gere a mesma chave de busca.
export const normalizePhone = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  let digits = raw.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 12 && /[6-9]/.test(digits[4])) {
    digits = `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
};
