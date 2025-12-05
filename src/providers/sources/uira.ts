import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { createM3U8ProxyUrl } from '@/utils/proxy';
import { getTurnstileToken } from '@/utils/turnstile';

const TURNSTILE_SITEKEY = '0x4AAAAAACCe9bUxQlRKwDT5';
const TOKEN_COOKIE_NAME = 'uiralive-turnstile-token';
const TOKEN_EXPIRY_MINUTES = 9;
const baseUrl = 'https://pasmells.uira.live';

interface UiraScraperConfig {
  id: string;
  name: string;
  rank: number;
  scraperName: string; // e.g., 'watch32', 'spencerdevs', 'vidzee'
}

/**
 * Get stored turnstile token from cookies
 */
const getStoredToken = async (): Promise<string | null> => {
  if (typeof window === 'undefined') return null;

  const cookies = document.cookie.split(';');
  const tokenCookie = cookies.find((cookie) => cookie.trim().startsWith(`${TOKEN_COOKIE_NAME}=`));

  if (!tokenCookie) return null;

  const cookieValue = tokenCookie.split('=')[1];
  if (!cookieValue) return null;

  // Parse the cookie value which contains both token and creation time
  const cookieData = JSON.parse(decodeURIComponent(cookieValue));
  const { token, createdAt } = cookieData;

  if (!token || !createdAt) return null;

  return token;
};

/**
 * Store turnstile token in cookies with expiration
 */
const storeToken = (token: string): void => {
  try {
    if (typeof window === 'undefined') return;

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + TOKEN_EXPIRY_MINUTES);

    // Store token with creation timestamp
    const cookieData = {
      token,
      createdAt: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
    };

    const cookieValue = encodeURIComponent(JSON.stringify(cookieData));
    document.cookie = `${TOKEN_COOKIE_NAME}=${cookieValue}; expires=${expiresAt.toUTCString()}; path=/`;
  } catch (e) {
    console.warn('Failed to store turnstile token:', e);
  }
};

/**
 * Clear the turnstile token cookie when verification fails
 */
const clearTurnstileToken = (): void => {
  try {
    if (typeof window === 'undefined') return;
    document.cookie = `${TOKEN_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
    console.warn('Turnstile token cleared due to verification failure');
  } catch (e) {
    console.warn('Failed to clear turnstile token:', e);
  }
};

/**
 * Get turnstile token - either from cache or fetch new one
 */
const getTurnstileTokenWithCache = async (): Promise<string> => {
  // 1. Check if token exists in cache and validate against server uptime
  const cachedToken = await getStoredToken();
  if (cachedToken) {
    return cachedToken;
  }

  // 2. Fetch new turnstile token
  try {
    const token = await getTurnstileToken(TURNSTILE_SITEKEY);

    // 3. Store token
    storeToken(token);

    return token;
  } catch (error) {
    // 4. If it fails, show error
    throw new Error(`Turnstile verification failed: ${error}`);
  }
};

/**
 * Create a unified scraper function for Uira providers
 */
function createUiraScraper(config: UiraScraperConfig) {
  async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
    const turnstileToken = await getTurnstileTokenWithCache();

    ctx.progress(20);

    const fetchUrl =
      ctx.media.type === 'movie'
        ? `/api/scrapers/${config.scraperName}/stream/${ctx.media.tmdbId}`
        : `/api/scrapers/${config.scraperName}/stream/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;

    const hasExtension = ctx.features && !ctx.features.requires.includes(flags.CORS_ALLOWED);

    let result;
    try {
      result = await ctx.fetcher(`${baseUrl}${fetchUrl}${hasExtension ? '' : '?proxy=true'}`, {
        headers: { 'X-Turnstile-Token': turnstileToken },
      });
    } catch (e: any) {
      if (e instanceof NotFoundError) throw new NotFoundError(`${e.message}`);
      throw e;
    }

    // Try again cause uira is smelly
    if (!result) {
      try {
        result = await ctx.fetcher(`${baseUrl}${fetchUrl}${hasExtension ? '' : '?proxy=true'}`, {
          headers: { 'X-Turnstile-Token': turnstileToken },
        });
      } catch (e: any) {
        if (e instanceof NotFoundError) throw new NotFoundError(`${e.message}`);
        throw e;
      }
    }

    // If the turnstile token is invalid, clear it and throw an error
    if (result.error === 'Invalid turnstile token') {
      clearTurnstileToken();
      // eslint-disable-next-line no-alert
      alert('Uira.live Turnstile verification failed. Please refresh the page and try again.');
      throw new NotFoundError('Turnstile verification failed. Token has been cleared.');
    }

    if (!result || !result.sources || result.sources.length === 0) {
      throw new NotFoundError('No sources found');
    }

    ctx.progress(90);

    const embeds = result.sources.map((source: any) => ({
      embedId: 'mirror',
      url: JSON.stringify({
        type: source.type === 'hls' ? 'hls' : 'file',
        stream:
          source.type === 'hls' &&
          (hasExtension ? source.file : createM3U8ProxyUrl(source.file, ctx.features, source.headers)),
        headers: source.headers,
        flags: [flags.CORS_ALLOWED],
        captions: result.subtitles || [],
        skipvalid: source.type !== 'hls',
        qualities:
          source.type !== 'hls'
            ? {
                [source.quality]: {
                  type: 'mp4',
                  url: source.file,
                },
              }
            : undefined,
      }),
    }));

    return {
      embeds,
    };
  }

  return makeSourcerer({
    id: config.id,
    name: config.name,
    rank: config.rank,
    disabled: false,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper,
    scrapeShow: comboScraper,
  });
}

// Export three individual scraper instances
export const uira32Scraper = createUiraScraper({
  id: 'uira32',
  name: 'Uira 32 🤝',
  rank: 245,
  scraperName: 'watch32',
});

export const uiraspencerScraper = createUiraScraper({
  id: 'uiraspencer',
  name: 'Uira Spencer 🤝',
  rank: 243,
  scraperName: 'spencerdevs',
});

export const uiravidzeeScraper = createUiraScraper({
  id: 'uiravidzee',
  name: 'Uira Vidzee 🤝',
  rank: 244,
  scraperName: 'vidzee',
});
