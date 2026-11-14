// The `?debug` panel must not be in a production build (ticket 28b). It marks itself with this
// attribute (apps/web/src/app/DebugPanel.tsx); minifying keeps string literals, so the marker is in
// any built file that holds the panel. smoke/secrets.spec.ts runs this over everything the built
// image serves. Pure, so it is unit-tested.
import type { Served } from './secrets-scan.ts'

export const DEBUG_PANEL_MARKER = 'data-house-debug-panel'

/** The URLs of the files that contain the panel. */
export const debugPanelFiles = (files: Served[]): string[] =>
  files.filter(({ text }) => text.includes(DEBUG_PANEL_MARKER)).map(({ url }) => url)
