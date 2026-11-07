

export type ActivityEvent = {
  kind: 'assinatura' | 'teste';
  plan: string;
  region: string | null;
  at: string;
};

export const parseActivity = (body: unknown): ActivityEvent[] => {
  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events)) return [];
  return events.filter((event): event is ActivityEvent => (
    (event?.kind === 'assinatura' || event?.kind === 'teste')
    && typeof event.plan === 'string'
    && (event.region === null || typeof event.region === 'string')
    && typeof event.at === 'string'
    && !Number.isNaN(Date.parse(event.at))
  ));
};

export const describeActivity = (event: ActivityEvent): string => {
  const who = event.region ? `Alguém ${event.region}` : 'Alguém';
  return event.kind === 'assinatura' ? `${who} assinou o plano ${event.plan}` : `${who} começou o teste grátis`;
};

export type ActivityTone = 'pro' | 'essencial' | 'teste';

// Define a cor do selo do plano no aviso.
export const activityTone = (event: ActivityEvent): ActivityTone => {
  if (event.kind === 'teste') return 'teste';
  return event.plan.toLowerCase() === 'pro' ? 'pro' : 'essencial';
};

export const activityBadge = (event: ActivityEvent): string => (event.kind === 'teste' ? 'Teste grátis' : `Plano ${event.plan}`);

export const timeAgo =(iso: string, nowMs: number): string => {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
};

// Evento cadastrado à mão: 'AAAA-MM-DD HH:mm' no horário de Brasília (UTC-3, sem horário de verão).
const manualFormat = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/;

export const manualToIso = (at: string): string => {
  const match = at.match(manualFormat);
  return match ? `${match[1]}T${match[2]}:00-03:00` : at;
};

// Evento cadastrado à mão também pode trazer o texto pronto (ex.: 'há 1 hora'), mostrado como está.
export const activityTime = (event: ActivityEvent, now: Date): string => {
  const iso = manualToIso(event.at);
  return Number.isNaN(Date.parse(iso)) ? event.at : timeAgo(iso, now.getTime());
};
