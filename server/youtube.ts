import axios from "axios";

const YT_API = "https://www.googleapis.com/youtube/v3/search";
const yt = axios.create({ timeout: 12000 });

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
  return (response.data?.items || [])
    .map((item: any) => ({
      videoId: String(item.id?.videoId || ""),
      title: String(item.snippet?.title || ""),
      channel: String(item.snippet?.channelTitle || ""),
      thumbnail: String(item.snippet?.thumbnails?.medium?.url || ""),
    }))
    .filter((item: YouTubeMusicResult) =>
      /^[a-zA-Z0-9_-]{11}$/.test(item.videoId) && item.title.length > 0
    );
}
