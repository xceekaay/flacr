function cmp(a, b, order) {
  return order === 'Ascending' ? a - b : b - a
}

function strCmp(a, b, order) {
  const result = a.localeCompare(b, undefined, { sensitivity: 'base' })
  return order === 'Ascending' ? result : -result
}

export function sortSongs(songs, sortBy, order) {
  return [...songs].sort((a, b) => {
    switch (sortBy) {
      case 'SortName':
        return strCmp((a.Name || '').toLowerCase(), (b.Name || '').toLowerCase(), order)
      case 'AlbumArtist':
        return strCmp((a.AlbumArtist || '').toLowerCase(), (b.AlbumArtist || '').toLowerCase(), order)
      case 'Album':
        return strCmp((a.Album || '').toLowerCase(), (b.Album || '').toLowerCase(), order)
      case 'ProductionYear':
        return cmp(a.ProductionYear || 0, b.ProductionYear || 0, order)
      case 'Runtime':
        return cmp(a.RunTimeTicks || 0, b.RunTimeTicks || 0, order)
      case 'DateCreated':
        return cmp(new Date(a.DateCreated || 0).getTime(), new Date(b.DateCreated || 0).getTime(), order)
      default:
        return 0
    }
  })
}

// Albums share the same sort fields as songs (minus Runtime/Album)
export function sortAlbums(albums, sortBy, order) {
  return [...albums].sort((a, b) => {
    switch (sortBy) {
      case 'SortName':
        return strCmp((a.Name || '').toLowerCase(), (b.Name || '').toLowerCase(), order)
      case 'AlbumArtist':
        return strCmp((a.AlbumArtist || '').toLowerCase(), (b.AlbumArtist || '').toLowerCase(), order)
      case 'ProductionYear':
        return cmp(a.ProductionYear || 0, b.ProductionYear || 0, order)
      case 'DateCreated':
        return cmp(new Date(a.DateCreated || 0).getTime(), new Date(b.DateCreated || 0).getTime(), order)
      default:
        return strCmp((a.SortName || a.Name || '').toLowerCase(), (b.SortName || b.Name || '').toLowerCase(), order)
    }
  })
}

export function sortByName(items, order = 'Ascending') {
  return [...items].sort((a, b) =>
    strCmp((a.SortName || a.Name || '').toLowerCase(), (b.SortName || b.Name || '').toLowerCase(), order)
  )
}
