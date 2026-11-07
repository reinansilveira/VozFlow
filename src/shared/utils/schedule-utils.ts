import type { ScheduleRecipient } from '../types';

export type ParsedRecipients = {
  recipients: ScheduleRecipient[];
  errors: string[];
};

const normalizePhone = (value: string): string => {
  let phone = value.replace(/\D/g, '');
  if (phone.startsWith('0') && (phone.length === 11 || phone.length === 12)) phone = phone.slice(1);
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  return phone;
};

export const parseScheduleRecipients = (value: string): ParsedRecipients => {
  const recipients: ScheduleRecipient[] = [];
  const errors: string[] = [];
  const usedPhones = new Set<string>();

  value.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const parts = line.split(';');
    const rawPhone = parts.length > 1 ? parts.at(-1) || '' : parts[0];
    const phone = normalizePhone(rawPhone);
    const name = parts.length > 1 ? parts.slice(0, -1).join(';').trim() : phone;

    if (phone.length < 12 || phone.length > 15) {
      errors.push(`Linha ${index + 1}: informe um telefone com DDI e DDD.`);
      return;
    }
    if (usedPhones.has(phone)) return;

    usedPhones.add(phone);
    recipients.push({
      id: crypto.randomUUID(),
      name: name || phone,
      phone,
      chatId: `${phone}@c.us`,
    });
  });

  return { recipients, errors };
};

const moveToAllowedDay = (date: Date, weekdaysOnly: boolean): Date => {
  if (!weekdaysOnly) return date;
  const nextDate = new Date(date);
  while (nextDate.getDay() === 0 || nextDate.getDay() === 6) nextDate.setDate(nextDate.getDate() + 1);
  return nextDate;
};

export const distributeRecipientDates = (
  recipients: ScheduleRecipient[],
  startsAt: number,
  dailyLimit: number,
  intervalMinutes: number,
  weekdaysOnly: boolean,
): Array<{ recipient: ScheduleRecipient; scheduledAt: number }> => {
  const safeDailyLimit = Math.max(1, Math.floor(dailyLimit));
  const safeInterval = Math.max(1, Math.floor(intervalMinutes));
  const initialDate = moveToAllowedDay(new Date(startsAt), weekdaysOnly);

  return recipients.map((recipient, index) => {
    const dayOffset = Math.floor(index / safeDailyLimit);
    const positionInDay = index % safeDailyLimit;
    let deliveryDay = new Date(initialDate);

    for (let day = 0; day < dayOffset; day += 1) {
      deliveryDay.setDate(deliveryDay.getDate() + 1);
      deliveryDay = moveToAllowedDay(deliveryDay, weekdaysOnly);
    }

    deliveryDay.setMinutes(deliveryDay.getMinutes() + positionInDay * safeInterval);
    return { recipient, scheduledAt: deliveryDay.getTime() };
  });
};

export const toLocalDateTimeValue = (timestamp: number): string => {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
};

export const getDefaultScheduleStart = (): string => {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  start.setSeconds(0, 0);
  return toLocalDateTimeValue(start.getTime());
};
