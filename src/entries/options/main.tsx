import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';
import '../../shared/styles/main.scss';

const Options = (): ReactElement => <main className="options"><h1>Configurações do VozFlow</h1><p>Configurações de segurança e automação estarão disponíveis aqui.</p></main>;

createRoot(document.getElementById('root')!).render(<Options />);
