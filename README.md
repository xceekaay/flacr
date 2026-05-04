# flacr.

A Jellyfin music player built with Electron and React. Connects to your Jellyfin server and gives you a clean, fast interface for your music library.

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/xceekaay)

<img width="1919" height="1078" alt="Screenshot" src="https://github.com/user-attachments/assets/caa1a53c-6216-49e2-98d2-902d3ae89b61" />

## Features

- Browse by songs, albums, artists, genres, playlists, and favorites
- Full playback controls — shuffle, repeat, crossfade, gapless playback, volume normalization, sleep timer
- 10-band Equalizer with built-in presets
- Queue panel with drag-to-reorder
- Full-screen Now Playing view with synchronized lyrics panel
- Mini player window
- Playlist management — create, rename, delete, reorder tracks, and upload cover art
- System tray controls and global media keys
- Discord Rich Presence
- Dark theme with smooth animations and customizable accent color

## Download

Pre-built installers are available on the [Releases](../../releases) page.

| Platform | Format |
|----------|--------|
| Windows | `.exe` installer (NSIS) |
| macOS | `.dmg` (x64 + Apple Silicon) |
| Linux | `.AppImage` / `.deb` (x64) |

## Build from Source

**Requirements:** Node.js 22 or later

```bash
git clone https://github.com/xceekaay/flacr
cd flacr
npm install
```

**Run in development:**
```bash
npm run dev
```

**Build an installer for your platform:**
```bash
npm run dist
```

Platform-specific builds:
```bash
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

The output will be in the `release/` folder.

## Requirements

A running [Jellyfin](https://jellyfin.org) server (self-hosted). flacr. connects to it using your server URL and credentials — no account or external service needed.

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE) for details.
