import { create } from 'zustand'

const useUpdateStore = create((set, get) => ({
  updateStatus: null,
  dismissed: false,
  // Progress messages arrive many times a second during a download. Only
  // clear the dismissal when the update actually moves to a new stage,
  // otherwise pressing Dismiss mid-download has no effect.
  setUpdateStatus: (status) => {
    const prevType = get().updateStatus?.type
    const nextType = status?.type
    set({
      updateStatus: status,
      dismissed: prevType === nextType ? get().dismissed : false,
    })
  },
  setDismissed: (val) => set({ dismissed: val }),
}))

export default useUpdateStore
