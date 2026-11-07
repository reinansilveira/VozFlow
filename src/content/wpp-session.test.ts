import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WhatsAppApi, WhatsAppChatApi } from './wpp-api';
import {
  getMigrationLid,
  getOwnLid,
  getOwnPhone,
  isLidMigratedSession,
  isWppBaseOperational,
  isWppOperational,
  resolveScheduledDestination,
} from './wpp-session';
import { isTransientScheduleError } from '../shared/utils/schedule-retry';

const whatsappId = (value: string): { _serialized: string } => ({ _serialized: value });

afterEach(() => {
  vi.useRealTimers();
});

const createChatApi = (overrides: Partial<WhatsAppChatApi> = {}): WhatsAppChatApi => ({
  getActiveChat: () => undefined,
  sendFileMessage: async () => ({ id: 'file', ack: 1, sendMsgResult: { messageSendResult: 'OK' } }),
  sendTextMessage: async () => ({ id: 'text', ack: 1, sendMsgResult: { messageSendResult: 'OK' } }),
  markIsRecording: async () => undefined,
  markIsComposing: async () => undefined,
  markIsPaused: async () => undefined,
  ...overrides,
});

const createWpp = (overrides: Partial<WhatsAppApi> = {}): WhatsAppApi => ({
  isFullReady: true,
  loader: {
    injectLoader: () => undefined,
    onReady: () => undefined,
    onFullReady: () => undefined,
  },
  chat: createChatApi(),
  conn: {
    isMainReady: () => true,
    isAuthenticated: () => true,
    isOnline: () => true,
    getMigrationState: () => ({}),
  },
  ...overrides,
});

