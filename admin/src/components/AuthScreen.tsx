import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import type { AdminSession } from '../hooks/use-admin-session';
import { isSupabaseConfigured, supabase } from '../services/supabase';

type AuthScreenProps = { session: AdminSession; onChange: () => Promise<void>; onSignOut: () => Promise<void> };

const LoginForm = ({ onChange }: { onChange: () => Promise<void> }): ReactElement => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setIsBusy(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setIsBusy(false);
    if (signInError) {
      setError('E-mail ou senha incorretos.');
      return;
    }
    await onChange();
  };

  return <form className="auth-card__form" onSubmit={(event) => void handleSubmit(event)}>
    <label className="field">E-mail<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label className="field">Senha<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {error && <p className="feedback feedback--error" role="alert">{error}</p>}
    <button className="button button--primary" type="submit" disabled={isBusy}>{isBusy ? 'Entrando...' : 'Entrar'}</button>
  </form>;
};

const CodeForm = ({ label, isBusy, error, onSubmit }: { label: string; isBusy: boolean; error: string; onSubmit: (code: string) => Promise<void> }): ReactElement => {
  const [code, setCode] = useState('');
  return <form className="auth-card__form" onSubmit={(event) => { event.preventDefault(); void onSubmit(code); }}>
    <label className="field">{label}<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /></label>
    {error && <p className="feedback feedback--error" role="alert">{error}</p>}
    <button className="button button--primary" type="submit" disabled={isBusy || code.length !== 6}>{isBusy ? 'Verificando...' : 'Confirmar'}</button>
  </form>;
};

const MfaVerify = ({ factorId, onChange }: { factorId: string; onChange: () => Promise<void> }): ReactElement => {
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const verify = async (code: string): Promise<void> => {
    setIsBusy(true);
    setError('');
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setIsBusy(false);
    if (verifyError) setError('Código inválido ou vencido. Use o código atual do app.');
    else await onChange();
  };
  return <>
    <p className="auth-card__text">Digite o código de 6 dígitos do seu app autenticador.</p>
    <CodeForm label="Código" isBusy={isBusy} error={error} onSubmit={verify} />
  </>;
};

type Enrollment = { factorId: string; qrCode: string; secret: string };

const MfaEnroll = ({ onChange }: { onChange: () => Promise<void> }): ReactElement => {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // O cadastro do fator só pode começar uma vez, mesmo com o efeito executado em dobro.
    if (started.current) return;
    started.current = true;
    const start = async (): Promise<void> => {
      // Remove tentativas anteriores não confirmadas antes de gerar um novo QR code.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const factor of factors?.all ?? []) {
        if (factor.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `VozFlow Admin ${new Date().toISOString()}` });
      if (enrollError || !data) setError('Não foi possível iniciar a verificação em duas etapas.');
      else setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    };
    void start();
  }, []);

  const verify = async (code: string): Promise<void> => {
    if (!enrollment) return;
    setIsBusy(true);
    setError('');
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code });
    setIsBusy(false);
    if (verifyError) setError('Código inválido. Confira o horário do celular e tente de novo.');
    else await onChange();
  };

  return <>
    <p className="auth-card__text">Proteja o painel: leia o QR code com um app autenticador (Google Authenticator, Authy ou similar) e digite o código gerado.</p>
    {enrollment && <img className="auth-card__qr" src={enrollment.qrCode} alt="QR code para o app autenticador" width={180} height={180} />}
    {enrollment && <p className="auth-card__secret">Ou digite a chave: <code>{enrollment.secret}</code></p>}
    {!enrollment && !error && <p className="state-message" role="status">Gerando QR code...</p>}
    <CodeForm label="Código do app" isBusy={isBusy} error={error} onSubmit={verify} />
  </>;
};

const titles: Record<AdminSession['status'], string> = {
  loading: 'Carregando',
  signed_out: 'Entrar no painel',
  mfa_enroll: 'Ative a verificação em duas etapas',
  mfa_verify: 'Verificação em duas etapas',
  not_admin: 'Acesso negado',
  ready: 'Painel',
};

export const AuthScreen = ({ session, onChange, onSignOut }: AuthScreenProps): ReactElement => <main className="auth">
  <section className="auth-card" aria-labelledby="auth-title">
    <img className="auth-card__logo" src="/favicon.svg" alt="" width={40} height={40} />
    <h1 id="auth-title">{titles[session.status]}</h1>
    {!isSupabaseConfigured && <p className="feedback feedback--error" role="alert">Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em admin/.env.</p>}
    {session.status === 'loading' && <p className="state-message" role="status">Verificando sessão...</p>}
    {session.status === 'signed_out' && <LoginForm onChange={onChange} />}
    {session.status === 'mfa_enroll' && <MfaEnroll onChange={onChange} />}
    {session.status === 'mfa_verify' && <MfaVerify factorId={session.factorId} onChange={onChange} />}
    {session.status === 'not_admin' && <p className="auth-card__text">A conta {session.email} não tem permissão de administrador.</p>}
    {session.status !== 'signed_out' && session.status !== 'loading' && <button type="button" className="link-button" onClick={() => void onSignOut()}>Sair</button>}
  </section>
</main>;
