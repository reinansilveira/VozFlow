import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Icon, type IconName } from '../../shared/components/Icon';
import { encodeOggOpus } from '../../shared/services/audio-encoder';
import { getAllItems, markItemUsed, openLibrary, removeItem, saveItem } from '../../shared/services/library-service';
import { applyTheme, getInitialTheme, type Theme } from '../../shared/services/theme-service';
import type { ActiveChatChangedMessage, ActiveChatContext, ActiveJob, AudioItem, DocumentItem, ExtensionMessage, Funnel, FunnelStep, ImageItem, MediaType, TextItem } from '../../shared/types';
import { LicenseCard } from './components/LicenseCard';
import { AutomationView } from './components/AutomationView';
import { SchedulesView } from './components/SchedulesView';

type Tab = 'home' | 'messages' | 'funnels' | 'schedules' | 'automation' | 'reports';
type AppLayout = 'panel' | 'dashboard';
type Notice = { message: string; isError?: boolean } | null;
type Option = { id: string; name: string };
type RuntimeResponse = { ok: boolean; error?: string };

const maxAudioSize = 32 * 1024 * 1024;
const maxImageSize = 16 * 1024 * 1024;
const maxDocumentSize = 100 * 1024 * 1024;

export const App = ({ layout = 'panel' }: { layout?: AppLayout }): ReactElement => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [database, setDatabase] = useState<IDBDatabase | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [audios, setAudios] = useState<AudioItem[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [currentChat, setCurrentChat] = useState<ActiveChatContext>({ chatId: '', chatName: 'Conversa atual', phone: '' });
  const [sentToday, setSentToday] = useState(0);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [audioName, setAudioName] = useState('');
  const [imageName, setImageName] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [funnelName, setFunnelName] = useState('');
  const [steps, setSteps] = useState<FunnelStep[]>([]);
  const [editingFunnelId, setEditingFunnelId] = useState<string | null>(null);
  const [isConvertingAudio, setIsConvertingAudio] = useState(false);

  const showNotice = (message: string, isError = false): void => setNotice({ message, isError });

  useEffect(() => applyTheme(theme), [theme]);

  const refreshLibrary = async (nextDatabase: IDBDatabase): Promise<void> => {
    const [nextAudios, nextImages, nextTexts, nextDocuments, nextFunnels] = await Promise.all([
      getAllItems<AudioItem>(nextDatabase, 'audios'),
      getAllItems<ImageItem>(nextDatabase, 'images'),
      getAllItems<TextItem>(nextDatabase, 'texts'),
      getAllItems<DocumentItem>(nextDatabase, 'documents'),
      getAllItems<Funnel>(nextDatabase, 'funnels'),
    ]);
    setAudios(nextAudios.sort((first, second) => second.createdAt - first.createdAt));
    setImages(nextImages.sort((first, second) => second.createdAt - first.createdAt));
    setTexts(nextTexts.sort((first, second) => second.createdAt - first.createdAt));
    setDocuments(nextDocuments.sort((first, second) => second.createdAt - first.createdAt));
    setFunnels(nextFunnels.sort((first, second) => second.createdAt - first.createdAt));
  };

  useEffect(() => {
    openLibrary().then((nextDatabase) => {
      setDatabase(nextDatabase);
      return refreshLibrary(nextDatabase);
    }).catch(() => showNotice('Não foi possível abrir sua biblioteca.', true));
  }, []);

  useEffect(() => {
    if (layout !== 'panel') return undefined;

    const handlePageEvent = (event: MessageEvent): void => {
      if (event.data?.source !== 'vozflow-page' || !event.data.payload) return;
      const payload = event.data.payload as { type?: string; jobId?: string; chatId?: string; chatName?: string; phone?: string; lastInboundAt?: number; step?: number; total?: number; remainingSeconds?: number; indicator?: 'typing' | 'recording'; message?: string };
      if (payload.type === 'CHAT_CONTEXT' && payload.chatName) setCurrentChat({ chatId: payload.chatId || '', chatName: payload.chatName, phone: payload.phone || '', lastInboundAt: payload.lastInboundAt });
      if (payload.type === 'ERROR') showNotice(payload.message || 'Falha ao enviar a mensagem.', true);
      if (payload.type === 'SENT') { setSentToday((value) => value + 1); showNotice(`Mensagem enviada para ${payload.chatName || 'a conversa aberta'}.`); }
      if (payload.type === 'FUNNEL_STARTED' && payload.jobId) setActiveJobs((jobs) => jobs.some((job) => job.id === payload.jobId) ? jobs : [...jobs, { id: payload.jobId!, funnelName: 'Funil em andamento', chatName: payload.chatName || 'Conversa atual', step: 0, total: payload.total || 0, remainingSeconds: 0 }]);
      if (payload.type === 'FUNNEL_PROGRESS' && payload.jobId) setActiveJobs((jobs) => jobs.map((job) => job.id === payload.jobId ? { ...job, chatName: payload.chatName || job.chatName, step: payload.step || job.step, total: payload.total || job.total, remainingSeconds: payload.remainingSeconds || 0, indicator: payload.indicator } : job));
      if (payload.type === 'FUNNEL_STEP_SENT') setSentToday((value) => value + 1);
      if ((payload.type === 'FUNNEL_DONE' || payload.type === 'FUNNEL_ERROR') && payload.jobId) setActiveJobs((jobs) => jobs.filter((job) => job.id !== payload.jobId));
    };
    window.addEventListener('message', handlePageEvent);
    return () => window.removeEventListener('message', handlePageEvent);
  }, [layout]);

  useEffect(() => {
    const handleActiveChat = (message: ActiveChatChangedMessage): void => {
      if (message.type === 'ACTIVE_CHAT_CHANGED') setCurrentChat({ chatId: message.chatId, chatName: message.chatName, phone: message.phone, lastInboundAt: message.lastInboundAt });
    };
    const runtimeMessages = typeof chrome !== 'undefined' ? chrome.runtime?.onMessage : undefined;
    runtimeMessages?.addListener(handleActiveChat);

    const requestActiveChat = (): void => {
      if (layout === 'panel') {
        window.parent.postMessage({ source: 'vozflow-panel', payload: { type: 'GET_ACTIVE_CHAT' } }, '*');
        return;
      }
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) void chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CHAT' }).catch(() => undefined);
    };

    requestActiveChat();
    const interval = window.setInterval(requestActiveChat, 2_000);
    return () => {
      runtimeMessages?.removeListener(handleActiveChat);
      window.clearInterval(interval);
    };
  }, [layout]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const audioOptions = useMemo<Option[]>(() => audios.map(({ id, name }) => ({ id, name })), [audios]);
  const imageOptions = useMemo<Option[]>(() => images.map(({ id, name }) => ({ id, name })), [images]);
  const documentOptions = useMemo<Option[]>(() => documents.map(({ id, name }) => ({ id, name })), [documents]);

  const sendMessage = async (message: ExtensionMessage): Promise<void> => {
    if (layout === 'dashboard') {
      const response = await chrome.runtime.sendMessage(message) as RuntimeResponse;
      if (!response?.ok) throw new Error(response?.error || 'Não foi possível acessar o WhatsApp Web.');
      return;
    }

    window.parent.postMessage({ source: 'vozflow-panel', payload: message }, '*');
  };

  const handleAudioFile = (file?: File): void => {
    if (!file) return;
    if (file.size > maxAudioSize) return showNotice('O áudio ultrapassa o limite de 32 MB.', true);
    setAudioFile(file);
    setAudioName(file.name.replace(/\.[^.]+$/, ''));
  };

  const handleImageFile = (file?: File): void => {
    if (!file) return;
    if (file.size > maxImageSize) return showNotice('A imagem ultrapassa o limite de 16 MB.', true);
    setImageFile(file);
    setImageName(file.name.replace(/\.[^.]+$/, ''));
  };

  const handleDocumentFile = (file?: File): void => {
    if (!file) return;
    if (file.size > maxDocumentSize) return showNotice('O documento ultrapassa o limite de 100 MB.', true);
    setDocumentFile(file);
    setDocumentName(file.name.replace(/\.[^.]+$/, ''));
  };

  const saveAudio = async (): Promise<void> => {
    if (!database || !audioFile || !audioName.trim()) return;
    setIsConvertingAudio(true);
    try {
      const encodedAudio = await encodeOggOpus(audioFile);
      await saveItem(database, 'audios', { id: crypto.randomUUID(), name: audioName.trim(), ...encodedAudio, createdAt: Date.now() } satisfies AudioItem);
      setAudioFile(null);
      setAudioName('');
      await refreshLibrary(database);
      showNotice('Áudio convertido e salvo na biblioteca.');
    } catch (error) { showNotice(error instanceof Error ? error.message : 'Falha ao converter o áudio.', true); }
    finally { setIsConvertingAudio(false); }
  };

  const saveImage = async (): Promise<void> => {
    if (!database || !imageFile || !imageName.trim()) return;
    await saveItem(database, 'images', { id: crypto.randomUUID(), name: imageName.trim(), bytes: await imageFile.arrayBuffer(), mimeType: imageFile.type, createdAt: Date.now() } satisfies ImageItem);
    setImageFile(null);
    setImageName('');
    await refreshLibrary(database);
    showNotice('Imagem salva na biblioteca.');
  };

  const saveDocument = async (): Promise<void> => {
    if (!database || !documentFile || !documentName.trim()) return;
    await saveItem(database, 'documents', {
      id: crypto.randomUUID(),
      name: documentName.trim(),
      fileName: documentFile.name,
      bytes: await documentFile.arrayBuffer(),
      mimeType: documentFile.type || 'application/octet-stream',
      size: documentFile.size,
      createdAt: Date.now(),
    } satisfies DocumentItem);
    setDocumentFile(null);
    setDocumentName('');
    await refreshLibrary(database);
    showNotice('Documento salvo na biblioteca.');
  };

  const sendAudio = async (audio: AudioItem): Promise<void> => {
    try { await sendMessage({ type: 'SEND_AUDIO', audio: { name: audio.name, bytes: audio.bytes.slice(0) } }); if (database) await markItemUsed(database, 'audios', audio); showNotice(`Enviando “${audio.name}”...`); }
    catch (error) { showNotice(error instanceof Error ? error.message : 'Falha ao enviar áudio.', true); }
  };

  const sendImage = async (image: ImageItem): Promise<void> => {
    try { await sendMessage({ type: 'SEND_IMAGE', image: { name: image.name, mimeType: image.mimeType, bytes: image.bytes.slice(0) } }); if (database) await markItemUsed(database, 'images', image); showNotice(`Enviando “${image.name}”...`); }
    catch (error) { showNotice(error instanceof Error ? error.message : 'Falha ao enviar imagem.', true); }
  };

  const sendText = async (text: TextItem): Promise<void> => {
    try { await sendMessage({ type: 'SEND_TEXT', text: { name: text.name, text: text.text } }); if (database) await markItemUsed(database, 'texts', text); showNotice(`Enviando “${text.name}”...`); }
    catch (error) { showNotice(error instanceof Error ? error.message : 'Falha ao enviar texto.', true); }
  };

  const sendDocument = async (document: DocumentItem): Promise<void> => {
    try { await sendMessage({ type: 'SEND_DOCUMENT', document: { name: document.name, fileName: document.fileName, mimeType: document.mimeType, bytes: document.bytes.slice(0) } }); if (database) await markItemUsed(database, 'documents', document); showNotice(`Enviando “${document.name}”...`); }
    catch (error) { showNotice(error instanceof Error ? error.message : 'Falha ao enviar documento.', true); }
  };

  const deleteItem = async (store: 'audios' | 'images' | 'texts' | 'documents' | 'funnels', id: string): Promise<void> => {
    if (!database || !window.confirm('Deseja excluir este item?')) return;
    await removeItem(database, store, id);
    await refreshLibrary(database);
  };

  const renameMedia = async (store: 'audios' | 'images' | 'documents', item: AudioItem | ImageItem | DocumentItem, name: string): Promise<void> => {
    if (!database || !name.trim()) return showNotice('Informe um nome para o item.', true);
    await saveItem(database, store, { ...item, name: name.trim() });
    await refreshLibrary(database);
    showNotice(`${store === 'audios' ? 'Áudio' : store === 'images' ? 'Imagem' : 'Documento'} atualizado(a).`);
  };

  const saveText = async (draft: Pick<TextItem, 'name' | 'text'>, existing?: TextItem): Promise<void> => {
    if (!database || !draft.name.trim() || !draft.text.trim()) return showNotice('Informe o nome e o conteúdo do texto.', true);
    await saveItem(database, 'texts', {
      id: existing?.id || crypto.randomUUID(),
      name: draft.name.trim(),
      text: draft.text.trim(),
      createdAt: existing?.createdAt || Date.now(),
      usageCount: existing?.usageCount,
      lastUsedAt: existing?.lastUsedAt,
    } satisfies TextItem);
    await refreshLibrary(database);
    showNotice(existing ? 'Texto atualizado.' : 'Texto salvo na biblioteca.');
  };

  const addStep = (type: MediaType): void => setSteps((items) => [...items, { type, delaySeconds: 5 }]);
  const updateStep = (index: number, patch: Partial<FunnelStep>): void => setSteps((items) => items.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  const removeStep = (index: number): void => setSteps((items) => items.filter((_, stepIndex) => stepIndex !== index));

  const saveFunnel = async (): Promise<void> => {
    if (!database || !funnelName.trim() || !steps.length) return showNotice('Informe um nome e adicione pelo menos uma etapa.', true);
    if (steps.some((step) => step.type !== 'text' && !step.contentId)) return showNotice('Selecione o conteúdo de cada etapa.', true);
    if (steps.some((step) => step.type === 'text' && !step.text?.trim())) return showNotice('Preencha o texto de cada etapa.', true);
    const existing = editingFunnelId ? funnels.find((funnel) => funnel.id === editingFunnelId) : undefined;
    await saveItem(database, 'funnels', { id: existing?.id || crypto.randomUUID(), name: funnelName.trim(), steps, createdAt: existing?.createdAt || Date.now() } satisfies Funnel);
    setFunnelName('');
    setSteps([]);
    setEditingFunnelId(null);
    await refreshLibrary(database);
    showNotice(existing ? 'Funil atualizado.' : 'Funil salvo.');
  };

  const editFunnel = (funnel: Funnel): void => {
    setEditingFunnelId(funnel.id);
    setFunnelName(funnel.name);
    setSteps(funnel.steps.map((step) => ({ ...step })));
  };

  const cancelFunnelEdit = (): void => {
    setEditingFunnelId(null);
    setFunnelName('');
    setSteps([]);
  };

  const startFunnel = async (funnel: Funnel): Promise<void> => {
    try {
      const plannedSteps = await Promise.all(funnel.steps.map(async (step) => {
        if (step.type === 'text') return { ...step, delayMs: step.delaySeconds * 1000 };
        const media = step.type === 'image'
          ? images.find((image) => image.id === step.contentId)
          : step.type === 'document'
            ? documents.find((document) => document.id === step.contentId)
            : audios.find((audio) => audio.id === step.contentId);
        if (!media) throw new Error('Uma mídia deste funil foi removida.');
        const fileName = step.type === 'document' ? (media as DocumentItem).fileName : undefined;
        return { ...step, delayMs: step.delaySeconds * 1000, name: media.name, bytes: media.bytes.slice(0), ...('mimeType' in media ? { mimeType: media.mimeType } : {}), ...(fileName ? { fileName } : {}) };
      }));
      const jobId = crypto.randomUUID();
      setActiveJobs((jobs) => [...jobs, { id: jobId, funnelName: funnel.name, chatName: currentChat.chatName, step: 0, total: plannedSteps.length, remainingSeconds: 0 }]);
      await sendMessage({ type: 'START_FUNNEL', jobId, steps: plannedSteps });
      if (database) await markItemUsed(database, 'funnels', funnel);
      showNotice(`Funil “${funnel.name}” iniciado.`);
    } catch (error) { showNotice(error instanceof Error ? error.message : 'Não foi possível iniciar o funil.', true); }
  };

  const cancelFunnel = async (jobId: string): Promise<void> => {
    await sendMessage({ type: 'CANCEL_FUNNEL', jobId });
    setActiveJobs((jobs) => jobs.filter((job) => job.id !== jobId));
  };

  const closePanel = layout === 'panel' ? (): void => window.parent.postMessage({ source: 'vozflow-panel', type: 'CLOSE_PANEL' }, '*') : undefined;
  const openDashboard = layout === 'panel' ? async (): Promise<void> => {
    const response = await chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' }) as RuntimeResponse;
    if (!response?.ok) showNotice(response?.error || 'Não foi possível abrir o painel completo.', true);
  } : undefined;

  return <main className={`voz-panel voz-panel--${theme} voz-panel--${layout}`}>
    <PanelHeader layout={layout} theme={theme} onToggleTheme={() => setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark')} onOpenDashboard={openDashboard} onClose={closePanel} />
    <PanelNav activeTab={tab} onChange={setTab} />
    <div className="voz-panel__content">
      <LicenseCard />
      {tab === 'home' && <HomeView audios={audios} funnels={funnels} jobs={activeJobs} sentToday={sentToday} currentChat={currentChat.chatName} onNavigate={setTab} onStart={startFunnel} onCancel={cancelFunnel} />}
      {tab === 'messages' && <MessagesView audios={audios} images={images} texts={texts} documents={documents} audioFile={audioFile} imageFile={imageFile} documentFile={documentFile} audioName={audioName} imageName={imageName} documentName={documentName} isConverting={isConvertingAudio} onAudioFile={handleAudioFile} onImageFile={handleImageFile} onDocumentFile={handleDocumentFile} onAudioName={setAudioName} onImageName={setImageName} onDocumentName={setDocumentName} onSaveAudio={saveAudio} onSaveImage={saveImage} onSaveDocument={saveDocument} onSaveText={saveText} onSendAudio={sendAudio} onSendImage={sendImage} onSendDocument={sendDocument} onSendText={sendText} onRenameMedia={renameMedia} onRemoveAudio={(id) => deleteItem('audios', id)} onRemoveImage={(id) => deleteItem('images', id)} onRemoveDocument={(id) => deleteItem('documents', id)} onRemoveText={(id) => deleteItem('texts', id)} />}
      {tab === 'funnels' && <FunnelsView funnels={funnels} steps={steps} funnelName={funnelName} editingFunnelId={editingFunnelId} audioOptions={audioOptions} imageOptions={imageOptions} documentOptions={documentOptions} onName={setFunnelName} onAddStep={addStep} onUpdateStep={updateStep} onRemoveStep={removeStep} onSave={saveFunnel} onCancelEdit={cancelFunnelEdit} onEdit={editFunnel} onStart={startFunnel} onRemove={(id) => deleteItem('funnels', id)} />}
      {tab === 'schedules' && <SchedulesView audios={audios} images={images} texts={texts} documents={documents} funnels={funnels} activeChat={currentChat} onNotice={showNotice} />}
      {tab === 'automation' && <AutomationView audios={audios} images={images} texts={texts} documents={documents} funnels={funnels} activeChat={currentChat} onNotice={showNotice} />}
      {tab === 'reports' && <ReportsView sentToday={sentToday} audioCount={audios.length} funnelCount={funnels.length} />}
    </div>
    {notice && <div className={`toast ${notice.isError ? 'toast--error' : ''}`} role="status">{notice.message}<button onClick={() => setNotice(null)} aria-label="Fechar aviso"><Icon name="close" /></button></div>}
  </main>;
};

type PanelHeaderProps = { layout: AppLayout; theme: Theme; onToggleTheme: () => void; onOpenDashboard?: () => Promise<void>; onClose?: () => void };
const PanelHeader = ({ layout, theme, onToggleTheme, onOpenDashboard, onClose }: PanelHeaderProps): ReactElement => {
  const isDark = theme === 'dark';
  const themeLabel = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';

  return <header className="panel-header">
    <div className="panel-header__brand"><span className="panel-header__logo"><Icon name="logo" /></span><h1>VozFlow</h1>{layout === 'dashboard' && <span className="panel-header__product">Painel de controle</span>}</div>
    <div className="panel-header__actions">
      {layout === 'panel' && <span className="panel-header__presence"><span className="panel-header__pulse"><i /></span>Online</span>}
      {onOpenDashboard && <button type="button" className="panel-header__dashboard-link" onClick={() => void onOpenDashboard()} aria-label="Abrir painel completo" title="Abrir painel completo"><Icon name="externalLink" /><span>Painel</span></button>}
      <button type="button" className="panel-header__theme-toggle" onClick={onToggleTheme} aria-label={themeLabel} aria-pressed={isDark} title={themeLabel}><Icon name={isDark ? 'sun' : 'moon'} /><span>{isDark ? 'Claro' : 'Escuro'}</span></button>
      {onClose && <button type="button" className="panel-header__close" onClick={onClose} aria-label="Fechar VozFlow"><Icon name="close" /></button>}
    </div>
  </header>;
};

const navigation: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'home', label: 'Início', icon: 'home' },
  { id: 'messages', label: 'Mensagens', icon: 'messages' },
  { id: 'funnels', label: 'Funis', icon: 'funnels' },
  { id: 'schedules', label: 'Agendamentos', icon: 'calendar' },
  { id: 'automation', label: 'Automação', icon: 'bolt' },
  { id: 'reports', label: 'Relatórios', icon: 'reports' },
];

