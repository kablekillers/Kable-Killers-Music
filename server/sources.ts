// Extra music sources for Kable Killers Music.
// All of these are free, legal sources that serve full-length audio:
//   - Audius           (independent artists, full tracks)
//   - Radio Browser    (30,000+ live internet radio stations)
//   - Internet Archive (live concerts, old-time radio, public-domain music)
import axios from "axios";
import { storage } from "./storage";

const UA = "KableKillersMusic/1.1 (+https://github.com/kablekillers/Kable-Killers-Music)";
const http = axios.create({ timeout: 12000, headers: { "User-Agent": UA } });

async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  try {
    const hit = await storage.getCache(key);
    if (hit) return hit as T;
  } catch {}
  const value = await fn();
  try {
    if (value && (!Array.isArray(value) || value.length)) await storage.setCache(key, value, ttlSeconds);
  } catch {}
  return value;
}

const minutes = (seconds?: number) => (seconds ? `${Math.max(1, Math.round(seconds / 60))} min` : undefined);

// ---------------------------------------------------------------------------
// Audius
// ---------------------------------------------------------------------------
const AUDIUS_BASE = process.env.AUDIUS_API_BASE || "https://api.audius.co/v1";
const AUDIUS_APP = "KableKillersMusic";
const AUDIUS_KEY = process.env.AUDIUS_API_KEY; // optional, free at api.audius.co/plans

function audiusHeaders() {
  return AUDIUS_KEY ? { "x-api-key": AUDIUS_KEY } : {};
}

function audiusArt(t: any) {
  return t?.artwork?.["1000x1000"] || t?.artwork?.["480x480"] || t?.artwork?.["150x150"] || t?.user?.profile_picture?.["480x480"] || "";
}

function audiusToMeta(t: any) {
  const art = audiusArt(t);
  return {
    id: `audius:${t.id}`,
    type: "music",
    name: t.user?.name ? `${t.title} — ${t.user.name}` : t.title,
    poster: art,
    background: art,
    description: [t.user?.name && `By ${t.user.name} on Audius`, t.description].filter(Boolean).join("\n\n"),
    genres: t.genre ? [t.genre] : [],
    runtime: minutes(t.duration),
    released: t.release_date || t.created_at,
  };
}

export async function audiusSearch(query: string) {
  return cached(`audius:search:${query}`, 3600, async () => {
    try {
      const { data } = await http.get(`${AUDIUS_BASE}/tracks/search`, {
        params: { query, app_name: AUDIUS_APP, limit: 50 },
        headers: audiusHeaders(),
      });
      return (data?.data || []).filter((t: any) => t.is_streamable !== false).map(audiusToMeta);
    } catch (e: any) {
      console.error("[KK Music] Audius search error:", e.message);
      return [];
    }
  });
}

export async function audiusTrending() {
  return cached(`audius:trending`, 3600, async () => {
    try {
      const { data } = await http.get(`${AUDIUS_BASE}/tracks/trending`, {
        params: { app_name: AUDIUS_APP, time: "week", limit: 50 },
        headers: audiusHeaders(),
      });
      return (data?.data || []).map(audiusToMeta);
    } catch (e: any) {
      console.error("[KK Music] Audius trending error:", e.message);
      return [];
    }
  });
}

export async function audiusMeta(id: string) {
  return cached(`audius:track:${id}`, 86400, async () => {
    try {
      const { data } = await http.get(`${AUDIUS_BASE}/tracks/${id}`, {
        params: { app_name: AUDIUS_APP },
        headers: audiusHeaders(),
      });
      return data?.data ? audiusToMeta(data.data) : null;
    } catch (e: any) {
      console.error("[KK Music] Audius track error:", e.message);
      return null;
    }
  });
}

