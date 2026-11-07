// Cria (ou promove) o usuário administrador do painel de licenças.
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/criar-admin.mjs admin@exemplo.com
// A senha vem de ADMIN_PASSWORD; sem ela, uma senha forte é gerada e exibida uma única vez.
// No primeiro login, o painel pede a configuração do app autenticador (verificação em duas etapas).
import { randomBytes } from 'node:crypto';

const [email] = process.argv.slice(2);
const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !serviceKey) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/criar-admin.mjs <email>');
  process.exit(1);
}

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
const request = async (path, init = {}) => {
  const response = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} em ${path}: ${body}`);
  return body ? JSON.parse(body) : null;
};

const findUser = async () => {
  for (let page = 1; ; page++) {
    const { users } = await request(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const user = users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user || users.length < 200) return user;
  }
};

const generated = !process.env.ADMIN_PASSWORD;
const password = process.env.ADMIN_PASSWORD || randomBytes(18).toString('base64url');

let user = await findUser();
if (user) {
  console.log('Usuário já existe; a senha não foi alterada.');
} else {
  user = await request('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) });
  console.log(generated ? `Usuário criado. Senha gerada (guarde agora): ${password}` : 'Usuário criado com a senha informada.');
}

await request('/rest/v1/admins?on_conflict=user_id', {
  method: 'POST',
  headers: { Prefer: 'resolution=ignore-duplicates' },
  body: JSON.stringify({ user_id: user.id }),
});
console.log(`${email} agora é administrador.`);