const PanelNav = ({ activeTab, onChange }: { activeTab: Tab; onChange: (tab: Tab) => void }): ReactElement => <nav className="panel-nav" aria-label="Navegação principal">{navigation.map((item) => <button key={item.id} className={`panel-nav__item ${activeTab === item.id ? 'panel-nav__item--active' : ''}`} onClick={() => onChange(item.id)}><Icon name={item.icon} />{item.label}</button>)}</nav>;

type HomeViewProps = { audios: AudioItem[]; funnels: Funnel[]; jobs: ActiveJob[]; sentToday: number; currentChat: string; onNavigate: (tab: Tab) => void; onStart: (funnel: Funnel) => Promise<void>; onCancel: (jobId: string) => Promise<void> };
const HomeView = ({ audios, funnels, jobs, sentToday, currentChat, onNavigate, onStart, onCancel }: HomeViewProps): ReactElement => {
  const [selectedFunnel, setSelectedFunnel] = useState('');
  const selected = funnels.find((funnel) => funnel.id === selectedFunnel);
  return <section className="dashboard">
    <div className="quick-actions"><button onClick={() => onNavigate('messages')}><span className="quick-actions__icon"><Icon name="microphone" /></span><strong>Novo Áudio</strong></button><button onClick={() => onNavigate('funnels')}><span className="quick-actions__icon quick-actions__icon--blue"><Icon name="flow" /></span><strong>Criar Funil</strong></button></div>
    <section className="summary-card"><header><h2>Resumo Hoje</h2><button onClick={() => onNavigate('reports')}>Ver Relatórios</button></header><div className="summary-card__grid"><Stat label="Enviados" value={sentToday} /><Stat label="Áudios" value={audios.length} tone="green" /><Stat label="Conversões" value={funnels.length} tone="blue" /></div></section>
    <QueueCard jobs={jobs} onCancel={onCancel} onViewAll={() => onNavigate('schedules')} />
    <section className="context-card"><Icon name="messages" className="context-card__watermark" /><h2>Ações Rápidas - {currentChat}</h2><p>Inicie um funil com o contato atual.</p><div className="context-card__actions"><select aria-label="Selecionar funil" value={selectedFunnel} onChange={(event) => setSelectedFunnel(event.target.value)}><option value="">Selecionar Funil...</option>{funnels.map((funnel) => <option value={funnel.id} key={funnel.id}>{funnel.name}</option>)}</select><button disabled={!selected} onClick={() => selected && void onStart(selected)}>Iniciar</button></div></section>
  </section>;
};

