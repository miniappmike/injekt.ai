// A stand-in for Supabase, for looking at the signed-in pages on your own machine without the real project.
// It serves one signed-in user, three characters, five recent images and one marketplace persona, all placeholders.
// How to use it: docs/HANDOFF.md, "Looking at signed-in pages locally". Never deploy it; it has no security at all.
// MOCK=new shows a brand-new account, MOCK=done one that has finished every first step.
const http = require('http');
const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'preview@example.com', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const ch = (i, name, sheets = true) => ({ id: `2222222${i}-2222-4222-8222-222222222222`, user_id: user.id, name, profile: { face: 'Oval face, green eyes', hair: 'Long auburn hair', body: 'Athletic' }, profile_photo_path: `u/p${i}.png`, face_sheet_path: sheets ? `u/f${i}.png` : null, body_sheet_path: sheets ? `u/b${i}.png` : null, reference_paths: [`u/r${i}a.png`, `u/r${i}b.png`], sheet_pack: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' });
const MODE = process.env.MOCK || 'mid';
const gen = (i, hours) => ({ id: `3333333${i}-3333-4333-8333-333333333333`, character_id: '22222221-2222-4222-8222-222222222222', kind: 'inject', status: 'complete', model: 'seedream', prompt: 'A photo', error: null, output_path: `u/g${i}.png`, created_at: new Date(Date.now() - i * 3600e3).toISOString(), expires_at: new Date(Date.now() + hours * 3600e3).toISOString(), cost_usd: null, params: {} });
const LID = '44444444-4444-4444-8444-444444444444';
const tables = {
  generations: MODE === 'new' ? [] : [gen(1, 2), gen(2, 9), gen(3, 30), gen(4, 50), gen(5, 70)],
  marketplace_listings: [{ id: LID, name: 'Nova', price_cents: 14900, currency: 'usd', status: 'available', reserved_until: null, published_at: '2026-11-01T00:00:00Z', sold_at: null, public_profile: { tagline: 'Sunset-chasing travel creator with a film camera.', bio: '', tags: [] } }],
  listing_images: [{ id: '55555555-5555-4555-8555-555555555555', listing_id: LID, storage_path: `${LID}/cover.png`, sort_order: 0 }],
  api_ledger: MODE === 'done' ? [{ id: 1 }] : [],
  characters: MODE === 'new' ? [] : [ch(1, 'Ava Monroe'), ch(2, 'Lena'), ch(3, 'Mika Tanaka', false)].map((c, i) => (MODE === 'done' && i === 0 ? { ...c, reference_paths: [...c.reference_paths, 'u/pinned/x/p.png'] } : c)),
  profiles: [{ id: user.id, plan: 'free', is_admin: false, pro_until: null, generation_enabled: true }],
};
const svg = (seed) => { const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7); return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 55% 62%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360} 50% 30%)"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><circle cx="300" cy="300" r="120" fill="rgba(255,255,255,.35)"/><rect x="150" y="450" width="300" height="350" rx="120" fill="rgba(255,255,255,.3)"/></svg>`; };
http.createServer((req, res) => {
  let body = ''; req.on('data', (d) => (body += d)); req.on('end', () => {
    const u = new URL(req.url, 'http://x'); const p = u.pathname;
    const send = (code, obj, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
    if (req.method === 'OPTIONS') return send(200, {});
    if (p.startsWith('/auth/v1/user')) return send(200, user);
    if (p.startsWith('/auth/v1')) return send(200, {});
    if (p.startsWith('/storage/v1/object/sign/')) {
      if (req.method === 'GET') return send(200, svg(p), 'image/svg+xml');
      const rest = p.slice('/storage/v1/object/sign/'.length); const j = body ? JSON.parse(body) : {};
      if (j.paths) return send(200, j.paths.map((x) => ({ path: x, error: null, signedURL: `/object/sign/${rest}/${x}?token=t` })));
      return send(200, { signedURL: `/object/sign/${rest}?token=t` });
    }
    if (p.startsWith('/storage/v1')) return send(200, []);
    if (p.startsWith('/rest/v1/rpc/')) { if (p.includes('marketplace_counts')) return send(200, [{ available: 12, sold: 30 }]); if (p.includes('listing_stats')) return send(200, [{ listing_id: LID, views: 240, likes: 31, rank: 1 }]); return send(200, p.includes('balance') ? 212 : null); }
    if (p.startsWith('/rest/v1/')) {
      const t = p.slice('/rest/v1/'.length); let rows = tables[t] ?? [];
      const id = u.searchParams.get('id'); if (id && id.startsWith('eq.')) rows = rows.filter((r) => r.id === id.slice(3));
      const st = u.searchParams.get('status') || ''; if (t === 'generations' && (st.startsWith('in.') || u.search.includes('output_path=is.null'))) rows = [];
      if (req.method === 'HEAD' || (req.headers.prefer || '').includes('count=exact')) { const n = t === 'generations' ? (rows.length ? (u.search.includes('created_at=gte') ? (u.search.includes('-01T00') ? 48 : 12) : 60) : 0) : rows.length; res.writeHead(200, { 'content-type': 'application/json', 'content-range': `0-0/${n}` }); return res.end(req.method === 'HEAD' ? undefined : '[]'); }
      if ((req.headers.accept || '').includes('vnd.pgrst.object')) return rows[0] ? send(200, rows[0]) : send(406, { code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'none' });
      return send(200, rows);
    }
    send(200, {});
  });
}).listen(54321, '127.0.0.1');
