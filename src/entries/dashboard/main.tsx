import { createRoot } from 'react-dom/client';
import { App } from '../sidepanel/App';
import '../../shared/styles/main.scss';

createRoot(document.getElementById('root')!).render(<App layout="dashboard" />);