const Stat = ({ label, value, tone = 'dark' }: { label: string; value: number; tone?: 'dark' | 'green' | 'blue' }): ReactElement => <div className="stat"><span>{label}</span><strong className={`stat__value stat__value--${tone}`}>{value}</strong></div>;

const QueueCard = ({ jobs, onCancel, onViewAll }: { jobs: ActiveJob[]; onCancel: (jobId: string) => Promise<void>; onViewAll: () => void }): ReactElement => <section className="queue-card"><header><h2><Icon name="queue" />Fila de Envio Ativa</h2><span>{jobs.length} Pendentes</span></header><div className="queue-card__list">{jobs.length === 0 ? <p className="empty-state">Nenhum envio em andamento.</p> : jobs.slice(0, 2).map((job, index) => <article className="queue-item" key={job.id}><span className={`queue-item__icon ${index % 2 ? 'queue-item__icon--blue' : ''}`}><Icon name={index % 2 ? 'target' : 'bolt'} /></span><div><h3>{job.funnelName}</h3><p>Próx: etapa {Math.max(1, job.step)} {job.remainingSeconds ? `(em ${job.remainingSeconds}s)` : ''}</p></div><button onClick={() => void onCancel(job.id)} aria-label={`Pausar ${job.funnelName}`}><Icon name="pause" /></button></article>)}</div><button className="queue-card__footer" onClick={onViewAll}>Ver todos agendamentos</button></section>;

