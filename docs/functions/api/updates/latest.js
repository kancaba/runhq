const UPSTREAM_LATEST_JSON =
  'https://github.com/erdembas/runhq/releases/latest/download/latest.json';

const EDGE_TTL_SECONDS = 300;
const BROWSER_TTL_SECONDS = 60;

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'method_not_allowed' }, 405, {
      Allow: 'GET, HEAD',
    });
  }

  try {
    const upstream = await fetch(UPSTREAM_LATEST_JSON, {
      cf: {
        cacheTtl: EDGE_TTL_SECONDS,
        cacheEverything: true,
      },
      headers: {
        accept: 'application/json',
        'user-agent': 'runhq-updater-proxy (+https://runhq.dev)',
      },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return json(
        {
          error: 'upstream_unavailable',
          upstream_status: upstream.status,
        },
        502,
      );
    }

    const body = await upstream.text();

    try {
      JSON.parse(body);
    } catch {
      return json({ error: 'upstream_invalid_json' }, 502);
    }

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `public, max-age=${BROWSER_TTL_SECONDS}, s-maxage=${EDGE_TTL_SECONDS}, stale-while-revalidate=86400`,
        'access-control-allow-origin': '*',
        'x-runhq-proxy': 'cf-pages',
      },
    });
  } catch (err) {
    return json({ error: 'proxy_fetch_failed' }, 502);
  }
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}
