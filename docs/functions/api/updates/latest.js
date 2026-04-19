/**
 * RunHQ auto-updater manifest proxy.
 *
 * Why not point the Tauri updater directly at GitHub?
 *
 * GitHub's `/releases/latest/download/<asset>` URL has an undocumented
 * quirk: it resolves to DRAFT releases too, not just published ones.
 * That means a half-baked draft release (created by CI before we have
 * verified the binaries) would be served to installed clients as "the
 * latest version", triggering an unwanted auto-update.
 *
 * The REST API endpoint `/repos/{owner}/{repo}/releases/latest` only
 * considers **published, non-prerelease** releases. We use that to
 * resolve the real latest tag, then fetch the signed `latest.json`
 * asset from that specific tag. If there is no published release yet
 * (or during a draft-only window), we return 204 No Content so the
 * Tauri updater treats it as "no update available" instead of failing.
 *
 * We also cache successful responses at Cloudflare's edge for 5 min
 * to avoid hitting the GitHub REST API rate limit (60 req/h for
 * unauthenticated clients).
 */

const OWNER = 'erdembas';
const REPO = 'runhq';

const API_LATEST = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

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
    const apiRes = await fetch(API_LATEST, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'runhq-updater-proxy (+https://runhq.dev)',
        'x-github-api-version': '2022-11-28',
      },
    });

    // 404 means there is no published release yet.
    // Return 204 so the Tauri updater cleanly reports "no update".
    if (apiRes.status === 404) {
      return noUpdate('no_published_release');
    }

    if (!apiRes.ok) {
      return json(
        {
          error: 'github_api_unavailable',
          upstream_status: apiRes.status,
        },
        502,
      );
    }

    const release = await apiRes.json();

    // Defensive: draft/prerelease should never come back from /latest,
    // but double-check just in case GitHub changes behaviour.
    if (release.draft === true || release.prerelease === true) {
      return noUpdate('latest_is_not_stable');
    }

    const manifestAsset = (release.assets || []).find((a) => a.name === 'latest.json');

    if (!manifestAsset) {
      return json(
        {
          error: 'manifest_asset_missing',
          tag: release.tag_name,
        },
        502,
      );
    }

    // Fetch the signed manifest from the public asset download URL.
    // This is safe now because we already confirmed the release is
    // published (not a draft).
    const manifestRes = await fetch(manifestAsset.browser_download_url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'runhq-updater-proxy (+https://runhq.dev)',
      },
      redirect: 'follow',
    });

    if (!manifestRes.ok) {
      return json(
        {
          error: 'manifest_unavailable',
          upstream_status: manifestRes.status,
        },
        502,
      );
    }

    const body = await manifestRes.text();

    try {
      JSON.parse(body);
    } catch {
      return json({ error: 'manifest_invalid_json' }, 502);
    }

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `public, max-age=${BROWSER_TTL_SECONDS}, s-maxage=${EDGE_TTL_SECONDS}, stale-while-revalidate=86400`,
        'access-control-allow-origin': '*',
        'x-runhq-proxy': 'cf-pages',
        'x-runhq-release-tag': release.tag_name,
      },
    });
  } catch (err) {
    return json(
      {
        error: 'proxy_fetch_failed',
        message: String(err && err.message ? err.message : err),
      },
      502,
    );
  }
}

function noUpdate(reason) {
  return new Response(null, {
    status: 204,
    headers: {
      'cache-control': `public, max-age=${BROWSER_TTL_SECONDS}, s-maxage=${EDGE_TTL_SECONDS}`,
      'access-control-allow-origin': '*',
      'x-runhq-proxy': 'cf-pages',
      'x-runhq-reason': reason,
    },
  });
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-runhq-proxy': 'cf-pages',
      ...extraHeaders,
    },
  });
}