type LibraryTab = 'all' | 'audio' | 'image' | 'text' | 'document';
type MessagesViewProps = {
  audios: AudioItem[];
  images: ImageItem[];
  texts: TextItem[];
  documents: DocumentItem[];
  audioFile: File | null;
  imageFile: File | null;
  documentFile: File | null;
  audioName: string;
  imageName: string;
  documentName: string;
  isConverting: boolean;
  onAudioFile: (file?: File) => void;
  onImageFile: (file?: File) => void;
  onDocumentFile: (file?: File) => void;
  onAudioName: (name: string) => void;
  onImageName: (name: string) => void;
  onDocumentName: (name: string) => void;
  onSaveAudio: () => Promise<void>;
  onSaveImage: () => Promise<void>;
  onSaveDocument: () => Promise<void>;
  onSaveText: (draft: Pick<TextItem, 'name' | 'text'>, existing?: TextItem) => Promise<void>;
  onSendAudio: (audio: AudioItem) => Promise<void>;
  onSendImage: (image: ImageItem) => Promise<void>;
  onSendDocument: (document: DocumentItem) => Promise<void>;
  onSendText: (text: TextItem) => Promise<void>;
  onRenameMedia: (store: 'audios' | 'images' | 'documents', item: AudioItem | ImageItem | DocumentItem, name: string) => Promise<void>;
  onRemoveAudio: (id: string) => Promise<void>;
  onRemoveImage: (id: string) => Promise<void>;
  onRemoveDocument: (id: string) => Promise<void>;
  onRemoveText: (id: string) => Promise<void>;
};

