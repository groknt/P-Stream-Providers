import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';
import { HlsBasedStream } from '@/providers/streams';
import { NotFoundError } from '@/utils/errors';
import { createM3U8ProxyUrl } from '@/utils/proxy';

export const vidnestHollymoviehdEmbed = makeEmbed({
  id: 'vidnest-hollymoviehd',
  name: 'HollyMovie',
  rank: 104,
  flags: [flags.CORS_ALLOWED],
  disabled: true,
  async scrape(ctx) {
    const serverStreams = await ctx.proxiedFetcher<any>(ctx.url);
    if (!serverStreams.success || !serverStreams.sources) throw new NotFoundError('No streams found');

    const streams: HlsBasedStream[] = [];
    for (const source of serverStreams.sources) {
      if (source.file.includes('pkaystream.cc/pl/')) {
        streams.push({
          id: `hollymoviehd-${source.label}`,
          type: 'hls',
          playlist: createM3U8ProxyUrl(source.file, ctx.features),
          headers: {},
          flags: [flags.CORS_ALLOWED],
          captions: [],
        } as HlsBasedStream);
      }
    }

    return {
      stream: streams,
    };
  },
});

export const vidnestAllmoviesEmbed = makeEmbed({
  id: 'vidnest-allmovies',
  name: 'AllMovies (Hindi)',
  rank: 103,
  flags: [flags.CORS_ALLOWED],
  disabled: true,
  async scrape(ctx) {
    const serverStreams = await ctx.proxiedFetcher<any>(ctx.url);
    if (!serverStreams.streams) throw new NotFoundError('No streams found');

    const streams = [];
    for (const stream of serverStreams.streams) {
      streams.push({
        id: `allmovies-${stream.language}`,
        type: 'hls',
        playlist: stream.url,
        flags: [flags.CORS_ALLOWED],
        captions: [],
        preferredHeaders: stream.headers,
      } as HlsBasedStream);
    }

    return {
      stream: streams,
    };
  },
});

export const vidnestFlixhqEmbed = makeEmbed({
  id: 'vidnest-flixhq',
  name: 'FlixHQ',
  rank: 102,
  disabled: true,
  flags: [flags.CORS_ALLOWED],
  async scrape() {
    throw new Error('Not implemented');
  },
});

export const vidnestOfficialEmbed = makeEmbed({
  id: 'vidnest-official',
  name: 'Official',
  rank: 101,
  disabled: true,
  flags: [flags.CORS_ALLOWED],
  async scrape() {
    throw new Error('Not implemented');
  },
});
