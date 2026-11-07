// Mesma regra de `supabase/functions/_shared/phone.ts`: dígitos com código do país e
// celulares brasileiros sempre com o nono dígito, para comparar com o número do passe.
export const normalizePhone = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  let digits = raw.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 12 && /[6-9]/.test(digits[4])) {
    digits = `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
};
