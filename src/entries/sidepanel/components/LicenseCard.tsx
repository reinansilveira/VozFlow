import { useState, type FormEvent, type ReactElement } from 'react';
import { Icon, type IconName } from '../../../shared/components/Icon';
import { useLicense } from '../../../shared/hooks/use-license';
import { licenseConfig } from '../../../shared/services/license-service';
import { licenseCopy, type LicenseTone } from '../../../shared/utils/license-copy';
import { remainingDays } from '../../../shared/utils/license-state';

const toneIcon: Record<LicenseTone, IconName> = { ok: 'check', warning: 'warning', blocked: 'warning', neutral: 'info' };

const describeValidity = (kind: 'trial' | 'license', until: string | null): string => {
  const days = remainingDays(until, Date.now());
  if (days === null) return kind === 'trial' ? 'Teste grátis' : 'Sem data de vencimento';
  if (days === 0) return kind === 'trial' ? 'Teste termina hoje' : 'Vence hoje';
  const plural = days === 1 ? 'dia' : 'dias';
  return kind === 'trial' ? `Faltam ${days} ${plural} de teste` : `Vence em ${days} ${plural}`;
};

const KeyForm = ({ isBusy, onActivate }: { isBusy: boolean; onActivate: (code: string) => Promise<void> }): ReactElement => {
  const [code, setCode] = useState('');
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (code.trim()) void onActivate(code);
  };
  return <form className="license-card__form" onSubmit={handleSubmit}>
    <label htmlFor="license-code">Chave de licença</label>
    <div className="license-card__field">
      <input id="license-code" value={code} placeholder="VOZ-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} onChange={(event) => setCode(event.target.value.toUpperCase())} />
      <button className="button button--primary" type="submit" disabled={isBusy || !code.trim()}>Ativar</button>
    </div>
  </form>;
};

export const LicenseCard = (): ReactElement => {
  const license = useLicense();
  const [showKeyForm, setShowKeyForm] = useState(false);
  const copy = licenseCopy[license.displayState];
  const actions = new Set(copy.actions);
  const kind = license.displayState === 'teste_ativo' ? 'trial' : 'license';

  if (copy.tone === 'ok') {
    return <section className={`license-card license-card--compact license-card--${kind}`} aria-live="polite">
      <Icon name="check" className="license-card__icon" />
      <p className="license-card__summary"><strong>{copy.title}</strong><span>{describeValidity(kind, license.snapshot?.until ?? null)}</span></p>
      {actions.has('buy') && licenseConfig.checkoutUrl && <a className="license-card__link" href={licenseConfig.checkoutUrl} target="_blank" rel="noreferrer">Assinar</a>}
      {actions.has('activate') && <button type="button" className="license-card__link" onClick={() => setShowKeyForm((value) => !value)} aria-expanded={showKeyForm}>Tenho uma chave</button>}
      {showKeyForm && actions.has('activate') && <KeyForm isBusy={license.isBusy} onActivate={license.activate} />}
      {license.feedback && <p className="license-card__feedback license-card__feedback--error" role="alert">{license.feedback.message}</p>}
    </section>;
  }

  return <section className={`license-card license-card--${copy.tone}`} aria-live="polite">
    <header className="license-card__header">
      <Icon name={toneIcon[copy.tone]} className="license-card__icon" />
      <div>
        <h2>{copy.title}</h2>
        <p>{copy.description}</p>
      </div>
    </header>
    {license.snapshot?.offline && <p className="license-card__note">Sem conexão com o servidor de licenças. Tentaremos de novo automaticamente.</p>}
    {license.feedback && <p className="license-card__feedback license-card__feedback--error" role="alert">{license.feedback.message}</p>}
    {actions.has('trial') && <div className="license-card__trial">
      <button className="button button--primary" type="button" disabled={license.isBusy} onClick={() => void license.startTrial()}>{license.isBusy ? 'Verificando...' : 'Começar teste grátis'}</button>
      <small>Ao continuar, o número do WhatsApp conectado é enviado ao VozFlow apenas para controlar o teste e a licença.{licenseConfig.siteUrl && <> Você aceita os <a href={`${licenseConfig.siteUrl}/termos/`} target="_blank" rel="noreferrer">Termos de Uso</a> e a <a href={`${licenseConfig.siteUrl}/privacidade/`} target="_blank" rel="noreferrer">Política de Privacidade</a>.</>}</small>
    </div>}
    {actions.has('activate') && <KeyForm isBusy={license.isBusy} onActivate={license.activate} />}
    <div className="license-card__actions">
      {actions.has('buy') && licenseConfig.checkoutUrl && <a className="button" href={licenseConfig.checkoutUrl} target="_blank" rel="noreferrer"><Icon name="externalLink" />Assinar</a>}
      {actions.has('support') && licenseConfig.supportUrl && <a className="button" href={licenseConfig.supportUrl} target="_blank" rel="noreferrer"><Icon name="messages" />Suporte</a>}
      {(actions.has('retry') || actions.has('update')) && <button className="button" type="button" disabled={license.isBusy} onClick={() => void license.refresh()}><Icon name="clock" />Verificar de novo</button>}
    </div>
  </section>;
};
