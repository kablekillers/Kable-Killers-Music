import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import axios from "axios";
import {
  audiusSearch, audiusTrending, audiusMeta, audiusStreams,
  audiusAlbumSearch, audiusAlbumMeta, audiusAlbumTracks,
  radioSearch, radioTop, radioMeta, radioStreams,
  archiveSearch, archiveMeta, archiveStreams, archiveAlbumTracks,
} from "./sources";
import { commonsSearch, commonsMeta, commonsStreams } from "./commons";
import { searchYouTubeMusic, searchYouTube, trendingYouTube, channelYouTube } from "./youtube";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const sckey = require("soundcloud-key-fetch");

// Helper to check environment variables or fetch key
let currentSCKey = process.env.SC_CLIENT_ID;
let isScraping = false;
let keyPromise: Promise<string | null> | null = null;

async function getSCClientId() {
  if (currentSCKey) return currentSCKey;
  if (keyPromise) return keyPromise;

  keyPromise = (async () => {
    try {
      console.log("[KK Music] Attempting to scrape SoundCloud Client ID...");
      const key = await sckey.fetchKey().catch((err: any) => {
        console.error("[KK Music] Scraper library error:", err.message || err);
        return null;
      });

      if (key) {
        currentSCKey = key;
        console.log("[KK Music] Scraped and cached SoundCloud Client ID:", currentSCKey);
        return currentSCKey || null;
      }
      
      throw new Error("Scraper returned no key");
    } catch (error: any) {
      console.error("[KK Music] Failed to obtain SC Key:", error.message || error);
      keyPromise = null; // Allow retry on failure
      return process.env.SC_CLIENT_ID || null;
    }
  })();

  return keyPromise;
}

const SC_API_BASE = "https://api-v2.soundcloud.com";

// Branding — override with env vars if you host the images somewhere else
const ADDON_LOGO =
  process.env.ADDON_LOGO_URL ||
  "https://raw.githubusercontent.com/kablekillers/Kable-Killers-Music/main/client/public/logo.png";
const ADDON_BACKGROUND =
  process.env.ADDON_BACKGROUND_URL ||
  "https://raw.githubusercontent.com/kablekillers/Kable-Killers-Music/main/client/public/background.png";

// Stremio Manifest
const manifest = {
  id: "org.kablekillers.music",
  version: "1.2.0",
  name: "Kable Killers Music",
  description: "Search and stream music right inside Kable Killers: SoundCloud, Audius, 30,000+ live radio stations and Internet Archive concerts, and Wikimedia Commons recordings.",
  logo: ADDON_LOGO,
  icon: ADDON_LOGO,
  background: ADDON_BACKGROUND,
  resources: ["catalog", "meta", "stream"],
  types: ["music"],
  catalogs: [
    {
      type: "music",
      id: "kablekillers_music_search",
      name: "SoundCloud",
      extra: [{ name: "search", isRequired: true }]
    },
    {
      type: "music",
      id: "kk_audius",
      name: "Audius",
      extra: [{ name: "search", isRequired: false }]
    },
    {
      type: "music",
      id: "kk_radio",
      name: "Live Radio",
      extra: [{ name: "search", isRequired: false }]
    },
    {
      type: "music",
      id: "kk_audius_albums",
      name: "Audius Albums",
      extra: [{ name: "search", isRequired: true }]
    },
    {
      type: "music",
      id: "kk_commons",
      name: "Open Music & Recordings",
      extra: [{ name: "search", isRequired: true }]
    },
    {
      type: "music",
      id: "kk_archive",
      name: "Concerts & Archive",
      extra: [{ name: "search", isRequired: true }]
    }
  ],
  idPrefixes: ["sc:", "audius:", "audiuspl:", "radio:", "ia:", "commons:"]
};

const builder = new addonBuilder(manifest);

// --- SoundCloud Helpers ---

