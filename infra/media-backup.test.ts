import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const file = path.resolve(import.meta.dirname, '../.github/workflows/media-backup.yml')
const text = fs.readFileSync(file, 'utf8')
// Comments may mention the forbidden words; the commands may not.
const code = text
  .split('\n')
  .filter((l) => !l.trim().startsWith('#'))
  .join('\n')

describe('media backup workflow', () => {
  it('only copies: no sync, delete or purge command or flag', () => {
    expect(code).toMatch(/rclone copy /)
    const forbidden = [
      /\bsync\b/i,
      /--delete/i,
      /\bdelete(file|purge)?\b/i,
      /\bpurge\b/i,
      /\bmove\b/i,
      /\brclone\s+(rm|rmdir|cleanup|dedupe|moveto|bisync)\b/i,
      /\baws\s+s3\s+(rm|mv)\b/i,
      /--remove/i,
    ]
    for (const re of forbidden) expect(code, String(re)).not.toMatch(re)
  })

  it('skips the static releases and the trash prefix', () => {
    expect(code).toContain("--exclude '_next/**'")
    expect(code).toContain("--exclude 'trash/**'")
    expect(code).toMatch(/rclone copy [^\n]*"\$\{skip\[@\]\}"/)
    expect(code).toMatch(/rclone lsf [^\n]*"\$\{skip\[@\]\}"/)
  })

  // Ubuntu's rclone (1.60.1) got 501s from R2 on every upload's first attempt.
  it('installs a pinned rclone release and verifies its checksum, not the apt package', () => {
    expect(code).not.toMatch(/apt-get install[^\n]*rclone/)
    expect(code).toMatch(/PINNED_RCLONE_VERSION: v\d+\.\d+\.\d+/)
    expect(code).toMatch(/PINNED_RCLONE_SHA256: [0-9a-f]{64}/)
    expect(code).toMatch(/sha256sum -c/)
    // rclone reads every RCLONE_* variable as a flag; RCLONE_VERSION broke run 42053424724.
    expect(code).not.toMatch(/^\s+RCLONE_(VERSION|SHA256):/m)
  })

  it('checks after the copy that every object it listed is in the backup', () => {
    const copy = code.indexOf('rclone copy ')
    const check = code.indexOf('rclone check ')
    expect(copy).toBeGreaterThan(-1)
    expect(check).toBeGreaterThan(copy)
    const line = code.slice(check).split('\n').slice(0, 2).join(' ')
    expect(line).toMatch(/"SRC:\$\{SRC_BUCKET\}" "DST:\$\{DST_BUCKET\}" --one-way/)
    expect(line).toMatch(/--files-from "\$RUNNER_TEMP\/listed\.txt"/)
    expect(code).toMatch(/rclone lsf [^\n]*> "\$RUNNER_TEMP\/listed\.txt"/)
  })

  it('runs on a schedule with read-only repository permissions', () => {
    expect(code).toMatch(/schedule:/)
    expect(code).toMatch(/permissions:\n\s+contents: read/)
  })

  it('is actionlint clean (when actionlint is installed)', () => {
    const r = spawnSync('actionlint', [file], { encoding: 'utf8' })
    if (r.error) return // not installed locally; `infra/ci.sh check` lints the workflows in CI
    expect(r.stdout + r.stderr).toBe('')
    expect(r.status).toBe(0)
  })
})
