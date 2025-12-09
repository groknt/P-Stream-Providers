import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import { FetcherResponse } from '@/fetchers/types';
import { EmbedScrapeContext, ScrapeContext } from '@/utils/context';

import { ORIGIN_HOST, fetchIFrame, throwOnResponse } from './utils';
import { EmbedOutput } from '../../base';

const LOG_PREFIX = `[Filemoon]`;
const UNPACK_PARAMS_PATERN = /eval\(.+?}\(('.+'),(\d+),(\d+),('.+')\.split\('(.)'\).+/;

function unpack(payload: string, radix: number, id: number, map: string[]) {
  while (id--) {
    if (map[id]) {
      payload = payload.replace(new RegExp(`\\b${id.toString(radix)}\\b`, 'g'), map[id]);
    }
  }
  return payload;
}

function deobfuscatePlayerCfg(data: string): string | undefined {
  const match = data.match(UNPACK_PARAMS_PATERN);
  if (!match) {
    return undefined;
  }
  const obfPayload: string = match[1];
  const radix: number = Number.parseInt(match[2]);
  const id: number = Number.parseInt(match[3]);
  const obfMap: string = match[4];
  const mapChar: string = match[5];
  return unpack(obfPayload, radix, id, obfMap.split(mapChar));
}

async function getStream(ctx: ScrapeContext, url: string): Promise<string | undefined> {
  console.log(LOG_PREFIX, 'Fetching iframe');

  let $: CheerioAPI;
  let vpReferer: string;
  try {
    const response: FetcherResponse | undefined = await fetchIFrame(ctx, url);
    if (!response) {
      return undefined;
    }
    $ = cheerio.load(await response.body);
    vpReferer = response.finalUrl;
  } catch (error) {
    console.error(LOG_PREFIX, 'Failed to fetch iframe', error);
    return undefined;
  }

  const videoPlayerURL: string | undefined = $('#iframe-holder').find('iframe').first().attr('src');
  if (!videoPlayerURL) {
    console.error(LOG_PREFIX, 'Could not find video player URL');
    return undefined;
  }
  console.log(LOG_PREFIX, 'Video player URL', videoPlayerURL);

  try {
    const response: FetcherResponse = await ctx.proxiedFetcher.full(videoPlayerURL, {
      headers: {
        Referer: vpReferer,
        Origin: ORIGIN_HOST,
      },
    });
    throwOnResponse(response);
    $ = cheerio.load(await response.body);
  } catch (error) {
    console.error(LOG_PREFIX, 'Failed to fetch video player', error);
    return undefined;
  }

  let streamURL: string | undefined;
  $('script').each((_, script) => {
    if (streamURL) {
      return;
    }
    const cfgScript = deobfuscatePlayerCfg($(script).text());
    if (!cfgScript) {
      return undefined;
    }
    const url = cfgScript.match('file:"(https?://.+?)"')?.[1];
    if (!url) {
      return;
    }
    streamURL = url;
  });
  console.log(LOG_PREFIX, 'Stream URL', streamURL);

  return streamURL;
}

export async function scrapeFilemoonEmbed(ctx: EmbedScrapeContext): Promise<EmbedOutput> {
  console.log(LOG_PREFIX, 'Scraping stream URL', ctx.url);
  let streamURL: string | undefined;
  try {
    streamURL = await getStream(ctx, ctx.url);
  } catch (error) {
    console.warn(LOG_PREFIX, 'Failed to get stream', error);
    throw error;
  }
  if (!streamURL) {
    return {
      stream: [],
    };
  }
  return {
    stream: [
      {
        type: 'hls',
        id: 'primary',
        flags: ['cors-allowed'],
        captions: [],
        playlist: streamURL,
        headers: {
          Referer: ORIGIN_HOST,
          Origin: ORIGIN_HOST,
        },
      },
    ],
  };
}