describe('WhatsApp session readiness', () => {
  it('requires the full runtime, main session, authentication and connection', () => {
    expect(isWppOperational(createWpp())).toBe(true);
    expect(isWppOperational(createWpp({ isFullReady: false }))).toBe(false);
    expect(isWppOperational(createWpp({ conn: undefined }))).toBe(false);
    expect(isWppOperational(createWpp({ conn: { isOnline: () => false } }))).toBe(false);
    expect(isWppOperational(createWpp({ conn: { isAuthenticated: () => { throw new Error('not ready'); } } }))).toBe(false);
    expect(isWppOperational(createWpp({ conn: {
      isMainReady: () => true,
      isAuthenticated: () => true,
      isOnline: () => true,
      getMigrationState: () => { throw new Error('migration state loading'); },
    } }))).toBe(false);
  });

  it('does not confuse migration metadata with an own LID ready for sending', () => {
    const reloadingSession = createWpp({ conn: {
      isMainReady: () => true,
      isAuthenticated: () => true,
      isOnline: () => true,
      getMigrationState: () => ({ currentLid: whatsappId('self@lid') }),
      getMyUserLid: () => { throw new Error('No LID for user'); },
    } });

    expect(getMigrationLid(reloadingSession)).toBe('self@lid');
    expect(getOwnLid(reloadingSession)).toBe('');
    expect(isWppBaseOperational(reloadingSession)).toBe(true);
    expect(isWppOperational(reloadingSession)).toBe(false);
  });

  it('waits when migration is confirmed even before currentLid becomes available', () => {
    const reloadingSession = createWpp({ conn: {
      isMainReady: () => true,
      isAuthenticated: () => true,
      isOnline: () => true,
      getMigrationState: () => ({ isLidMigrated: true }),
      getMyUserLid: () => { throw new Error('No LID for user'); },
    } });

    expect(getMigrationLid(reloadingSession)).toBe('');
    expect(isLidMigratedSession(reloadingSession)).toBe(true);
    expect(isWppOperational(reloadingSession)).toBe(false);
  });

  it('allows a truly non-migrated phone-number session without an own LID', () => {
    const phoneSession = createWpp({ conn: {
      isMainReady: () => true,
      isAuthenticated: () => true,
      isOnline: () => true,
      getMigrationState: () => ({
        isLidMigrated: false,
        isSyncdSessionMigrated: false,
        shouldApplyNonMigratedMessagingRules: true,
        currentPn: whatsappId('5511999999999@c.us'),
      }),
      getMyUserLid: () => { throw new Error('No LID for user'); },
    } });

    expect(isLidMigratedSession(phoneSession)).toBe(false);
    expect(isWppOperational(phoneSession)).toBe(true);
  });

  it('becomes operational when the migrated account exposes its usable own LID', () => {
    const readySession = createWpp({ conn: {
      isMainReady: () => true,
      isAuthenticated: () => true,
      isOnline: () => true,
      getMigrationState: () => ({ currentLid: whatsappId('self@lid') }),
      getMyUserLid: () => whatsappId('self@lid'),
    } });

    expect(getOwnLid(readySession)).toBe('self@lid');
    expect(isWppOperational(readySession)).toBe(true);
  });

  it('repairs the strict getter with the valid optional LID exposed by WhatsApp', () => {
    const strictGetter = vi.fn(() => { throw new Error('No LID for user'); });
    const userPrefs = {
      getMaybeMeLidUser: vi.fn(() => whatsappId('self@lid')),
      getMeLidUserOrThrow: strictGetter,
    };
    const compatibleSession = createWpp({
      conn: {
        isMainReady: () => true,
        isAuthenticated: () => true,
        isOnline: () => true,
        getMigrationState: () => ({ isLidMigrated: true }),
        getMyUserLid: () => userPrefs.getMeLidUserOrThrow(),
      },
      whatsapp: { UserPrefs: userPrefs },
    });

    expect(getOwnLid(compatibleSession)).toBe('self@lid');
    expect(isWppOperational(compatibleSession)).toBe(true);
    expect(strictGetter).toHaveBeenCalled();
  });

  it('uses the compatible UserPrefs getter when the connection shortcut is unavailable', () => {
    const userPrefs = {
      getMaybeMeLidUser: vi.fn(() => whatsappId('self@lid')),
      getMeLidUserOrThrow: vi.fn(() => { throw new Error('No LID for user'); }),
    };
    const compatibleSession = createWpp({
      conn: {
        isMainReady: () => true,
        isAuthenticated: () => true,
        isOnline: () => true,
        getMigrationState: () => ({ isLidMigrated: true }),
      },
      whatsapp: { UserPrefs: userPrefs },
    });

    expect(getOwnLid(compatibleSession)).toBe('self@lid');
    expect(isWppOperational(compatibleSession)).toBe(true);
  });

  it('repairs the strict getter with the valid user LID already exposed by the migrated session', () => {
    const strictGetter = vi.fn(() => { throw new Error('No LID for user'); });
    const userPrefs = { getMeLidUserOrThrow: strictGetter };
    const compatibleSession = createWpp({
      conn: {
        isMainReady: () => true,
        isAuthenticated: () => true,
        isOnline: () => true,
        getMigrationState: () => ({ currentLid: whatsappId('self@lid') }),
        getMyUserLid: () => userPrefs.getMeLidUserOrThrow(),
      },
      whatsapp: { UserPrefs: userPrefs },
    });

    expect(getOwnLid(compatibleSession)).toBe('self@lid');
    expect(isWppOperational(compatibleSession)).toBe(true);
    expect(userPrefs.getMeLidUserOrThrow()).toEqual(whatsappId('self@lid'));
  });

  it('retries a throttled negative-cache refresh until the optional LID becomes available', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T01:00:00-03:00'));

    let identityAvailable = false;
    let cachedLid: ReturnType<typeof whatsappId> | undefined;
    const optionalGetter = vi.fn(() => cachedLid);
    const clearGetMaybeLidUserCache = vi.fn(() => {
      cachedLid = identityAvailable ? whatsappId('self@lid') : undefined;
    });
    const strictGetter = vi.fn(() => {
      const lid = optionalGetter();
      if (!lid) throw new Error('No LID for user');
      return lid;
    });
    const userPrefs = {
      clearGetMaybeLidUserCache,
      getMaybeMeLidUser: optionalGetter,
      getMeLidUserOrThrow: strictGetter,
    };
    const reloadingSession = createWpp({
      conn: {
        isMainReady: () => true,
        isAuthenticated: () => true,
        isOnline: () => true,
        getMigrationState: () => ({ isLidMigrated: true }),
        getMyUserLid: () => userPrefs.getMeLidUserOrThrow(),
      },
      whatsapp: { UserPrefs: userPrefs },
    });

    expect(getOwnLid(reloadingSession)).toBe('');
    expect(clearGetMaybeLidUserCache).toHaveBeenCalledTimes(1);

    identityAvailable = true;
    vi.advanceTimersByTime(1_000);
    expect(getOwnLid(reloadingSession)).toBe('');
    expect(clearGetMaybeLidUserCache).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_000);
    expect(getOwnLid(reloadingSession)).toBe('self@lid');
    expect(clearGetMaybeLidUserCache).toHaveBeenCalledTimes(2);
    expect(isWppOperational(reloadingSession)).toBe(true);
  });

  it('normalizes the own device LID through WidFactory before repairing the strict getter', () => {
    const deviceLid = {
      _serialized: '123:4@lid',
      user: '123',
      server: 'lid',
    };
    const userLid = {
      _serialized: '123@lid',
      user: '123',
      server: 'lid',
    };
    const userPrefs = {
      getMaybeMeDeviceLid: vi.fn(() => deviceLid),
      getMeLidUserOrThrow: vi.fn(() => { throw new Error('No LID for user'); }),
    };
    const toUserWidOrThrow = vi.fn(() => userLid);
    const compatibleSession = createWpp({
      conn: {
        isMainReady: () => true,
        isAuthenticated: () => true,
        isOnline: () => true,
        getMigrationState: () => ({ isLidMigrated: true }),
        getMyUserLid: () => userPrefs.getMeLidUserOrThrow(),
      },
      whatsapp: {
        UserPrefs: userPrefs,
        WidFactory: { toUserWidOrThrow },
      },
    });

    expect(getOwnLid(compatibleSession)).toBe('123@lid');
    expect(getOwnLid(compatibleSession)).not.toBe('4@lid');
    expect(isWppOperational(compatibleSession)).toBe(true);
    expect(toUserWidOrThrow).toHaveBeenCalledWith(deviceLid);
  });

  it('rejects a device LID when WhatsApp does not expose a WidFactory normalizer', () => {
    const userPrefs = {
      getMaybeMeDeviceLid: vi.fn(() => ({
        _serialized: '123:4@lid',
        user: '123',
        server: 'lid',
      })),
      getMeLidUserOrThrow: vi.fn(() => { throw new Error('No LID for user'); }),
    };
    const incompatibleSession = createWpp({
      conn: {
        isMainReady: () => true,
        isAuthenticated: () => true,
        isOnline: () => true,
        getMigrationState: () => ({ isLidMigrated: true }),
        getMyUserLid: () => userPrefs.getMeLidUserOrThrow(),
      },
      whatsapp: { UserPrefs: userPrefs },
    });

    expect(getOwnLid(incompatibleSession)).toBe('');
    expect(() => userPrefs.getMeLidUserOrThrow()).toThrow('No LID for user');
    expect(isWppOperational(incompatibleSession)).toBe(false);
  });

  it('does not mistake a device id returned directly by the connection for a user LID', () => {
    const deviceOnlySession = createWpp({
      conn: {
        isMainReady: () => true,
        isAuthenticated: () => true,
        isOnline: () => true,
        getMigrationState: () => ({ isLidMigrated: true }),
        getMyUserLid: () => ({ _serialized: '123:4@lid', user: '123', server: 'lid' }),
      },
    });

    expect(getOwnLid(deviceOnlySession)).toBe('');
    expect(isWppOperational(deviceOnlySession)).toBe(false);
  });

  it('rejects a WidFactory result that still contains a device id', () => {
    const deviceLid = {
      _serialized: '123:4@lid',
      user: '123',
      server: 'lid',
    };
    const userPrefs = {
      getMaybeMeDeviceLid: vi.fn(() => deviceLid),
      getMeLidUserOrThrow: vi.fn(() => { throw new Error('No LID for user'); }),
    };
    const incompatibleSession = createWpp({
      conn: {
        getMigrationState: () => ({ isLidMigrated: true }),
        getMyUserLid: () => userPrefs.getMeLidUserOrThrow(),
      },
      whatsapp: {
        UserPrefs: userPrefs,
        WidFactory: { toUserWidOrThrow: vi.fn(() => deviceLid) },
      },
    });

    expect(getOwnLid(incompatibleSession)).toBe('');
    expect(() => userPrefs.getMeLidUserOrThrow()).toThrow('No LID for user');
  });

  it('does not repair the strict getter with an invalid optional identity', () => {
    const userPrefs = {
      getMaybeMeLidUser: vi.fn(() => whatsappId('5511999999999@c.us')),
      getMeLidUserOrThrow: vi.fn(() => { throw new Error('No LID for user'); }),
    };
    const incompatibleSession = createWpp({
      conn: {
        isMainReady: () => true,
        isAuthenticated: () => true,
        isOnline: () => true,
        getMigrationState: () => ({ isLidMigrated: true }),
        getMyUserLid: () => userPrefs.getMeLidUserOrThrow(),
      },
      whatsapp: { UserPrefs: userPrefs },
    });

    expect(getOwnLid(incompatibleSession)).toBe('');
    expect(isWppOperational(incompatibleSession)).toBe(false);
  });
});

