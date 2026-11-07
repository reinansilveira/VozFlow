import { serviceClient } from '../_shared/db.ts';
import { corsHeaders } from '../_shared/http.ts';
import { regionFromDdd } from '../_shared/region.ts';

// Atividade recente e anônima para os avisos do site. Resposta pública, em cache por 1 minuto.
type Row = { kind: string; plan: string; ddd: string | null; happened_at: string };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: corsHeaders });

  const { data, error } = await serviceClient().rpc('vf_recent_activity');
  if (error) {
    console.error('atividade recente', error.message);
    return new Response(JSON.stringify({ events: [] }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const events = ((data ?? []) as Row[]).map((row) => ({
    kind: row.kind,
    plan: row.plan,
    region: regionFromDdd(row.ddd),
    at: row.happened_at,
  }));

  return new Response(JSON.stringify({ events }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
  });
});
