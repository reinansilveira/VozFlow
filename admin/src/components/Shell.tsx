import type { ReactElement, ReactNode } from 'react';

export type AdminTab = 'licenses' | 'trials' | 'blocked' | 'plans' | 'events' | 'settings';

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: 'licenses', label: 'Licenças' },
  { id: 'trials', label: 'Testes' },
  { id: 'blocked', label: 'Números bloqueados' },
  { id: 'plans', label: 'Planos' },
  { id: 'events', label: 'Eventos da Cakto' },
  { id: 'settings', label: 'Configurações' },
];

type ShellProps = { email: string; tab: AdminTab; onTab: (tab: AdminTab) => void; onSignOut: () => void; children: ReactNode };

export const Shell = ({ email, tab, onTab, onSignOut, children }: ShellProps): ReactElement => <div className="shell">
  <header className="shell__header">
    <div className="shell__brand"><img src="/favicon.svg" alt="" width={28} height={28} /><span>VozFlow <small>Admin</small></span></div>
    <div className="shell__account"><span>{email}</span><button type="button" className="button button--ghost" onClick={onSignOut}>Sair</button></div>
  </header>
  <nav className="shell__nav" aria-label="Seções do painel">
    {tabs.map((item) => <button key={item.id} type="button" className={`shell__tab ${tab === item.id ? 'shell__tab--active' : ''}`} aria-current={tab === item.id ? 'page' : undefined} onClick={() => onTab(item.id)}>{item.label}</button>)}
  </nav>
  <main className="shell__content">{children}</main>
</div>;
