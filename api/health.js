// Minimal health check — Edge Runtime (no Node.js dependency)
export const config = { runtime: 'edge' };

export default function handler(request) {
  return new Response(
    JSON.stringify({ ok: true, message: 'Edge API is working' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