export async function audiusStreams(id: string) {
  const apiUrl = `${AUDIUS_BASE}/tracks/${id}/stream?app_name=${AUDIUS_APP}`;
  let url = apiUrl;
  try {
    // Resolve the redirect server-side so the player gets a direct audio URL
    // (players can't send the API key header themselves).
    const res = await http.get(apiUrl, {
      headers: audiusHeaders(),
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 400,
      responseType: "stream",
    });
    if (res.headers.location) url = res.headers.location;
    res.data?.destroy?.();
  } catch (e: any) {
    console.error("[KK Music] Audius stream resolve error:", e.message);
  }
  return [{ name: "KK Music\nAudius", title: "Full track • MP3", url }];
}

// ---------------------------------------------------------------------------
// Radio Browser (live internet radio)
// ---------------------------------------------------------------------------
const RADIO_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
];

async function radioGet(path: string, params: Record<string, any>) {
  let lastErr: any;
  for (const server of RADIO_SERVERS) {
    try {
      const { data } = await http.get(`${server}${path}`, { params, timeout: 8000 });
      return data;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function radioToMeta(s: any) {
  const tags = (s.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean);
  const logo = s.favicon || "";
  return {
    id: `radio:${s.stationuuid}`,
    type: "music",
    name: `📻 ${s.name.trim()}`,
    poster: logo,
    posterShape: "square",
    logo,
    background: logo,
    description: [
      "Live radio station",
      [s.country, s.language].filter(Boolean).join(" • "),
      s.codec && `${s.codec}${s.bitrate ? ` ${s.bitrate} kbps` : ""}`,
      tags.length && `Tags: ${tags.slice(0, 8).join(", ")}`,
    ].filter(Boolean).join("\n"),
    genres: tags.slice(0, 5),
  };
}

const RADIO_BASE_PARAMS = { hidebroken: true, order: "clickcount", reverse: true, limit: 60 };

export async function radioSearch(query: string) {
  return cached(`radio:search:${query}`, 3600, async () => {
    try {
      // Search by station name, then by genre/tag, and merge
      const [byName, byTag] = await Promise.all([
        radioGet("/json/stations/search", { ...RADIO_BASE_PARAMS, name: query }).catch(() => []),
        radioGet("/json/stations/search", { ...RADIO_BASE_PARAMS, tag: query.toLowerCase() }).catch(() => []),
      ]);
      const seen = new Set<string>();
      return [...byName, ...byTag]
        .filter((s: any) => s.url_resolved && !seen.has(s.stationuuid) && seen.add(s.stationuuid))
        .slice(0, 80)
        .map(radioToMeta);
    } catch (e: any) {
      console.error("[KK Music] Radio search error:", e.message);
      return [];
    }
  });
}

export async function radioTop() {
  return cached(`radio:top`, 3600 * 6, async () => {
    try {
      const data = await radioGet("/json/stations/search", { ...RADIO_BASE_PARAMS, countrycode: "US", limit: 80 });
      return data.filter((s: any) => s.url_resolved).map(radioToMeta);
    } catch (e: any) {
      console.error("[KK Music] Radio top error:", e.message);
      return [];
    }
  });
}

async function radioStation(uuid: string) {
  return cached(`radio:station:${uuid}`, 3600 * 6, async () => {
    try {
      const data = await radioGet(`/json/stations/byuuid/${uuid}`, {});
      return data?.[0] || null;
    } catch (e: any) {
      console.error("[KK Music] Radio station error:", e.message);
      return null;
    }
  });
}

export async function radioMeta(uuid: string) {
  const s = await radioStation(uuid);
  return s ? radioToMeta(s) : null;
}

export async function radioStreams(uuid: string) {
  const s = await radioStation(uuid);
  if (!s?.url_resolved) return [];
  // Let Radio Browser count the play (good citizenship, keeps rankings useful)
  radioGet(`/json/url/${uuid}`, {}).catch(() => {});
  return [{
    name: "KK Music\nLive Radio",
    title: `🔴 LIVE • ${s.codec || "Audio"}${s.bitrate ? ` ${s.bitrate} kbps` : ""}`,
    url: s.url_resolved,
  }];
}

// ---------------------------------------------------------------------------
// Internet Archive (live concerts, public-domain recordings)
// ---------------------------------------------------------------------------
const IA = "https://archive.org";

function iaToMeta(doc: any) {
  const creator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator;
  const title = Array.isArray(doc.title) ? doc.title[0] : doc.title;
  const img = `${IA}/services/img/${doc.identifier}`;
  const desc = Array.isArray(doc.description) ? doc.description[0] : doc.description;
  return {
    id: `ia:${doc.identifier}`,
    type: "music",
    name: creator && !String(title).includes(creator) ? `${title} — ${creator}` : title,
    poster: img,
    posterShape: "square",
    background: img,
    description: [creator && `By ${creator} • Internet Archive`, typeof desc === "string" ? desc.replace(/<[^>]+>/g, "").slice(0, 600) : ""].filter(Boolean).join("\n\n"),
    released: doc.date || doc.year,
  };
}

export async function archiveSearch(query: string) {
  return cached(`ia:search2:${query}`, 3600 * 6, async () => {
    try {
      // Build the query string by hand: archive.org needs literal "fl[]" keys
      const qs = new URLSearchParams();
      qs.append("q", `(${query}) AND mediatype:(audio) AND NOT collection:(podcasts OR audio_podcast)`);
      for (const f of ["identifier", "title", "creator", "date", "year", "description"]) qs.append("fl[]", f);
      qs.append("sort[]", "downloads desc");
      qs.append("rows", "50");
      qs.append("output", "json");
      const { data } = await http.get(`${IA}/advancedsearch.php?${qs.toString()}`);
      return (data?.response?.docs || [])
        .filter((d: any) => d.identifier)
        .map((d: any) => ({ ...d, title: d.title || d.identifier }))
        .map(iaToMeta);
    } catch (e: any) {
      console.error("[KK Music] Archive search error:", e.message);
      return [];
    }
  });
}

async function iaItem(identifier: string) {
  return cached(`ia:item:${identifier}`, 86400, async () => {
    try {
      const { data } = await http.get(`${IA}/metadata/${identifier}`);
      return data?.metadata ? data : null;
    } catch (e: any) {
      console.error("[KK Music] Archive item error:", e.message);
      return null;
    }
  });
}

function iaTracks(item: any) {
  const files: any[] = item.files || [];
  const pick = (fmt: RegExp) => files.filter((f) => fmt.test(f.format || "") && f.source !== "metadata");
  let tracks = pick(/VBR MP3|^MP3$|128Kbps MP3|64Kbps MP3/i);
  if (!tracks.length) tracks = pick(/Ogg Vorbis/i);
  if (!tracks.length) tracks = files.filter((f) => /\.(mp3|ogg|m4a)$/i.test(f.name));
  // Prefer one encoding per original file
  const seen = new Set<string>();
  tracks = tracks.filter((f) => {
    const key = (f.original || f.name).replace(/\.[^.]+$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return tracks
    .sort((a, b) => (Number(a.track) || 0) - (Number(b.track) || 0) || String(a.name).localeCompare(String(b.name), undefined, { numeric: true }))
    .slice(0, 100);
}

export async function archiveMeta(identifier: string) {
  const item = await iaItem(identifier);
  if (!item) return null;
  const meta = iaToMeta({ identifier, ...item.metadata });
  const tracks = iaTracks(item);
  return {
    ...meta,
    description: [meta.description, tracks.length > 1 ? `${tracks.length} tracks — pick one from the stream list.` : ""].filter(Boolean).join("\n\n"),
  };
}

export async function archiveStreams(identifier: string) {
  const item = await iaItem(identifier);
  if (!item) return [];
  return iaTracks(item).map((f, i) => ({
    name: "KK Music\nArchive",
    title: `${String(i + 1).padStart(2, "0")}. ${f.title || f.name.replace(/\.[^.]+$/, "")}${f.length ? ` (${Math.round(Number(f.length) / 60) || "<1"} min)` : ""}`,
    url: `${IA}/download/${encodeURIComponent(identifier)}/${f.name.split("/").map(encodeURIComponent).join("/")}`,
  }));
}
