import fs from 'node:fs'
import path from 'node:path'

import { expect, it } from 'vitest'

import { DEBUG_PANEL_MARKER, debugPanelFiles } from './debug-panel-scan.ts'

it('finds the files that hold the panel, and only those', () => {
  const files = [
    { url: '/_next/static/chunks/app.js', text: 'a.createElement("div",{})' },
    { url: '/_next/static/chunks/panel.js', text: `x({"${DEBUG_PANEL_MARKER}":!0})` },
    { url: '/', text: `<aside ${DEBUG_PANEL_MARKER}>` },
  ]
  expect(debugPanelFiles(files)).toEqual(['/_next/static/chunks/panel.js', '/'])
  expect(debugPanelFiles(files.slice(0, 1))).toEqual([])
})

// A guard on source on purpose: rename the attribute in the panel and the scan above would pass on
// every build without proving anything.
it('looks for the attribute the panel really carries', () => {
  const panel = fs.readFileSync(
    path.resolve(import.meta.dirname, '../apps/web/src/app/DebugPanel.tsx'),
    'utf8',
  )
  expect(panel).toContain(DEBUG_PANEL_MARKER)
})
