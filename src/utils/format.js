/**
 * Format a duration in seconds to m:ss
 */
export function formatSeconds(s) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = String(Math.floor(s % 60)).padStart(2, '0')
  return `${m}:${sec}`
}

/**
 * Format Jellyfin RunTimeTicks (100-nanosecond units) to m:ss
 */
export function formatTicks(ticks) {
  if (!ticks) return '—'
  return formatSeconds(Math.floor(ticks / 10_000_000))
}

/**
 * Simple pluralisation: "1 track" / "3 tracks"
 */
export function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}
