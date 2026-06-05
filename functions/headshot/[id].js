// Cloudflare Pages Function — proxies NBA CDN headshots with aggressive caching.
// Route: /headshot/:id  → https://cdn.nba.com/headshots/nba/latest/1040x760/:id.png
// The proxy adds a Referer header so the NBA CDN doesn't block the request,
// and sets Cache-Control so Cloudflare edge nodes cache the image for 7 days.

export async function onRequest({ params }) {
  const id = params.id.replace(/[^0-9]/g, ''); // allow digits only — safety guard
  if (!id) return new Response('Bad request', { status: 400 });

  const upstream = `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`;

  let res;
  try {
    res = await fetch(upstream, {
      headers: {
        Referer:    'https://www.nba.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/124.0.0.0 Safari/537.36',
      },
      cf: { cacheTtl: 604800, cacheEverything: true }, // 7-day Cloudflare edge cache
    });
  } catch {
    return new Response('Upstream error', { status: 502 });
  }

  if (!res.ok) {
    // Return a transparent 1×1 PNG so the <img> doesn't show a broken icon
    const blank = new Uint8Array([
      137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,
      0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,0,
      2,0,1,232,33,188,51,0,0,0,0,73,69,78,68,174,66,96,130,
    ]);
    return new Response(blank, {
      status: 200,
      headers: {
        'Content-Type':  'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const headers = new Headers({
    'Content-Type':  res.headers.get('Content-Type') || 'image/png',
    'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
    'X-Proxied-By':  'cf-pages-fn',
  });

  return new Response(res.body, { status: 200, headers });
}
