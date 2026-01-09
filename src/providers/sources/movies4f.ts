import { load } from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://movies4f.com';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  // Build search query - try without year first, then with year if no results
  let searchQuery = encodeURIComponent(ctx.media.title);
  let searchUrl = `${baseUrl}/search?q=${searchQuery}`;

  let searchPage = await ctx.proxiedFetcher<string>(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
    },
  });

  // If no results found, try with year
  if (!searchPage.includes('/film/')) {
    searchQuery = encodeURIComponent(`${ctx.media.title} ${ctx.media.releaseYear}`);
    searchUrl = `${baseUrl}/search?q=${searchQuery}`;
    searchPage = await ctx.proxiedFetcher<string>(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
      },
    });
  }

  ctx.progress(40);

  // Parse search results using regex
  const filmCardRegex =
    /<a[^>]*href="([^"]*\/film\/\d+\/[^"]*)"[^>]*class="[^"]*poster[^"]*"[^>]*>[\s\S]*?<img[^>]*alt="([^"]*)"[^>]*>/g;

  let filmMatch;
  let exactMatchUrl: string | null = null;
  let looseMatchUrl: string | null = null;

  const normalizedSearchTitle = ctx.media.title.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (;;) {
    filmMatch = filmCardRegex.exec(searchPage);
    if (filmMatch === null) break;

    let link = filmMatch[1];
    const title = filmMatch[2];
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Check if the current result is valid for our query
    if (normalizedTitle.includes(normalizedSearchTitle)) {
      if (ctx.media.type === 'show') {
        link = link.replace(/\/episode-\d+(\/)?$/, '');
        const seasonRegex = new RegExp(`season\\s*${ctx.media.season.number}\\b`, 'i');

        if (seasonRegex.test(title)) {
          // Exact Match
          exactMatchUrl = `${baseUrl}${link}/episode-${ctx.media.episode.number}`;
          break;
        }

        // Loose Match
        if (!looseMatchUrl && normalizedTitle === normalizedSearchTitle) {
          looseMatchUrl = `${baseUrl}${link}/episode-${ctx.media.episode.number}`;
        }
      } else {
        // Movies
        const candidateUrl = `${baseUrl}${link}`;

        // Exact Match
        if (normalizedTitle === normalizedSearchTitle) {
          exactMatchUrl = candidateUrl;
          break;
        }

        // Loose Match
        if (!looseMatchUrl) {
          looseMatchUrl = candidateUrl;
        }
      }
    }
  }

  const filmUrl = exactMatchUrl || looseMatchUrl;

  if (!filmUrl) {
    throw new NotFoundError('No matching film found in search results');
  }

  ctx.progress(50);

  // Load the film page
  const filmPage = await ctx.proxiedFetcher<string>(filmUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
    },
  });

  ctx.progress(60);

  const $film = load(filmPage);
  const iframeSrc = $film('iframe#iframeStream').attr('src');

  if (!iframeSrc) {
    throw new NotFoundError('No embed iframe found');
  }

  const embedUrl = new URL(iframeSrc);
  const videoId = embedUrl.searchParams.get('id');

  if (!videoId) {
    throw new NotFoundError('No video ID found in embed URL');
  }

  ctx.progress(70);

  const tokenResponse = await ctx.proxiedFetcher<string>('https://moviking.childish2x2.fun/geturl', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=----geckoformboundaryc5f480bcac13a77346dab33881da6bfb',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
      Referer: iframeSrc,
    },
    body: `------geckoformboundaryc5f480bcac13a77346dab33881da6bfb
Content-Disposition: form-data; name="renderer"

ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar
------geckoformboundaryc5f480bcac13a77346dab33881da6bfb
Content-Disposition: form-data; name="id"

6164426f797cf4b2fe93e4b20c0a4338
------geckoformboundaryc5f480bcac13a77346dab33881da6bfb
Content-Disposition: form-data; name="videoId"

${videoId}
------geckoformboundaryc5f480bcac13a77346dab33881da6bfb
Content-Disposition: form-data; name="domain"

${baseUrl}/
------geckoformboundaryc5f480bcac13a77346dab33881da6bfb--`,
  });

  ctx.progress(80);

  const tokenMatch = tokenResponse.match(/token1=(\w+)&token2=(\w+)&token3=(\w+)/);
  if (!tokenMatch) {
    throw new NotFoundError('Failed to extract tokens');
  }

  const [, token1, token2, token3] = tokenMatch || [];

  const streamBaseUrl = 'https://cdn.neuronix.sbs';
  const url = new URL(`${streamBaseUrl}/segment/${videoId}/`);

  if (token1) url.searchParams.append('token1', token1);
  if (token2) url.searchParams.append('token2', token2);
  if (token3) url.searchParams.append('token3', token3);

  const streamUrl = url.toString();

  ctx.progress(95);

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        type: 'hls',
        playlist: streamUrl,
        headers: {
          Referer: 'https://cdn.neuronix.sbs',
          Origin: 'cdn.neuronix.sbs',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
        },
        flags: [flags.CORS_ALLOWED],
        captions: [],
      },
    ],
  };
}

export const movies4fScraper = makeSourcerer({
  id: 'movies4f',
  name: 'M4F',
  rank: 291,
  disabled: false,
  flags: [],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
