function getDeviceId() {
  const key = 'flacr_device_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = 'flacr-' + crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

function buildAuthHeader(token, deviceId) {
  const id = deviceId || getDeviceId()
  const base = `MediaBrowser Client="flacr.", Device="Desktop", DeviceId="${id}", Version="${__APP_VERSION__}"`
  return token ? `${base}, Token="${token}"` : base
}

const AUTH_HEADER = buildAuthHeader()

/**
 * Authenticate with a Jellyfin server.
 * Tries HTTPS first, falls back to HTTP.
 * Returns { serverUrl, token, userId, username } or throws.
 */
export async function authenticate(ip, port, username, password) {
  const cleanIp = ip.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')

  const portNum = parseInt(port, 10)
  if (!port || isNaN(portNum) || portNum < 1 || portNum > 65535) {
    throw new Error('Invalid port number. Must be between 1 and 65535.')
  }

  const deviceId = 'flacr-' + crypto.randomUUID()
  const authHeader = buildAuthHeader(null, deviceId)

  for (const scheme of ['https', 'http']) {
    const baseUrl = `${scheme}://${cleanIp}:${port}`
    try {
      const res = await fetch(`${baseUrl}/Users/AuthenticateByName`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Emby-Authorization': authHeader,
        },
        body: JSON.stringify({ Username: username, Pw: password }),
      })
      if (!res.ok) continue
      const data = await res.json()
      return {
        serverUrl: baseUrl,
        token: data.AccessToken,
        userId: data.User.Id,
        username: data.User.Name,
        deviceId,
      }
    } catch {
      // try next scheme
    }
  }
  throw new Error('Could not connect. Check your IP, port and credentials.')
}

/**
 * Verify a saved session is still valid.
 * Returns true if the server responds OK, false otherwise.
 */
export async function verifySession(session) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(`${session.serverUrl}/Users/${session.userId}`, {
      headers: { 'X-Emby-Token': session.token },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (res.ok) return 'ok'
    if (res.status === 401 || res.status === 403) return 'auth'
    return 'unreachable'
  } catch (e) {
    clearTimeout(timer)
    return e.name === 'AbortError' ? 'timeout' : 'unreachable'
  }
}

/**
 * Build an auth header object for authenticated requests.
 */
function authHeaders(session) {
  return { 'X-Emby-Token': session.token }
}

/**
 * Return a Jellyfin image URL for an item.
 */
export function imgUrl(session, itemId, size = 48) {
  return `${session.serverUrl}/Items/${itemId}/Images/Primary?fillHeight=${size}&fillWidth=${size}&quality=80`
}

/**
 * Return a Jellyfin audio stream URL for a song.
 * The auth token is NOT included in the URL — it is injected as a request
 * header by the main process (see main.js webRequest interceptor).
 */

const QUALITY_BITRATE = { high: 256000, medium: 192000, low: 128000 }

export function streamUrl(session, songId, quality = 'original') {
  if (!quality || quality === 'original' || quality === 'auto') {
    return `${session.serverUrl}/Audio/${songId}/stream?static=true`
  }
  const bitrate = QUALITY_BITRATE[quality] ?? 256000
  return `${session.serverUrl}/Audio/${songId}/stream?audioCodec=aac&audioBitRate=${bitrate}&static=false`
}

// ---------------------------------------------------------------------------
// Library fetchers
// ---------------------------------------------------------------------------

