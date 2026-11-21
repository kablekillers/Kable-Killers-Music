import axios from "axios";

const YT_API = "https://www.googleapis.com/youtube/v3/search";
const yt = axios.create({ timeout: 12000 });
// Google search.list consumes 100 quota units per request, so reuse searches.
// This cache is process-local and safe to lose on a Render restart.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 150;
const searchCache = new Map<string, { until: number; results: YouTubeMusicResult[] }>();

export type YouTubeMusicResult = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
};

/**
 * Official search only. Playback must use the unmodified YouTube iframe
 * with video visible; no audio URL extraction or media proxying.
 */
export async function searchYouTubeMusic(query: string): Promise<YouTubeMusicResult[]> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new Error("YouTube search is not configured");
  const q = query.trim().slice(0, 160);
  if (!q) return [];
  const cacheKey = q.toLocaleLowerCase("en");
  const cached = searchCache.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.results;
  if (cached) searchCache.delete(cacheKey);
  const response = await yt.get(YT_API, {
    params: {
      part: "snippet",
      type: "video",
      videoEmbeddable: "true",
      maxResults: 20,
      q: q + " official music",
      key,
      safeSearch: "moderate",
    },
  });
  const results: YouTubeMusicResult[] = (response.data?.items || [])
    .map((item: any) => ({
      videoId: String(item.id?.videoId || ""),
      title: String(item.snippet?.title || ""),
      channel: String(item.snippet?.channelTitle || ""),
      thumbnail: String(item.snippet?.thumbnails?.medium?.url || ""),
    }))
    .filter((item: YouTubeMusicResult) =>
      /^[a-zA-Z0-9_-]{11}$/.test(item.videoId) && item.title.length > 0
    );
  if (searchCache.size >= MAX_CACHE_ENTRIES) {
    searchCache.delete(searchCache.keys().next().value!);
  }
  searchCache.set(cacheKey, { until: Date.now() + CACHE_TTL_MS, results });
  return results;
}

// ---------------------------------------------------------------------------
// YouTube tab (Kable Killers Mobile). Official Data API only: search, trending
// charts and channel uploads. Playback stays in YouTube's embedded player.
// ---------------------------------------------------------------------------

const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";
const TAB_CACHE_TTL_MS = 60 * 60 * 1000;
const tabCache = new Map<string, { until: number; data: YouTubeTabPage }>();

export type YouTubeTabVideo = {
  videoId: string;
  title: string;
  channel: string;
  channelId: string;
  thumbnail: string;
  publishedAt: string;
  duration?: string;
  isLive?: boolean;
};

export type YouTubeTabPage = { results: YouTubeTabVideo[]; nextPageToken?: string };

/** Trending categories shown as chips in the app. */
export const YOUTUBE_CATEGORIES: Record<string, string | undefined> = {
  all: undefined,
  music: "10",
  gaming: "20",
  sports: "17",
  news: "25",
  movies: "1",
  comedy: "23",
  science: "28",
};

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new Error("YouTube is not configured");
  return key;
}

async function cached(cacheKey: string, load: () => Promise<YouTubeTabPage>): Promise<YouTubeTabPage> {
  const hit = tabCache.get(cacheKey);
  if (hit && hit.until > Date.now()) return hit.data;
  const data = await load();
  if (tabCache.size >= 300) tabCache.delete(tabCache.keys().next().value!);
  tabCache.set(cacheKey, { until: Date.now() + TAB_CACHE_TTL_MS, data });
  return data;
}

function mapSearchItem(item: any): YouTubeTabVideo {
  return {
    videoId: String(item.id?.videoId || ""),
    title: String(item.snippet?.title || ""),
    channel: String(item.snippet?.channelTitle || ""),
    channelId: String(item.snippet?.channelId || ""),
    thumbnail: String(item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || ""),
    publishedAt: String(item.snippet?.publishedAt || ""),
    isLive: item.snippet?.liveBroadcastContent === "live",
  };
}

function mapVideoItem(item: any): YouTubeTabVideo {
  return {
    videoId: String(item.id || ""),
    title: String(item.snippet?.title || ""),
    channel: String(item.snippet?.channelTitle || ""),
    channelId: String(item.snippet?.channelId || ""),
    thumbnail: String(item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || ""),
    publishedAt: String(item.snippet?.publishedAt || ""),
    duration: item.contentDetails?.duration ? String(item.contentDetails.duration) : undefined,
    isLive: item.snippet?.liveBroadcastContent === "live",
  };
}

const validVideo = (v: YouTubeTabVideo) => /^[a-zA-Z0-9_-]{11}$/.test(v.videoId) && v.title.length > 0;

/** General search (videos only, embeddable). 100 quota units, cached for an hour. */
export async function searchYouTube(query: string, pageToken?: string): Promise<YouTubeTabPage> {
  const q = query.trim().slice(0, 160);
  if (!q) return { results: [] };
  return cached(`search:${q.toLocaleLowerCase("en")}:${pageToken || ""}`, async () => {
    const response = await yt.get(YT_API, {
      params: {
        part: "snippet",
        type: "video",
        videoEmbeddable: "true",
        maxResults: 25,
        q,
        key: apiKey(),
        safeSearch: "moderate",
        pageToken: pageToken || undefined,
      },
    });
    return {
      results: (response.data?.items || []).map(mapSearchItem).filter(validVideo),
      nextPageToken: response.data?.nextPageToken || undefined,
    };
  });
}

/** Most popular videos, optionally for one category. 1 quota unit, cached for an hour. */
export async function trendingYouTube(category: string, region: string, pageToken?: string): Promise<YouTubeTabPage> {
  const categoryId = YOUTUBE_CATEGORIES[category] ?? undefined;
  const regionCode = /^[A-Z]{2}$/.test(region) ? region : "US";
  return cached(`trending:${category}:${regionCode}:${pageToken || ""}`, async () => {
    const response = await yt.get(YT_VIDEOS, {
      params: {
        part: "snippet,contentDetails",
        chart: "mostPopular",
        regionCode,
        videoCategoryId: categoryId,
        maxResults: 25,
        key: apiKey(),
        pageToken: pageToken || undefined,
      },
    });
    return {
      results: (response.data?.items || []).map(mapVideoItem).filter(validVideo),
      nextPageToken: response.data?.nextPageToken || undefined,
    };
  });
}

/** Newest videos from one channel. 100 quota units, cached for an hour. */
export async function channelYouTube(channelId: string, pageToken?: string): Promise<YouTubeTabPage> {
  if (!/^[a-zA-Z0-9_-]{10,40}$/.test(channelId)) return { results: [] };
  return cached(`channel:${channelId}:${pageToken || ""}`, async () => {
    const response = await yt.get(YT_API, {
      params: {
        part: "snippet",
        type: "video",
        channelId,
        order: "date",
        maxResults: 25,
        key: apiKey(),
        pageToken: pageToken || undefined,
      },
    });
    return {
      results: (response.data?.items || []).map(mapSearchItem).filter(validVideo),
      nextPageToken: response.data?.nextPageToken || undefined,
    };
  });
}