describe('scheduled destination resolution', () => {
  it('treats a missing canonical chat resolver as a transient loading error', async () => {
    const wpp = createWpp({
      contact: {
        queryExists: vi.fn().mockResolvedValue({ wid: whatsappId('5511999999999@c.us') }),
      },
    });

    const error = await resolveScheduledDestination(wpp, '5511999999999@c.us')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('ainda está carregando');
    expect(isTransientScheduleError((error as Error).message)).toBe(true);
  });

  it('uses a canonical LID when the current account has its own LID', async () => {
    const find = vi.fn().mockResolvedValue({ id: whatsappId('contact@lid') });
    const wpp = createWpp({
      chat: createChatApi({ find }),
      conn: {
        getMigrationState: () => ({ currentLid: whatsappId('self@lid') }),
        getMyUserLid: () => whatsappId('self@lid'),
      },
      contact: {
        queryExists: vi.fn().mockResolvedValue({
          wid: whatsappId('5511999999999@c.us'),
          lid: whatsappId('contact@lid'),
        }),
      },
    });

    await expect(resolveScheduledDestination(wpp, '5511999999999@c.us')).resolves.toBe('contact@lid');
    expect(find).toHaveBeenCalledWith('contact@lid');
  });

  it('waits instead of falling back to a phone id when the canonical LID is unavailable after reload', async () => {
    const find = vi.fn().mockResolvedValue({ id: whatsappId('contact@lid') });
    const wpp = createWpp({
      chat: createChatApi({ find }),
      conn: {
        getMigrationState: () => ({ currentLid: whatsappId('self@lid') }),
        getMyUserLid: () => { throw new Error('No LID for user'); },
      },
      contact: {
        queryExists: vi.fn().mockResolvedValue({
          wid: whatsappId('5511999999999@c.us'),
          lid: whatsappId('contact@lid'),
        }),
      },
    });

    await expect(resolveScheduledDestination(wpp, '5511999999999@c.us'))
      .rejects.toThrow('preparando a identificação segura');
    expect(find).toHaveBeenCalledWith('5511999999999@c.us');
  });

  it('preserves a phone destination only when the canonical chat also remains a phone id', async () => {
    const find = vi.fn().mockResolvedValue({ id: whatsappId('5511999999999@c.us') });
    const wpp = createWpp({
      chat: createChatApi({ find }),
      contact: {
        queryExists: vi.fn().mockResolvedValue({ wid: whatsappId('contact@lid') }),
      },
    });

    await expect(resolveScheduledDestination(wpp, '5511999999999@c.us'))
      .resolves.toBe('5511999999999@c.us');
  });

  it('maps a captured contact LID to phone only when WhatsApp keeps the phone chat canonical', async () => {
    const wpp = createWpp({
      chat: createChatApi({ find: vi.fn().mockResolvedValue({ id: whatsappId('5511999999999@c.us') }) }),
      contact: {
        getPnLidEntry: vi.fn().mockResolvedValue({ phoneNumber: whatsappId('5511999999999@c.us') }),
      },
    });

    await expect(resolveScheduledDestination(wpp, 'contact@lid')).resolves.toBe('5511999999999@c.us');
  });

  it('waits instead of sending a group with an incomplete own identity', async () => {
    const wpp = createWpp({
      chat: createChatApi({ find: vi.fn().mockResolvedValue({ id: whatsappId('123@g.us') }) }),
    });

    await expect(resolveScheduledDestination(wpp, '123@g.us')).rejects.toThrow('sincronizando');
  });
});

describe('own phone detection', () => {
  it('reads the connected account phone from the first available source', () => {
    const wpp = createWpp();
    wpp.conn = { ...wpp.conn, getMyUserId: () => whatsappId('5579998426046@c.us') };
    expect(getOwnPhone(wpp)).toBe('5579998426046');
  });

  it('falls back to the paired ids and ignores LID identifiers', () => {
    const wpp = createWpp();
    wpp.conn = { ...wpp.conn, getMyUserId: () => whatsappId('123456789@lid') };
    wpp.whatsapp = { UserPrefs: { getMePNandLIDWids: () => [whatsappId('557998426046@c.us'), whatsappId('99@lid')] } };
    expect(getOwnPhone(wpp)).toBe('557998426046');
  });

  it('returns nothing while the session is not authenticated', () => {
    const wpp = createWpp();
    wpp.conn = { ...wpp.conn, isAuthenticated: () => false, getMyUserId: () => whatsappId('5579998426046@c.us') };
    expect(getOwnPhone(wpp)).toBe('');
    expect(getOwnPhone(undefined)).toBe('');
  });
});
