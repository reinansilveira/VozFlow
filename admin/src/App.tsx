import { useCallback, useState, type ReactElement } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { BlockedView } from './components/BlockedView';
import { EventsView } from './components/EventsView';
import { LicensesView } from './components/LicensesView';
import { PlansView } from './components/PlansView';
import { SettingsView } from './components/SettingsView';
import { Shell, type AdminTab } from './components/Shell';
import { StatsBar } from './components/StatsBar';
import { TrialsView } from './components/TrialsView';
import { useAdminSession } from './hooks/use-admin-session';

export const App = (): ReactElement => {
  const { session, reload, signOut } = useAdminSession();
  const [tab, setTab] = useState<AdminTab>('licenses');
  const [statsKey, setStatsKey] = useState(0);
  const refreshStats = useCallback(() => setStatsKey((value) => value + 1), []);

  if (session.status !== 'ready') return <AuthScreen session={session} onChange={reload} onSignOut={signOut} />;

  return <Shell email={session.email} tab={tab} onTab={setTab} onSignOut={() => void signOut()}>
    <StatsBar refreshKey={statsKey} />
    {tab === 'licenses' && <LicensesView onChanged={refreshStats} />}
    {tab === 'trials' && <TrialsView onChanged={refreshStats} />}
    {tab === 'blocked' && <BlockedView onChanged={refreshStats} />}
    {tab === 'plans' && <PlansView />}
    {tab === 'events' && <EventsView />}
    {tab === 'settings' && <SettingsView />}
  </Shell>;
};
