import { customAlphabet } from 'nanoid';

import { makeEmbed } from '@/providers/base';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 10);

const PASS_MD5_PATTERNS: RegExp[] = [
  /\$\.get\('\/pass_md5[^']*'\)/,
  /\$\.get\("\/pass_md5[^"]*"\)/,
  /\$\.get\s*\('\/pass_md5([^']+)'\)/,
  /\$\.get\s*\("\/pass_md5([^"]+)"\)/,
  /fetch\(\s*["'](\/pass_md5[^"']+)["']\s*\)/,
  /axios\.get\(\s*["'](\/pass_md5[^"']+)["']\s*\)/,
  /open\(\s*["']GET["']\s*,\s*["'](\/pass_md5[^"']+)["']\s*\)/,
  /url\s*:\s*["'](\/pass_md5[^"']+)["']/,
  /location\.href\s*=\s*["'](\/pass_md5[^"']+)["']/,
  /(\/pass_md5\.php[^"']*)/,
  /["'](\/pass_md5\/[^"']+)["']/,
];

const TOKEN_PATTERNS: RegExp[] = [/token["']?\s*[:=]\s*["']([^"']+)["']/, /makePlay\([^)]*token=([^"&']+)/];

function extractFirst(html: string, patterns: RegExp[]): string | null {
  for (const pat of patterns) {
    const m = pat.exec(html);
    if (m) {
      // capture group if available else try to parse from full match
      if (m.length > 1 && m[1]) return m[1];
      const match = m[0];
      const inner = /\/pass_md5[^'"')]+/.exec(match)?.[0] ?? null;
      if (inner) return inner;
    }
  }
  return null;
}

function resolveAbsoluteUrl(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

export const doodScraper = makeEmbed({
  id: 'dood',
  name: 'dood',
  disabled: false,
  rank: 173,
  flags: [],
  async scrape(ctx) {
    // Resolve any interstitial/redirect links (e.g., primewire wrappers)
    let pageUrl = ctx.url;
    if (pageUrl.includes('primewire')) {
      const req = await ctx.proxiedFetcher.full(pageUrl);
      pageUrl = req.finalUrl;
    }

    // Normalize to embed page /e/{id} when a /d/{id} download page is provided
    const initial = new URL(pageUrl);
    const idMatch = initial.pathname.match(/\/(?:d|e)\/([A-Za-z0-9]+)/);
    const origin = (() => {
      try {
        return `${initial.protocol}//${initial.host}`;
      } catch {
        return 'https://d000d.com';
      }
    })();
    const embedUrl = idMatch ? `${origin}/e/${idMatch[1]}` : pageUrl;

    // Fetch the dood embed page (consistent location of scripts)
    const pageResp = await ctx.proxiedFetcher.full<string>(embedUrl);
    const html = pageResp.body;
    const finalPageUrl = pageResp.finalUrl || embedUrl;
    const pageOrigin = (() => {
      try {
        const u = new URL(finalPageUrl);
        return `${u.protocol}//${u.host}`;
      } catch {
        return origin;
      }
    })();

    // Try to read thumbnail track (both quote styles)
    const thumbnailTrack = html.match(/thumbnails:\s*\{\s*vtt:\s*['"]([^'"]+)['"]/);

    // Find pass_md5 path in the main page, or fallback to iframes
    let passPath = extractFirst(html, PASS_MD5_PATTERNS);

    if (!passPath) {
      const iframeSrcs = Array.from(html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi))
        .slice(0, 5)
        .map((m) => m[1]);
      for (const src of iframeSrcs) {
        try {
          const abs = resolveAbsoluteUrl(finalPageUrl, src);
          const sub = await ctx.proxiedFetcher.full<string>(abs, {
            headers: {
              Referer: finalPageUrl,
            },
          });
          passPath = extractFirst(sub.body, PASS_MD5_PATTERNS);
          if (passPath) break;
        } catch {
          // ignore iframe failures
        }
      }
    }

    // Fallback: scan external scripts referenced by the page for pass_md5 usage
    if (!passPath) {
      const scriptSrcs = Array.from(html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi))
        .slice(0, 8)
        .map((m) => m[1]);
      for (const src of scriptSrcs) {
        try {
          const abs = resolveAbsoluteUrl(finalPageUrl, src);
          const sub = await ctx.proxiedFetcher.full<string>(abs, {
            headers: {
              Referer: finalPageUrl,
            },
          });
          passPath = extractFirst(sub.body, PASS_MD5_PATTERNS);
          if (passPath) break;
        } catch {
          // ignore script failures
        }
      }
    }

    // Fallback: if a /d/{id} page exists, try scanning it as some variants only expose pass_md5 there
    if (!passPath && idMatch) {
      try {
        const downloadUrl = `${pageOrigin}/d/${idMatch[1]}`;
        const sub = await ctx.proxiedFetcher.full<string>(downloadUrl, {
          headers: { Referer: finalPageUrl },
        });
        passPath = extractFirst(sub.body, PASS_MD5_PATTERNS);
      } catch {
        // ignore download page failure
      }
    }

    if (!passPath) throw new Error('dood: pass_md5 path not found');

    const passUrl = resolveAbsoluteUrl(pageOrigin, passPath.startsWith('/') ? passPath : `/${passPath}`);
    const doodPage = await ctx.proxiedFetcher<string>(passUrl, {
      headers: {
        Referer: finalPageUrl,
      },
      method: 'GET',
    });

    const token = extractFirst(html, TOKEN_PATTERNS);
    const rawUrl = (doodPage ?? '')
      .toString()
      .trim()
      .replace(/^['"]|['"]$/g, '');
    const normalizedUrl = (() => {
      if (!rawUrl) return '';
      if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
      if (rawUrl.startsWith('/')) return resolveAbsoluteUrl(pageOrigin, rawUrl);
      if (rawUrl.startsWith('http')) return rawUrl;
      return resolveAbsoluteUrl(pageOrigin, rawUrl);
    })();
    const finalDownloadUrl = token ? `${normalizedUrl}${nanoid()}?token=${token}&expiry=${Date.now()}` : normalizedUrl;

    if (!finalDownloadUrl.startsWith('http')) throw new Error('Invalid URL');

    const thumbUrl = (() => {
      if (!thumbnailTrack) return null;
      const t = thumbnailTrack[1];
      if (t.startsWith('//')) return `https:${t}`;
      if (t.startsWith('http')) return t;
      return resolveAbsoluteUrl(origin, t);
    })();

    return {
      stream: [
        {
          id: 'primary',
          type: 'file',
          flags: [], // I dont think it will work without headers
          captions: [],
          qualities: {
            unknown: {
              type: 'mp4',
              url: finalDownloadUrl,
            },
          },
          preferredHeaders: {
            Referer: pageOrigin,
          },
          ...(thumbUrl
            ? {
                thumbnailTrack: {
                  type: 'vtt',
                  url: thumbUrl,
                },
              }
            : {}),
        },
      ],
    };
  },
});
