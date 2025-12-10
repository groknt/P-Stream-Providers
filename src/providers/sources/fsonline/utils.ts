import { FetcherResponse } from '@/fetchers/types';
import { ScrapeContext } from '@/utils/context';

export const ORIGIN_HOST = 'https://www3.fsonline.app';
export const MOVIE_PAGE_URL = 'https://www3.fsonline.app/film/';
export const SHOW_PAGE_URL = 'https://www3.fsonline.app/episoade/{{MOVIE}}-sezonul-{{SEASON}}-episodul-{{EPISODE}}/';
export const EMBED_URL = 'https://www3.fsonline.app/wp-admin/admin-ajax.php';
const TMDB_API_KEY = 'a500049f3e06109fe3e8289b06cf5685';

export function throwOnResponse(response: FetcherResponse) {
  if (response.statusCode >= 400) {
    throw new Error(`Response does not indicate success: ${response.statusCode}`);
  }
}

export function getMoviePageURL(name: string, season?: number, episode?: number): string {
  name = name
    .trim()
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-zA-Z0-9. ]+/g, '')
    .replace('.', ' ')
    .split(' ')
    .join('-');
  if (season && episode) {
    return SHOW_PAGE_URL.replace('{{MOVIE}}', name)
      .replace('{{SEASON}}', `${season}`)
      .replace('{{EPISODE}}', `${episode}`);
  }
  return `${MOVIE_PAGE_URL}${name}/`;
}

export async function fetchENTMDBName(tmdbId: number, mediaType: 'movie' | 'show'): Promise<string> {
  const endpoint =
    mediaType === 'movie'
      ? `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`
      : `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Error fetching TMDB data: ${response.statusText}`);
  }

  const tmdbData = await response.json();
  return mediaType === 'movie' ? tmdbData.title : tmdbData.name;
}

export async function fetchIFrame(ctx: ScrapeContext, url: string): Promise<FetcherResponse | undefined> {
  const response: FetcherResponse = await ctx.proxiedFetcher.full(url, {
    headers: {
      Referer: ORIGIN_HOST,
      Origin: ORIGIN_HOST,
      'sec-fetch-dest': 'iframe',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'cross-site',
    },
  });
  throwOnResponse(response);
  return response;
}
