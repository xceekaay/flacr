import { create } from 'zustand'

// Global singleton — only one context menu can be open at a time.
// Type: null | { type: 'song'|'album'|'playlist'|'emptyPlaylist', x, y, ...data }
const useMenuStore = create((set) => ({
  menu: null,
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: null }),
}))

export default useMenuStore
