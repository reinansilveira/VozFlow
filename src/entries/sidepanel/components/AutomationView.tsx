import { useState, type ReactElement } from 'react';
import { Icon } from '../../../shared/components/Icon';
import { Switch } from '../../../shared/components/Switch';
import { useAutomation } from '../../../shared/hooks/use-automation';
import { useLicense } from '../../../shared/hooks/use-license';
import { licenseConfig } from '../../../shared/services/license-service';
import type { ScheduleLibrary } from '../../../shared/services/schedule-builder';
import type { ActiveChatContext } from '../../../shared/types';
import { hasAutomationPlan } from '../../../shared/utils/automation-rules';
import { RemarketingPanel } from './RemarketingPanel';
import { TriggersPanel } from './TriggersPanel';

type AutomationTab = 'triggers' | 'remarketing';

type AutomationViewProps = ScheduleLibrary & {
  activeChat: ActiveChatContext;
  onNotice: (message: string, isError?: boolean) => void;
};

export const AutomationView = ({ activeChat, onNotice, ...library }: AutomationViewProps): ReactElement => {
  const [tab, setTab] = useState<AutomationTab>('triggers');
  const automation = useAutomation();
  const license = useLicense();
  const isPro = license.hasAccess && hasAutomationPlan(license.snapshot);
  const { settings, runCommand } = automation;

  const togglePause = async (paused: boolean): Promise<void> => {
    try {
      await runCommand({ type: 'AUTOMATION_SAVE_SETTINGS', settings: { ...settings, paused } });
      onNotice(paused ? 'Automação pausada. Nada será enviado automaticamente.' : 'Automação retomada.');
    } catch (pauseError) {
      onNotice(pauseError instanceof Error ? pauseError.message : 'Não foi possível alterar a automação.', true);
    }
  };

  return <section className="workspace-view schedule-workspace automation">
    <header className="schedule-workspace__heading">
      <div><span>Automação · Pro</span><h2>Gatilhos e remarketing</h2><p>Responda por palavra-chave e acompanhe quem parou de responder.</p></div>
      <div className="automation__pause">
        <Switch checked={!settings.paused} label={settings.paused ? 'Retomar toda a automação' : 'Pausar toda a automação'} onChange={(enabled) => void togglePause(!enabled)} />
        <span>{settings.paused ? 'Tudo pausado' : 'Automação ligada'}</span>
      </div>
    </header>

    {!license.snapshot || isPro ? null : <div className="schedule-state automation__locked" role="note"><Icon name="warning" /><div><strong>Disponível no plano Pro</strong><p>Você pode montar gatilhos e fluxos, mas nada é enviado automaticamente sem o plano Pro ativo (ou o teste grátis).</p>{licenseConfig.checkoutUrl && <a className="button button--primary" href={licenseConfig.checkoutUrl} target="_blank" rel="noreferrer">Assinar o Pro</a>}</div></div>}
    {settings.paused && <div className="schedule-state automation__paused" role="status"><Icon name="pause" /><div><strong>Automação pausada</strong><p>Gatilhos não disparam e fluxos não enviam até você retomar. As inscrições continuam salvas.</p></div></div>}
    <div className="schedule-notice" role="note"><Icon name="info" /><div><strong>Use com moderação</strong><p>Envios automáticos só acontecem com o computador ligado, o Chrome aberto e o WhatsApp conectado. Limites e intervalos protegem seu número contra bloqueios.</p></div></div>

    <div className="automation__tabs" role="tablist" aria-label="Tipo de automação">
      <button type="button" role="tab" id="automation-tab-triggers" aria-controls="automation-panel" aria-selected={tab === 'triggers'} className={`automation__tab ${tab === 'triggers' ? 'automation__tab--active' : ''}`} onClick={() => setTab('triggers')}><Icon name="bolt" />Gatilhos <small>{automation.triggers.length}</small></button>
      <button type="button" role="tab" id="automation-tab-remarketing" aria-controls="automation-panel" aria-selected={tab === 'remarketing'} className={`automation__tab ${tab === 'remarketing' ? 'automation__tab--active' : ''}`} onClick={() => setTab('remarketing')}><Icon name="target" />Remarketing <small>{automation.flows.length}</small></button>
    </div>

    {automation.error && <div className="schedule-state schedule-state--error" role="alert"><Icon name="warning" /><div><strong>Não foi possível carregar a automação</strong><p>{automation.error}</p></div></div>}
    {automation.isLoading && <div className="schedule-state" role="status"><Icon name="clock" /><div><strong>Carregando automação...</strong><p>Buscando gatilhos, fluxos e contatos.</p></div></div>}
    {!automation.isLoading && <div id="automation-panel" role="tabpanel" aria-labelledby={`automation-tab-${tab}`} className="automation__panel">
      {tab === 'triggers'
        ? <TriggersPanel automation={automation} library={library} onNotice={onNotice} />
        : <RemarketingPanel automation={automation} library={library} activeChat={activeChat} onNotice={onNotice} />}
    </div>}
  </section>;
};
