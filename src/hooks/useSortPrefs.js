import { useState } from 'react'

const STORAGE_KEY = 'flacr_sort_prefs'

function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} } }
function save(p) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch {} }

function initSort(opts, key) {
  const p = load()[key]
  if (!p) return { option: opts[0], order: opts[0].sortOrder }
  return { option: opts.find(o => o.label === p.label) || opts[0], order: p.order || opts[0].sortOrder }
}

export function useSortPrefs(opts, key) {
  const [sort, setSortRaw] = useState(() => initSort(opts, key))
  const [showDropdown, setShowDropdown] = useState(false)

  const setSort = (v) => {
    setSortRaw(v)
    save({ ...load(), [key]: { label: v.option.label, order: v.order } })
  }

  return { sort, setSort, showDropdown, setShowDropdown }
}
