'use client'

import dynamic from 'next/dynamic'

// The condition is a build-time constant: in a production build the dead branch, and the import in
// it, is dropped, so the panel is not in any chunk. Keep it written exactly like this.
const DebugPanel =
  process.env.NODE_ENV === 'production'
    ? null
    : dynamic(() => import('./DebugPanel'), { ssr: false })

/** Mounted once in the root layout; renders nothing in production. */
export function DebugPanelLoader() {
  return DebugPanel && <DebugPanel />
}
