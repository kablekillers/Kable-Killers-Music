# Kable Killers Music

![Kable Killers Music](client/public/logo.png)

Kable Killers Music is a music addon for the Kable Killers app (and any Stremio-compatible app). It lets you search for and stream music from SoundCloud right inside the app.

## Music sources

| Source | What you get | Rows in the app |
| --- | --- | --- |
| SoundCloud | Millions of user-uploaded tracks | Search results |
| Audius | Full tracks from independent artists | Trending + search results |
| Live Radio (Radio Browser) | 30,000+ live internet radio stations; search by name or genre (e.g. "country", "ESPN", "jazz") | Top US stations + search results |
| Concerts & Archive (Internet Archive) | Archived concert recordings and other audio collections, with ordered album tracks | Search results |
| Wikimedia Commons | Openly licensed or public-domain recordings (license varies by file) | Search results |
| Audius Albums | Ordered albums and track lists from Audius | Search results |
| YouTube (optional) | Official search for embeddable music videos; video plays in a visible YouTube player | Music Hub YouTube tab (not a Stremio audio stream) |

## Features

- **Music search**: find tracks straight from the Kable Killers search bar.
- **Artwork and details**: track posters, descriptions, genre and length.
- **Streaming**: direct audio playback.
- **One-tap install**: install from the landing page or paste the manifest URL.

## Installing in Kable Killers

1. Deploy the addon (see below) or run it locally.
2. Open the landing page and copy the manifest URL (`https://YOUR-HOST/manifest.json`).
3. In Kable Killers, go to Add-ons, paste the URL and install.

## Running locally

Requirements: [Node.js](https://nodejs.org/) 18 or newer and a PostgreSQL database.

```bash
git clone https://github.com/kablekillers/Kable-Killers-Music.git
cd Kable-Killers-Music
npm install
npm run dev
```

The landing page runs at `http://localhost:5000`.

## Deploying to Render

This repo includes a `render.yaml` blueprint.

1. In Render, create a new **Blueprint** and connect this repo.
2. Render sets up:
   - a web service named `kable-killers-music`
   - a PostgreSQL database named `kable-killers-music-db`

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `PORT` | Port to run on (default 5000) |
| `AUDIUS_API_KEY` | Optional: free key from api.audius.co/plans if Audius starts requiring one |
| `SC_CLIENT_ID` | Optional: fixed SoundCloud client ID (otherwise fetched automatically) |
| `YOUTUBE_API_KEY` | Optional: official YouTube Data API v3 key; set as a Render secret. Without it the YouTube tab is unavailable. |
| `PUBLIC_BASE_URL` | Optional public web URL for album track redirects; defaults to the Render address. |
| `ADDON_LOGO_URL` | Optional: custom logo URL for the addon manifest |
| `ADDON_BACKGROUND_URL` | Optional: custom background URL for the addon manifest |

## Music Hub development (experimental)

The Kable Killers Mobile Android test branch adds a Music Hub. Album queues use `/api/music/audius-album/:id` and `/api/music/album/:id`; Android plays the audio files sequentially. YouTube search uses `/api/music/youtube/search?q=...`, requires `YOUTUBE_API_KEY`, and sends the chosen video to a visible official YouTube embedded player. It does not strip video or expose YouTube audio URLs. These new features are **not deployed or verified on a device**. Spotify Free playback is not supported by the Spotify playback SDK. Installing the addon alone does not add the Music Hub; a compatible Kable Killers Mobile/TV build is required.

By default the logo and background load from this repo's `client/public` folder on GitHub.

## Credits

Kable Killers Music is a rebranded fork of [Crunch](https://github.com/trliy/Crunch) by trliy, used under the MIT License.

# Released under MIT License

Copyright (c) 2013 Mark Otto.

Copyright (c) 2017 Andrew Fong.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
