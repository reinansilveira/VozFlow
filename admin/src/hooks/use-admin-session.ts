import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

// Etapas do acesso: login, cadastro ou verificação do código do app autenticador, e
// confirmação de que o usuário está na tabela de administradores.

export type AdminSession =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'mfa_enroll' }
  | { status: 'mfa_verify'; factorId: string }
  | { status: 'not_admin'; email: string }
  | { status: 'ready'; email: string };

export const useAdminSession = (): { session: AdminSession; reload: () => Promise<void>; signOut: () => Promise<void> } => {
  const [session, setSession] = useState<AdminSession>({ status: 'loading' });

  const reload = useCallback(async (): Promise<void> => {
    const { data: { session: current } } = await supabase.auth.getSession();
    if (!current) {
      setSession({ status: 'signed_out' });
      return;
    }
    const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp.find((factor) => factor.status === 'verified');
    if (!verified) {
      setSession({ status: 'mfa_enroll' });
      return;
    }
    if (level?.currentLevel !== 'aal2') {
      setSession({ status: 'mfa_verify', factorId: verified.id });
      return;
    }
    const { data: isAdmin } = await supabase.rpc('is_admin');
    const email = current.user.email ?? '';
    setSession(isAdmin === true ? { status: 'ready', email } : { status: 'not_admin', email });
  }, []);

  useEffect(() => {
    void reload();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setSession({ status: 'signed_out' });
      if (event === 'MFA_CHALLENGE_VERIFIED') void reload();
    });
    return () => data.subscription.unsubscribe();
  }, [reload]);

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
    setSession({ status: 'signed_out' });
  }, []);

  return { session, reload, signOut };
};
