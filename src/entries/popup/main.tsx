import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';
import '../../shared/styles/main.scss';

const Popup = (): ReactElement => {
  const handleOpen = (): void => {
    void chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' }).then(() => window.close());
  };

  return <main className="popup"><strong>VozFlow</strong><p>Gerencie sua biblioteca e automações no painel completo.</p><button className="button button--primary" onClick={handleOpen}>Abrir painel</button></main>;
};

createRoot(document.getElementById('root')!).render(<Popup />);
