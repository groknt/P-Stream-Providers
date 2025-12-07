/* eslint-disable no-console */
import { flags } from '@/entrypoint/utils/targets';
import { NotFoundError } from '@/utils/errors';
import { createM3U8ProxyUrl } from '@/utils/proxy';

import { EmbedOutput, makeEmbed } from '../base';

const baseUrl = 'madplay.site';
const headers = {
  referer: 'https://madplay.site/',
  origin: 'https://madplay.site',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
};

export const madplayBaseEmbed = makeEmbed({
  id: 'madplay-base',
  name: 'Base',
  rank: 134,
  flags: [flags.CORS_ALLOWED],
  async scrape(ctx): Promise<EmbedOutput> {
    const query = JSON.parse(ctx.url);
    const { type, tmdbId, season, episode } = query;

    let url = `https://${baseUrl}/api/playsrc`;

    if (type === 'movie') {
      url += `?id=${tmdbId}`;
    } else if (type === 'show') {
      url += `?id=${tmdbId}&season=${season}&episode=${episode}`;
    }

    const res = await ctx.proxiedFetcher(url, { headers });
    console.log(res);

    if (!Array.isArray(res) || res.length === 0) {
      throw new NotFoundError('No streams found');
    }
    const stream = res[0];

    if (!stream.file) {
      throw new NotFoundError('No file URL found in stream');
    }

    ctx.progress(100);

    return {
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: createM3U8ProxyUrl(stream.file, ctx.features, headers),
          headers,
          flags: [flags.CORS_ALLOWED],
          captions: [],
        },
      ],
    };
  },
});

export const madplayNsapiEmbed = makeEmbed({
  id: 'madplay-nsapi',
  name: 'Northstar',
  rank: 133,
  flags: [flags.CORS_ALLOWED],
  async scrape(ctx): Promise<EmbedOutput> {
    const query = JSON.parse(ctx.url);
    const { type, tmdbId, season, episode } = query;

    let url = `https://${baseUrl}/api/nsapi/vid`;

    if (type === 'movie') {
      url += `?id=${tmdbId}`;
    } else if (type === 'show') {
      url += `?id=${tmdbId}&season=${season}&episode=${episode}`;
    }

    const res = await ctx.proxiedFetcher(url, { headers });
    console.log(res);

    if (!Array.isArray(res) || res.length === 0) {
      throw new NotFoundError('No streams found');
    }
    const stream = res[0];

    if (!stream.url) {
      throw new NotFoundError('No file URL found in stream');
    }

    ctx.progress(100);

    return {
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: createM3U8ProxyUrl(stream.url, ctx.features, stream.headers || headers),
          headers: stream.headers || headers,
          flags: [flags.CORS_ALLOWED],
          captions: [],
        },
      ],
    };
  },
});

export const madplayRoperEmbed = makeEmbed({
  id: 'madplay-roper',
  name: 'Roper',
  rank: 132,
  flags: [flags.CORS_ALLOWED],
  async scrape(ctx): Promise<EmbedOutput> {
    const query = JSON.parse(ctx.url);
    const { type, tmdbId, season, episode } = query;

    let url = `https://${baseUrl}/api/roper/`;

    if (type === 'movie') {
      url += `?id=${tmdbId}&type=movie`;
    } else if (type === 'show') {
      url += `?id=${tmdbId}&season=${season}&episode=${episode}&type=series`;
    }

    const res = await ctx.proxiedFetcher(url, { headers });
    console.log(res);

    if (!Array.isArray(res) || res.length === 0) {
      throw new NotFoundError('No streams found');
    }
    const stream = res[0];

    if (!stream.url) {
      throw new NotFoundError('No file URL found in stream');
    }

    ctx.progress(100);

    return {
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: createM3U8ProxyUrl(stream.url, ctx.features, stream.headers || headers),
          headers: stream.headers || headers,
          flags: [flags.CORS_ALLOWED],
          captions: [],
        },
      ],
    };
  },
});

export const madplayNsapiVidFastEmbed = makeEmbed({
  id: 'madplay-vidfast',
  name: 'Vidfast',
  rank: 131,
  flags: [flags.CORS_ALLOWED],
  async scrape(ctx): Promise<EmbedOutput> {
    const query = JSON.parse(ctx.url);
    const { type, tmdbId, season, episode } = query;

    let url = `https://${baseUrl}/api/nsapi/test?url=https://vidfast.pro/`;

    if (type === 'movie') {
      url += `/movie/${tmdbId}`;
    } else if (type === 'show') {
      url += `/tv/${tmdbId}/${season}/${episode}`;
    }

    const res = await ctx.proxiedFetcher(url, { headers });
    console.log(res);

    if (!Array.isArray(res) || res.length === 0) {
      throw new NotFoundError('No streams found');
    }
    const stream = res[0];

    if (!stream.url) {
      throw new NotFoundError('No file URL found in stream');
    }

    ctx.progress(100);

    return {
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: createM3U8ProxyUrl(stream.url, ctx.features, stream.headers || headers),
          headers: stream.headers || headers,
          flags: [flags.CORS_ALLOWED],
          captions: [],
        },
      ],
    };
  },
});
