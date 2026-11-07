import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { requireEnv } from './http.ts';

// Cliente com a service role: ignora o RLS e só existe dentro das Edge Functions.
export const serviceClient = (): SupabaseClient =>
  createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