async function searchTracks(query: string) {
  const clientId = await getSCClientId();
  if (!clientId) return [];
  const cacheKey = `search:${query}`;
  const cached = await storage.getCache(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${SC_API_BASE}/search/tracks`, {
      params: { q: query, client_id: clientId, limit: 200 }
    });
    const data = response.data.collection || [];
    await storage.setCache(cacheKey, data, 3600);
    return data;
  } catch (error) {
    console.error("SC Search Error:", error);
    return [];
  }
}

async function getTrack(id: string) {
  const clientId = await getSCClientId();
  if (!clientId) return null;
  const cacheKey = `track:${id}`;
  const cached = await storage.getCache(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${SC_API_BASE}/tracks/${id}`, {
      params: { client_id: clientId }
    });
    const data = response.data;
    await storage.setCache(cacheKey, data, 86400);
    return data;
  } catch (error) {
    console.error(`SC Get Track Error (${id}):`, error);
    return null;
  }
}

// --- Addon Handlers ---

builder.defineCatalogHandler(async ({ type, id, extra }: any) => {
  console.log(`[KK Music] Catalog Request: type=${type}, id=${id}, search="${extra?.search || ''}"`);
  
  if (type === "music") {
    const q = (extra?.search || "").trim();
    if (id === "kk_audius") return { metas: q ? await audiusSearch(q) : await audiusTrending(), cacheMaxAge: 3600 };
    if (id === "kk_radio") return { metas: q ? await radioSearch(q) : await radioTop(), cacheMaxAge: 3600 };
    if (id === "kk_audius_albums") return { metas: q ? await audiusAlbumSearch(q) : [], cacheMaxAge: 3600 };
    if (id === "kk_commons") return { metas: q ? await commonsSearch(q) : [], cacheMaxAge: 3600 };
    if (id === "kk_archive") return { metas: q ? await archiveSearch(q) : [], cacheMaxAge: 3600 };

    let items = [];
    if (id === "kablekillers_music_search" && extra?.search) {
      items = await searchTracks(extra.search);
    }

    const metas = items.map((item: any) => ({
      id: `sc:${item.id}`,
      name: item.title,
      description: item.description || "",
      poster: item.artwork_url ? item.artwork_url.replace("-large", "-t500x500") : (item.user?.avatar_url || ""),
      background: item.artwork_url ? item.artwork_url.replace("-large", "-t500x500") : (item.user?.avatar_url || ""),
      type: "music",
      genres: [item.genre]
    }));
    return { metas };
  }
  return { metas: [] };
});

builder.defineMetaHandler(async ({ type, id }: any) => {
  console.log(`[KK Music] \uD83D\uDFE2 Meta Request: type=${type}, id=${id}`);
  const rest = id.slice(id.indexOf(":") + 1);
  if (id.startsWith("audiuspl:")) return { meta: await audiusAlbumMeta(rest) };
  if (id.startsWith("audius:")) return { meta: await audiusMeta(rest) };
  if (id.startsWith("radio:")) return { meta: await radioMeta(rest) };
  if (id.startsWith("commons:")) return { meta: await commonsMeta(rest) };
  if (id.startsWith("ia:")) return { meta: await archiveMeta(rest) };
  if (type === "music" && id.startsWith("sc:")) {
    const trackId = id.split(":")[1];
    console.log(`[KK Music] \uD83D\uDD0D Fetching metadata for SoundCloud track ID: ${trackId}`);
    const track = await getTrack(trackId);
    if (!track) {
      console.log(`[KK Music] \u274C No track found for ID: ${trackId}`);
      return { meta: null };
    }
    console.log(`[KK Music] \u2728 Successfully fetched track metadata: "${track.title}"`);
    console.log(`[KK Music] \uD83D\uDCCA Genre: ${track.genre}, Duration: ${track.duration}ms, Created: ${track.created_at}`);
    
    const meta = {
      id: id,
      name: track.title,
      description: track.description || "",
      poster: track.artwork_url ? track.artwork_url.replace("-large", "-t500x500") : "",
      background: track.artwork_url ? track.artwork_url.replace("-large", "-t500x500") : "",
      type: "music",
      genres: [track.genre],
      runtime: track.duration ? Math.floor(track.duration / 60000) + " min" : undefined,
      released: track.created_at
    };
    
    console.log(`[KK Music] \uD83D\uDCE1 Returning meta object to Stremio:`, JSON.stringify(meta, null, 2));
    return { meta };
  }
  console.log(`[KK Music] \u26A0\uFE0F Meta request ignored - incompatible type/id: type=${type}, id=${id}`);
  return { meta: null };
});