async function apiFetch(url, session) {
  const res = await fetch(url, { headers: authHeaders(session) })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function fetchAllSongs(session) {
  // First get total count, then fetch everything in one shot
  const count = await apiFetch(
    `${session.serverUrl}/Users/${session.userId}/Items?IncludeItemTypes=Audio,MusicVideo&Recursive=true&Limit=1`,
    session
  )
  const total = count.TotalRecordCount || 500
  const data = await apiFetch(
    `${session.serverUrl}/Users/${session.userId}/Items?IncludeItemTypes=Audio,MusicVideo&Recursive=true&Limit=${total}&Fields=DateCreated,SortName,ProductionYear,UserData,RunTimeTicks,AlbumId,AlbumArtist,ArtistNames,Album,ImageTags`,
    session
  )
  return data.Items || []
}

export async function fetchCurrentUser(session) {
  const data = await apiFetch(`${session.serverUrl}/Users/${session.userId}`, session)
  return data
}

export async function fetchAlbums(session) {
  const data = await apiFetch(
    `${session.serverUrl}/Users/${session.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&Fields=DateCreated,SortName,ProductionYear`,
    session
  )
  return data.Items || []
}

export async function fetchArtists(session) {
  const data = await apiFetch(
    `${session.serverUrl}/Artists?UserId=${session.userId}&Fields=SortName`,
    session
  )
  return data.Items || []
}

export async function fetchRecentAlbums(session, limit = 12) {
  const data = await apiFetch(
    `${session.serverUrl}/Users/${session.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=DateCreated&SortOrder=Descending&Limit=${limit}&Fields=DateCreated`,
    session
  )
  return data.Items || []
}

export async function fetchFavoriteIds(session) {
  const data = await apiFetch(
    `${session.serverUrl}/Users/${session.userId}/Items?IncludeItemTypes=Audio,MusicVideo&Recursive=true&Filters=IsFavorite&Limit=1000`,
    session
  )
  return new Set((data.Items || []).map((i) => i.Id))
}

export async function fetchFavoriteSongs(session) {
  const data = await apiFetch(
    `${session.serverUrl}/Users/${session.userId}/Items?IncludeItemTypes=Audio,MusicVideo&Recursive=true&Filters=IsFavorite&SortBy=SortName&SortOrder=Ascending&Fields=UserData,RunTimeTicks,AlbumId,AlbumArtist,ArtistNames,Album,ImageTags`,
    session
  )
  return data.Items || []
}

export async function fetchAlbumSongs(session, albumId) {
  const data = await apiFetch(
    `${session.serverUrl}/Users/${session.userId}/Items?ParentId=${albumId}&SortBy=IndexNumber&SortOrder=Ascending`,
    session
  )
  return data.Items || []
}

export async function fetchArtistSongs(session, artistId) {
  const data = await apiFetch(
    `${session.serverUrl}/Users/${session.userId}/Items?IncludeItemTypes=Audio,MusicVideo&Recursive=true&ArtistIds=${artistId}&SortBy=SortName&SortOrder=Ascending&Fields=UserData,RunTimeTicks,AlbumId,AlbumArtist,ArtistNames,Album,ImageTags`,
    session
  )
  return data.Items || []
}

export async function toggleFavoriteApi(session, songId, isCurrentlyFav) {
  await fetch(
    `${session.serverUrl}/Users/${session.userId}/FavoriteItems/${songId}`,
    { method: isCurrentlyFav ? 'DELETE' : 'POST', headers: authHeaders(session) }
  )
}

// ---------------------------------------------------------------------------
// Genres
// ---------------------------------------------------------------------------

export async function fetchGenres(session) {
  const data = await apiFetch(
    `${session.serverUrl}/MusicGenres?UserId=${session.userId}&Fields=ItemCounts`,
    session
  )
  return data.Items || []
}

export async function fetchGenreSongs(session, genreName) {
  const data = await apiFetch(
    `${session.serverUrl}/Users/${session.userId}/Items?IncludeItemTypes=Audio,MusicVideo&Recursive=true&Genres=${encodeURIComponent(genreName)}&SortBy=SortName&SortOrder=Ascending&Fields=UserData,RunTimeTicks,AlbumId,AlbumArtist,ArtistNames,Album,ImageTags`,
    session
  )
  return data.Items || []
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

export async function fetchPlaylists(session) {
  const data = await apiFetch(
    `${session.serverUrl}/Users/${session.userId}/Items?IncludeItemTypes=Playlist&Recursive=true&SortBy=SortName&SortOrder=Ascending`,
    session
  )
  return data.Items || []
}

export async function fetchPlaylistSongs(session, playlistId) {
  const data = await apiFetch(
    `${session.serverUrl}/Playlists/${playlistId}/Items?UserId=${session.userId}&Fields=UserData,RunTimeTicks,AlbumId,AlbumArtist,ArtistNames,Album,ImageTags`,
    session
  )
  return data.Items || []
}

export async function createPlaylist(session, name) {
  const res = await fetch(`${session.serverUrl}/Playlists`, {
    method: 'POST',
    headers: { ...authHeaders(session), 'Content-Type': 'application/json' },
    body: JSON.stringify({ Name: name, UserId: session.userId, MediaType: 'Audio' }),
  })
  if (!res.ok) throw new Error('Failed to create playlist')
  return res.json()
}

export async function addToPlaylist(session, playlistId, songIds) {
  await fetch(
    `${session.serverUrl}/Playlists/${playlistId}/Items?Ids=${songIds.join(',')}`,
    { method: 'POST', headers: authHeaders(session) }
  )
}

export async function removeFromPlaylist(session, playlistId, entryIds) {
  await fetch(
    `${session.serverUrl}/Playlists/${playlistId}/Items?EntryIds=${entryIds.join(',')}`,
    { method: 'DELETE', headers: authHeaders(session) }
  )
}

export async function fetchArtistAlbums(session, artistId) {
  const data = await apiFetch(
    `${session.serverUrl}/Users/${session.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&ArtistIds=${artistId}&SortBy=ProductionYear,SortName&SortOrder=Descending,Ascending&Fields=DateCreated,ProductionYear`,
    session
  )
  return data.Items || []
}

export async function fetchRecentlyPlayed(session, limit = 12) {
  const data = await apiFetch(
    `${session.serverUrl}/Users/${session.userId}/Items?IncludeItemTypes=MusicAlbum,Playlist&Recursive=true&SortBy=DatePlayed&SortOrder=Descending&Limit=${limit}&Fields=DatePlayed,ImageTags`,
    session
  )
  return data.Items || []
}

export async function fetchTopItems(session, type = 'Audio,MusicVideo', limit = 12) {
  const data = await apiFetch(
    `${session.serverUrl}/Users/${session.userId}/Items?IncludeItemTypes=${type}&Recursive=true&SortBy=PlayCount&SortOrder=Descending&Limit=${limit}&Fields=PlayCount,ImageTags,ArtistNames,AlbumArtist,Album,RunTimeTicks,UserData`,
    session
  )
  return data.Items || []
}


export async function deletePlaylist(session, playlistId) {
  const res = await fetch(`${session.serverUrl}/Items/${playlistId}`, {
    method: 'DELETE',
    headers: authHeaders(session),
  })
  if (!res.ok) throw new Error(`Failed to delete playlist: ${res.status}`)
}

export async function renamePlaylist(session, playlistId, name) {
  const res = await fetch(`${session.serverUrl}/Playlists/${playlistId}`, {
    method: 'POST',
    headers: { ...authHeaders(session), 'Content-Type': 'application/json' },
    body: JSON.stringify({ Name: name, UserId: session.userId }),
  })
  if (!res.ok) throw new Error(`Failed to rename: ${res.status}`)
}

export async function uploadPlaylistImage(session, playlistId, file) {
  const mimeType = file.type && file.type.startsWith('image/') ? file.type : 'image/png'
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const res = await fetch(
    `${session.serverUrl}/Items/${playlistId}/Images/Primary`,
    { method: 'POST', headers: { 'Authorization': buildAuthHeader(session.token), 'Content-Type': mimeType }, body: base64 }
  )
  if (!res.ok) throw new Error(`Failed to upload image: ${res.status}`)
}

// ---------------------------------------------------------------------------
// Lyrics
// ---------------------------------------------------------------------------

export async function fetchLyrics(session, songId) {
  try {
    const data = await apiFetch(`${session.serverUrl}/Audio/${songId}/Lyrics`, session)
    return data
  } catch (err) {
    return null
  }
}

// ---------------------------------------------------------------------------
// Similar items
// ---------------------------------------------------------------------------

export async function fetchSimilar(session, itemId, limit = 12) {
  return apiFetch(
    `${session.serverUrl}/Items/${itemId}/Similar?UserId=${session.userId}&Limit=${limit}&Fields=DateCreated,SortName,ProductionYear,ImageTags`,
    session
  ).then(data => data.Items || []).catch(() => [])
}

// ---------------------------------------------------------------------------
// Playback Reporting (History)
// ---------------------------------------------------------------------------

export async function reportPlaybackStart(session, song) {
  const url = `${session.serverUrl}/Sessions/Playing`
  const body = {
    ItemId: song.Id,
    CanSeek: true,
    MediaSourceId: song.Id,
  }
  return fetch(url, {
    method: 'POST',
    headers: { ...authHeaders(session), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(() => {})
}

export async function reportPlaybackProgress(session, song, positionTicks, isPaused) {
  const url = `${session.serverUrl}/Sessions/Playing/Progress`
  const body = {
    ItemId: song.Id,
    PositionTicks: positionTicks,
    IsPaused: isPaused,
  }
  return fetch(url, {
    method: 'POST',
    headers: { ...authHeaders(session), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(() => {})
}

export async function reportPlaybackStopped(session, song, positionTicks) {
  const url = `${session.serverUrl}/Sessions/Playing/Stopped`
  const body = {
    ItemId: song.Id,
    PositionTicks: positionTicks,
  }
  return fetch(url, {
    method: 'POST',
    headers: { ...authHeaders(session), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(() => {})
}

export async function logoutSession(session) {
  return fetch(`${session.serverUrl}/Sessions/Logout`, {
    method: 'POST',
    headers: authHeaders(session),
  }).catch(() => {})
}

export async function forceUpdateHistoryDate(session, songId) {
  // Use the canonical Jellyfin "mark as played" endpoint, which reliably updates
  // LastPlayedDate, PlayCount, and Played status in a way SortBy=DatePlayed respects.
  const url = `${session.serverUrl}/Users/${session.userId}/PlayedItems/${songId}`
  return fetch(url, {
    method: 'POST',
    headers: authHeaders(session),
  }).catch(() => {})
}

