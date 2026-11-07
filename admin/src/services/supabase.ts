import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(url && anonKey);

// Sem configuração, o cliente aponta para um endereço inválido e a tela de login avisa o motivo.
export const supabase = createClient(url || 'http://localhost', anonKey || 'sem-chave', {
  auth: { persistSession: true, autoRefreshToken: true },
});