builder.defineStreamHandler(async ({ type, id }: any) => {
  console.log(`[KK Music] \uD83D\uDFE2 Stream Request: type=${type}, id=${id}`);
  const rest = id.slice(id.indexOf(":") + 1);
  if (id.startsWith("audiuspl:")) return { streams: [] }; // Album tracks are available from the queue endpoint.
  if (id.startsWith("audius:")) return { streams: await audiusStreams(rest) };
  if (id.startsWith("radio:")) return { streams: await radioStreams(rest) };
  if (id.startsWith("commons:")) return { streams: await commonsStreams(rest) };
  if (id.startsWith("ia:")) return { streams: await archiveStreams(rest) };
  if (type === "music" && id.startsWith("sc:")) {
    const trackId = id.split(":")[1];
    const clientId = await getSCClientId();

    try {
      // 1. Fetch track info using the provided pattern
      console.log(`[KK Music] \uD83D\uDD0D Fetching track info for ID: ${trackId}`);
      const trackResponse = await axios.get(`https://api.soundcloud.com/tracks/${trackId}`, {
        headers: {
          "accept": "application/json; charset=utf-8",
          "Authorization": `OAuth ${clientId}`
        }
      });
      const track = trackResponse.data;

      // 2. Fetch stream URL using the provided pattern
      console.log(`[KK Music] \uD83D\uDCE1 Fetching stream URL for ID: ${trackId}`);
      const streamResponse = await axios.get(`https://api.soundcloud.com/tracks/${trackId}/stream`, {
        headers: {
          "accept": "application/json; charset=utf-8",
          "Authorization": `OAuth ${clientId}`
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      });

      // Handle direct location if 302 redirect
      const directUrl = streamResponse.headers.location || streamResponse.data.http_mp3_128_url || streamResponse.data.url;

      if (directUrl) {
        console.log(`[KK Music] \u2728 SUCCESS: Resolved direct stream URL: ${directUrl.substring(0, 100)}...`);
        return {
          streams: [{
            name: "KK Music\nSoundCloud",
            title: "MP3 (128kbps)",
            url: directUrl,
            behaviorHints: {
              notWebReady: false,
              proxyHeaders: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                "Referer": "https://soundcloud.com/"
              }
            }
          }]
        };
      }
    } catch (err: any) {
      console.error(`[KK Music] \uD83E\uDDE8 ERROR using official pattern:`, err.message || err);
      
      // Fallback to internal V2 API resolution if official fails (v2 is often more resilient for scraped keys)
      console.log(`[KK Music] \uD83D\uDD04 Falling back to V2 API resolution...`);
      const v2TrackResponse = await axios.get(`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`);
      const transcodings = v2TrackResponse.data.media?.transcodings || [];
      const transcoding = transcodings.find((t: any) => t.format.protocol === "progressive" && t.format.mime_type.includes("mpeg")) || transcodings[0];
      
      if (transcoding) {
        const resolveResponse = await axios.get(`${transcoding.url}?client_id=${clientId}`);
        if (resolveResponse.data.url) {
          return {
            streams: [{
              name: "KK Music\nSoundCloud",
              title: "MP3 (128kbps)",
              url: resolveResponse.data.url,
              behaviorHints: {
                notWebReady: false,
                proxyHeaders: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                  "Referer": "https://soundcloud.com/"
                }
              }
            }]
          };
        }
      }
    }
  }
  return { streams: [] };
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register Music Hub HTTP APIs before the SDK router to avoid any fallback
  // handlers in the SDK intercepting these paths.
  // Music Hub queue endpoint: one recording per playlist item, in album order.
  app.get("/api/music/album/:identifier", async (req, res) => {
    try {
      const identifier = String(req.params.identifier || "");
      if (!/^[a-zA-Z0-9_.-]{1,200}$/.test(identifier)) {
        return res.status(400).json({ error: "Invalid album identifier" });
      }
      const tracks = await archiveAlbumTracks(identifier);
      return res.json({ id: `ia:${identifier}`, tracks });
    } catch (error: any) {
      console.error("[KK Music] Album queue error:", error?.message);
      return res.status(502).json({ error: "Unable to load album tracks" });
    }
  });

  // Albums from the official Audius catalog (sequential playback in Music Hub).
  app.get("/api/music/audius-album/:identifier", async (req, res) => {
    const identifier = String(req.params.identifier || "");
    if (!/^[a-zA-Z0-9]{1,200}$/.test(identifier)) {
      return res.status(400).json({ error: "Invalid album identifier" });
    }
    const tracks = await audiusAlbumTracks(identifier);
    const base = (process.env.PUBLIC_BASE_URL || "https://kable-killers-music.onrender.com").replace(new RegExp("/$"), "");
    return res.json({ id: `audiuspl:${identifier}`, tracks: tracks.map((t: { trackId: string; [key: string]: any }) => ({
      ...t,
      url: `${base}/api/music/audius-track/${encodeURIComponent(String(t.trackId))}`,
    })) });
  });

  // Resolve Audius redirects with optional API credentials server-side.
  // No audio files are downloaded or served from our server.
  app.get("/api/music/audius-track/:identifier", async (req, res) => {
    const identifier = String(req.params.identifier || "");
    if (!/^[a-zA-Z0-9]{1,200}$/.test(identifier)) {
      return res.status(400).json({ error: "Invalid track identifier" });
    }
    try {
      const streams = await audiusStreams(identifier);
      const url = streams[0]?.url;
      if (!url || !url.startsWith("https://")) return res.sendStatus(502);
      return res.redirect(302, url);
    } catch (e: any) {
      console.error("[KK Music] Audius track redirect error:", e?.message);
      return res.sendStatus(502);
    }
  });

  // Search YouTube through its official Data API. Video playback stays in the
  // official embedded YouTube player in Android (not a Stremio audio stream).
  app.get("/api/music/youtube/search", async (req, res) => {
    const query = String(req.query.q || "").trim().slice(0, 160);
    if (!query) return res.json({ results: [] });
    if (!process.env.YOUTUBE_API_KEY?.trim()) {
      return res.status(503).json({ error: "YouTube search is not configured" });
    }
    try {
      return res.json({ results: await searchYouTubeMusic(query) });
    } catch (e: any) {
      console.error("[KK Music] YouTube search:", e?.message);
      return res.status(502).json({ error: "YouTube search unavailable" });
    }
  });

  // YouTube tab in Kable Killers Mobile: official Data API search, trending and channels.
  const youtubeRoute = (load: (req: any) => Promise<unknown>) => async (req: any, res: any) => {
    if (!process.env.YOUTUBE_API_KEY?.trim()) {
      return res.status(503).json({ error: "YouTube is not configured" });
    }
    try {
      return res.json(await load(req));
    } catch (e: any) {
      console.error("[KK Music] YouTube tab:", e?.message);
      return res.status(502).json({ error: "YouTube unavailable" });
    }
  };
  const pageToken = (req: any) => (typeof req.query.pageToken === "string" ? req.query.pageToken.slice(0, 100) : undefined);
  app.get("/api/youtube/search", youtubeRoute((req) =>
    searchYouTube(String(req.query.q || ""), pageToken(req))));
  app.get("/api/youtube/trending", youtubeRoute((req) =>
    trendingYouTube(String(req.query.category || "all").toLowerCase(), String(req.query.region || "US").toUpperCase(), pageToken(req))));
  app.get("/api/youtube/channel/:channelId", youtubeRoute((req) =>
    channelYouTube(String(req.params.channelId || ""), pageToken(req))));

  // Test Endpoint for debugging
  app.get('/api/test-scraper', async (req, res) => {
    try {
      console.log("[KK Music] Manual test scraper triggered...");
      const clientId = await getSCClientId();
      if (!clientId) {
        throw new Error("Failed to obtain SoundCloud Client ID");
      }
      res.json({ clientId, status: 'ok' });
    } catch (error: any) {
      console.error("[KK Music] Test scraper error:", error.message);
      res.status(500).json({ error: error.message, status: 'error' });
    }
  });

  const addonInterface = builder.getInterface();
  app.use(getRouter(addonInterface));

  return httpServer;
}
