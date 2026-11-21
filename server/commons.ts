// Wikimedia Commons openly licensed audio recordings.
// Streams use Commons' original file URLs; no audio extraction or proxying.
import axios from "axios";

const API = "https://commons.wikimedia.org/w/api.php";
const client = axios.create({
  timeout: 12000,
  headers: { "User-Agent": "KableKillersMusic/1.2 (https://github.com/kablekillers/Kable-Killers-Music)" },
});
const audioMimes = new Set(["audio/mpeg", "audio/ogg", "audio/flac", "audio/wav", "audio/x-wav", "audio/webm", "audio/mp4"]);
const playable = new Set(["audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mp4"]);

function clean(value: any) {
  return String(value || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
}
function valid(page: any) {
  const info = page?.imageinfo?.[0];
  return !!info?.url && audioMimes.has(info.mime) && !/^(File:)?(LL-Q|En-us-|De-|Fr-|Pronunciation)/i.test(page.title || "");
}
function toMeta(page: any) {
  const info = page.imageinfo[0];
  const ext = info.extmetadata || {};
  const title = (page.title || "").replace(/^File:/, "").replace(/\.(mp3|oga|ogg|wav|flac|webm|m4a)$/i, "").replace(/_/g, " ");
  const author = clean(ext.Artist?.value);
  const license = clean(ext.LicenseShortName?.value);
  return {
    id: `commons:${page.pageid}`,
    type: "music",
    name: title,
    description: [author && `By ${author}`, license && `License: ${license}`, "Wikimedia Commons — verify attribution and reuse terms on the file page."].filter(Boolean).join(" • "),
    poster: "https://upload.wikimedia.org/wikipedia/commons/4/4a/Commons-logo.svg",
    background: "https://upload.wikimedia.org/wikipedia/commons/4/4a/Commons-logo.svg",
    genres: ["Openly licensed audio"],
  };
}
async function request(params: Record<string, string | number>) {
  const { data } = await client.get(API, { params: { action: "query", format: "json", formatversion: 2, ...params } });
  return data?.query?.pages || [];
}
async function getPage(id: string) {
  if (!/^\d+$/.test(id)) return null;
  try {
    const pages = await request({ pageids: id, prop: "imageinfo", iiprop: "url|mime|extmetadata" });
    return pages.find(valid) || null;
  } catch (err: any) {
    console.error("[KK Music] Commons lookup:", err.message);
    return null;
  }
}
export async function commonsSearch(search: string) {
  if (!search.trim()) return [];
  try {
    const pages = await request({
      generator: "search", gsrsearch: `${search.trim()} filetype:audio`,
      gsrnamespace: 6, gsrlimit: 40, prop: "imageinfo", iiprop: "url|mime|extmetadata",
    });
    return pages.filter(valid).map(toMeta);
  } catch (err: any) {
    console.error("[KK Music] Commons search:", err.message);
    return [];
  }
}
export async function commonsMeta(id: string) {
  const page = await getPage(id);
  return page ? toMeta(page) : null;
}
export async function commonsStreams(id: string) {
  const page = await getPage(id);
  if (!page) return [];
  const info = page.imageinfo[0];
  // Only return formats likely to play on Android TV's ExoPlayer.
  if (!playable.has(info.mime)) return [];
  return [{
    name: "KK Music\\nWikimedia Commons",
    title: `Full recording • ${info.mime}`,
    url: info.url,
  }];
}