const libraryTabs: Array<{ id: LibraryTab; label: string; icon: IconName }> = [
  { id: 'all', label: 'Mensagens', icon: 'messages' },
  { id: 'audio', label: 'Áudios', icon: 'microphone' },
  { id: 'image', label: 'Imagens', icon: 'image' },
  { id: 'text', label: 'Textos', icon: 'text' },
  { id: 'document', label: 'Documentos', icon: 'document' },
];

const MessagesView = (props: MessagesViewProps): ReactElement => {
  const [activeTab, setActiveTab] = useState<LibraryTab>('all');
  return <section className="workspace-view">
    <ViewHeading eyebrow="Biblioteca" title="Mensagens prontas" description="Organize cada formato em sua própria aba e reutilize na conversa aberta." />
    <div className="library-tabs" role="tablist" aria-label="Tipos de mensagem">
      {libraryTabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={activeTab === item.id} className={`library-tabs__item ${activeTab === item.id ? 'library-tabs__item--active' : ''}`} onClick={() => setActiveTab(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}
    </div>
    {activeTab === 'all' && <LibraryOverview audios={props.audios.length} images={props.images.length} texts={props.texts.length} documents={props.documents.length} onOpen={setActiveTab} />}
    {activeTab === 'audio' && <><UploadCard title="Novo áudio" icon="microphone" accept="audio/*" file={props.audioFile} name={props.audioName} isBusy={props.isConverting} onFile={props.onAudioFile} onName={props.onAudioName} onSave={props.onSaveAudio} /><MediaList title="Áudios salvos" items={props.audios} kind="audio" onSend={(item) => props.onSendAudio(item as AudioItem)} onRename={(item, name) => props.onRenameMedia('audios', item, name)} onRemove={props.onRemoveAudio} /></>}
    {activeTab === 'image' && <><UploadCard title="Nova imagem" icon="image" accept="image/jpeg,image/png,image/webp,image/gif" file={props.imageFile} name={props.imageName} onFile={props.onImageFile} onName={props.onImageName} onSave={props.onSaveImage} /><MediaList title="Imagens salvas" items={props.images} kind="image" onSend={(item) => props.onSendImage(item as ImageItem)} onRename={(item, name) => props.onRenameMedia('images', item, name)} onRemove={props.onRemoveImage} /></>}
    {activeTab === 'text' && <><TextComposer onSave={props.onSaveText} /><TextList items={props.texts} onSave={props.onSaveText} onSend={props.onSendText} onRemove={props.onRemoveText} /></>}
    {activeTab === 'document' && <><UploadCard title="Novo documento" icon="document" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,application/pdf" helpText="PDF, Office, texto ou compactado · até 100 MB" file={props.documentFile} name={props.documentName} onFile={props.onDocumentFile} onName={props.onDocumentName} onSave={props.onSaveDocument} /><MediaList title="Documentos salvos" items={props.documents} kind="document" onSend={(item) => props.onSendDocument(item as DocumentItem)} onRename={(item, name) => props.onRenameMedia('documents', item, name)} onRemove={props.onRemoveDocument} /></>}
  </section>;
};

const LibraryOverview = ({ audios, images, texts, documents, onOpen }: { audios: number; images: number; texts: number; documents: number; onOpen: (tab: LibraryTab) => void }): ReactElement => <div className="library-overview">
  <button type="button" onClick={() => onOpen('audio')}><span className="library-overview__icon"><Icon name="microphone" /></span><strong>Áudios</strong><small>{audios} salvos</small><Icon name="chevronRight" className="library-overview__arrow" /></button>
  <button type="button" onClick={() => onOpen('image')}><span className="library-overview__icon library-overview__icon--blue"><Icon name="image" /></span><strong>Imagens</strong><small>{images} salvas</small><Icon name="chevronRight" className="library-overview__arrow" /></button>
  <button type="button" onClick={() => onOpen('text')}><span className="library-overview__icon library-overview__icon--purple"><Icon name="text" /></span><strong>Textos</strong><small>{texts} salvos</small><Icon name="chevronRight" className="library-overview__arrow" /></button>
  <button type="button" onClick={() => onOpen('document')}><span className="library-overview__icon library-overview__icon--document"><Icon name="document" /></span><strong>Documentos</strong><small>{documents} salvos</small><Icon name="chevronRight" className="library-overview__arrow" /></button>
</div>;

type FunnelsViewProps = {
  funnels: Funnel[];
  steps: FunnelStep[];
  funnelName: string;
  editingFunnelId: string | null;
  audioOptions: Option[];
  imageOptions: Option[];
  documentOptions: Option[];
  onName: (name: string) => void;
  onAddStep: (type: MediaType) => void;
  onUpdateStep: (index: number, patch: Partial<FunnelStep>) => void;
  onRemoveStep: (index: number) => void;
  onSave: () => Promise<void>;
  onCancelEdit: () => void;
  onEdit: (funnel: Funnel) => void;
  onStart: (funnel: Funnel) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
};

const FunnelsView = ({ funnels, steps, funnelName, editingFunnelId, audioOptions, imageOptions, documentOptions, onName, onAddStep, onUpdateStep, onRemoveStep, onSave, onCancelEdit, onEdit, onStart, onRemove }: FunnelsViewProps): ReactElement => <section className="workspace-view">
  <ViewHeading eyebrow="Automação" title={editingFunnelId ? 'Editar funil' : 'Crie um funil'} description="Combine mensagens, mídias e pausas em uma sequência natural." />
  <section className={`form-card ${editingFunnelId ? 'form-card--editing' : ''}`}>
    {editingFunnelId && <div className="form-card__editing"><Icon name="edit" /><span>Você está editando um funil salvo.</span></div>}
    <label>Nome do funil<input placeholder="Ex.: Primeiro contato" value={funnelName} onChange={(event) => onName(event.target.value)} /></label>
    {steps.map((step, index) => <FunnelStepEditor key={`${step.type}-${index}`} step={step} audioOptions={audioOptions} imageOptions={imageOptions} documentOptions={documentOptions} onUpdate={(patch) => onUpdateStep(index, patch)} onRemove={() => onRemoveStep(index)} />)}
    <div className="button-row"><button className="button" onClick={() => onAddStep('audio')}><Icon name="microphone" />Áudio</button><button className="button" onClick={() => onAddStep('image')}><Icon name="image" />Imagem</button><button className="button" onClick={() => onAddStep('text')}><Icon name="text" />Texto</button><button className="button" onClick={() => onAddStep('document')}><Icon name="document" />Documento</button><button className="button button--primary" onClick={() => void onSave()}><Icon name="check" />{editingFunnelId ? 'Salvar alterações' : 'Salvar funil'}</button>{editingFunnelId && <button className="button" onClick={onCancelEdit}><Icon name="close" />Cancelar</button>}</div>
  </section>
  <section className="media-list"><header><h2>Funis salvos</h2><span>{funnels.length}</span></header>{funnels.length === 0 ? <p className="empty-state">Nenhum funil criado.</p> : funnels.map((funnel) => <article className={`media-item ${editingFunnelId === funnel.id ? 'media-item--editing' : ''}`} key={funnel.id}><span className="media-item__icon media-item__icon--blue"><Icon name="flow" /></span><div className="media-item__copy"><h3>{funnel.name}</h3><p>{funnel.steps.length} etapa(s)</p></div><div className="media-item__actions"><button className="icon-button" onClick={() => onEdit(funnel)} aria-label={`Editar ${funnel.name}`} title="Editar"><Icon name="edit" /></button><button className="button button--primary" onClick={() => void onStart(funnel)}>Iniciar</button><button className="icon-button icon-button--danger" onClick={() => void onRemove(funnel.id)} aria-label={`Excluir ${funnel.name}`} title="Excluir"><Icon name="trash" /></button></div></article>)}</section>
</section>;

const ReportsView = ({ sentToday, audioCount, funnelCount }: { sentToday: number; audioCount: number; funnelCount: number }): ReactElement => <section className="workspace-view"><ViewHeading eyebrow="Desempenho" title="Relatórios" description="Visualize os principais números da sua operação hoje." /><section className="report-grid"><Stat label="Enviados" value={sentToday} /><Stat label="Áudios" value={audioCount} tone="green" /><Stat label="Funis" value={funnelCount} tone="blue" /></section></section>;

const ViewHeading = ({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }): ReactElement => <header className="view-heading"><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></header>;

type UploadCardProps = { title: string; icon: IconName; accept: string; helpText?: string; file: File | null; name: string; isBusy?: boolean; onFile: (file?: File) => void; onName: (name: string) => void; onSave: () => Promise<void> };
const UploadCard = ({ title, icon, accept, helpText, file, name, isBusy = false, onFile, onName, onSave }: UploadCardProps): ReactElement => <section className="upload-card"><label className="upload-card__picker"><span><Icon name={icon} /></span><strong>{title}</strong><small>{helpText || (accept.includes('audio') ? 'MP3, WAV, M4A, AAC ou OGG · até 32 MB' : 'JPG, PNG, WEBP ou GIF · até 16 MB')}</small><input type="file" accept={accept} onChange={(event) => onFile(event.target.files?.[0])} /></label>{file && <div className="upload-card__fields"><input value={name} aria-label={`Nome de ${title}`} onChange={(event) => onName(event.target.value)} /><button className="button button--primary" disabled={isBusy} onClick={() => void onSave()}>{isBusy ? 'Convertendo...' : 'Salvar'}</button></div>}</section>;

type MediaItem = AudioItem | ImageItem | DocumentItem;
type MediaListProps = { title: string; items: MediaItem[]; kind: 'audio' | 'image' | 'document'; onSend: (item: MediaItem) => Promise<void>; onRename: (item: MediaItem, name: string) => Promise<void>; onRemove: (id: string) => Promise<void> };
const MediaList = ({ title, items, kind, onSend, onRename, onRemove }: MediaListProps): ReactElement => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const beginEdit = (item: MediaItem): void => { setEditingId(item.id); setEditingName(item.name); };
  const cancelEdit = (): void => { setEditingId(null); setEditingName(''); };
  const saveEdit = async (item: MediaItem): Promise<void> => { await onRename(item, editingName); cancelEdit(); };

  const iconName: IconName = kind === 'image' ? 'image' : kind === 'document' ? 'document' : 'microphone';
  const iconModifier = kind === 'image' ? 'media-item__icon--blue' : kind === 'document' ? 'media-item__icon--document' : '';
  const getDescription = (item: MediaItem): string => kind === 'audio' ? 'Áudio OGG/Opus' : kind === 'document' && 'fileName' in item ? item.fileName : 'mimeType' in item ? item.mimeType : '';
  return <section className="media-list"><header><h2>{title}</h2><span>{items.length}</span></header>{items.length === 0 ? <p className="empty-state">Nenhum item salvo.</p> : items.map((item) => <article className="media-item" key={item.id}><span className={`media-item__icon ${iconModifier}`}><Icon name={iconName} /></span>{editingId === item.id ? <div className="media-item__editor"><label htmlFor={`media-name-${item.id}`}>Nome</label><input id={`media-name-${item.id}`} value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus /></div> : <div className="media-item__copy"><h3>{item.name}</h3><p>{getDescription(item)}</p></div>}<div className="media-item__actions">{editingId === item.id ? <><button className="icon-button icon-button--success" onClick={() => void saveEdit(item)} aria-label={`Salvar nome de ${item.name}`} title="Salvar"><Icon name="check" /></button><button className="icon-button" onClick={cancelEdit} aria-label="Cancelar edição" title="Cancelar"><Icon name="close" /></button></> : <><button className="icon-button" onClick={() => beginEdit(item)} aria-label={`Editar nome de ${item.name}`} title="Editar nome"><Icon name="edit" /></button><button className="button button--primary" onClick={() => void onSend(item)}><Icon name="send" />Enviar</button><button className="icon-button icon-button--danger" onClick={() => void onRemove(item.id)} aria-label={`Excluir ${item.name}`} title="Excluir"><Icon name="trash" /></button></>}</div></article>)}</section>;
};

const TextComposer = ({ onSave }: { onSave: (draft: Pick<TextItem, 'name' | 'text'>) => Promise<void> }): ReactElement => {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const handleSave = async (): Promise<void> => {
    if (!name.trim() || !text.trim()) return;
    await onSave({ name, text });
    setName('');
    setText('');
  };
  return <section className="text-composer"><div className="text-composer__heading"><span><Icon name="text" /></span><div><h2>Novo texto</h2><p>Crie uma mensagem pronta para reutilizar.</p></div></div><label>Nome<input value={name} placeholder="Ex.: Boas-vindas" onChange={(event) => setName(event.target.value)} /></label><label>Mensagem<textarea value={text} placeholder="Digite a mensagem..." rows={4} onChange={(event) => setText(event.target.value)} /></label><button className="button button--primary" disabled={!name.trim() || !text.trim()} onClick={() => void handleSave()}><Icon name="check" />Salvar texto</button></section>;
};

type TextListProps = { items: TextItem[]; onSave: (draft: Pick<TextItem, 'name' | 'text'>, existing?: TextItem) => Promise<void>; onSend: (item: TextItem) => Promise<void>; onRemove: (id: string) => Promise<void> };
const TextList = ({ items, onSave, onSend, onRemove }: TextListProps): ReactElement => {
  const [editing, setEditing] = useState<TextItem | null>(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const beginEdit = (item: TextItem): void => { setEditing(item); setName(item.name); setText(item.text); };
  const cancelEdit = (): void => { setEditing(null); setName(''); setText(''); };
  const saveEdit = async (): Promise<void> => { if (!editing) return; await onSave({ name, text }, editing); cancelEdit(); };
  return <section className="media-list"><header><h2>Textos salvos</h2><span>{items.length}</span></header>{items.length === 0 ? <p className="empty-state">Nenhum texto salvo.</p> : items.map((item) => editing?.id === item.id ? <article className="text-item text-item--editing" key={item.id}><label>Nome<input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label><label>Mensagem<textarea value={text} rows={4} onChange={(event) => setText(event.target.value)} /></label><div className="button-row"><button className="button button--primary" onClick={() => void saveEdit()}><Icon name="check" />Salvar alterações</button><button className="button" onClick={cancelEdit}><Icon name="close" />Cancelar</button></div></article> : <article className="text-item" key={item.id}><div className="text-item__heading"><span className="media-item__icon media-item__icon--purple"><Icon name="text" /></span><div><h3>{item.name}</h3><p>{item.text}</p></div></div><div className="text-item__actions"><button className="icon-button" onClick={() => beginEdit(item)} aria-label={`Editar ${item.name}`} title="Editar"><Icon name="edit" /></button><button className="button button--primary" onClick={() => void onSend(item)}><Icon name="send" />Enviar</button><button className="icon-button icon-button--danger" onClick={() => void onRemove(item.id)} aria-label={`Excluir ${item.name}`} title="Excluir"><Icon name="trash" /></button></div></article>)}</section>;
};

type FunnelStepEditorProps = { step: FunnelStep; audioOptions: Option[]; imageOptions: Option[]; documentOptions: Option[]; onUpdate: (patch: Partial<FunnelStep>) => void; onRemove: () => void };
const FunnelStepEditor = ({ step, audioOptions, imageOptions, documentOptions, onUpdate, onRemove }: FunnelStepEditorProps): ReactElement => { const options = step.type === 'image' ? imageOptions : step.type === 'document' ? documentOptions : audioOptions; return <div className="funnel-step"><select value={step.type} aria-label="Tipo da etapa" onChange={(event) => onUpdate({ type: event.target.value as MediaType, contentId: undefined, text: undefined })}><option value="audio">Áudio</option><option value="image">Imagem</option><option value="text">Texto</option><option value="document">Documento</option></select>{step.type === 'text' ? <textarea placeholder="Mensagem" value={step.text || ''} onChange={(event) => onUpdate({ text: event.target.value })} /> : <select value={step.contentId || ''} aria-label="Conteúdo da etapa" onChange={(event) => onUpdate({ contentId: event.target.value })}><option value="">Selecione</option>{options.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>}<input type="number" min="0" max="3600" value={step.delaySeconds} aria-label="Espera em segundos" onChange={(event) => onUpdate({ delaySeconds: Number(event.target.value) || 0 })} /><button className="button button--danger" onClick={onRemove} aria-label="Remover etapa">×</button></div>; };
