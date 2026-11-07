// Gera o par de chaves Ed25519 do passe de licença.
// A privada vai para os segredos do Supabase (LICENSE_PASS_PRIVATE_KEY) e nunca para o repositório;
// a pública vai para a extensão (VITE_LICENSE_PUBLIC_KEY).
const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
const raw = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');

console.log(`LICENSE_PASS_PRIVATE_KEY=${pkcs8}`);
console.log(`VITE_LICENSE_PUBLIC_KEY=${raw}`);
