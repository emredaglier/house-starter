// The house starter copies daglier.com's backbone, not its design (ADR-0001). This guard scans the
// whole repo (source, styles, docs, config and file names) for daglier's identity, fonts, colours,
// design tokens, copy and signature effect names, so a copy-paste from daglier.com cannot bring
// them along. It is a repo guard in the sense of CODING_STANDARDS.md: it enforces a rule, not
// behaviour. Projects made from the starter keep it.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** This file names every banned term on purpose. */
const SELF = path.join('scripts', 'repo-guard.test.ts')

const SKIP_DIRS = new Set(['node_modules', '.git', '.scratch', 'dist', 'build', 'coverage'])
const SKIP_FILES = new Set(['pnpm-lock.yaml', '.DS_Store'])
const isBinary = (file: string) => /\.(png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|db)$/i.test(file)

type Rule = { kind: string; pattern: RegExp }

export const BANNED: Rule[] = [
  { kind: 'identity', pattern: /daglier/i },
  { kind: 'identity', pattern: /\bemre\b/i },
  { kind: 'font', pattern: /cooper/i },
  { kind: 'font', pattern: /geist/i },
  { kind: 'colour', pattern: /#39cf67/i },
  { kind: 'colour', pattern: /oklch\(\s*(94|14\.5|98\.5)%/i },
  {
    kind: 'token',
    pattern:
      /--(curtain|duration-(portrait|curtain|preloader)|ease-(wave|portrait)|soften|nav-height)/i,
  },
  { kind: 'effect', pattern: /melt/i },
  { kind: 'effect', pattern: /\bwave(stage|\b)/i },
  { kind: 'effect', pattern: /\bsoften(ing)?\b/i },
  { kind: 'effect', pattern: /curtain/i },
  { kind: 'effect', pattern: /portrait/i },
  { kind: 'effect', pattern: /preloader/i },
  { kind: 'copy', pattern: /photograph/i },
  { kind: 'copy', pattern: /\balbums?\b/i },
]

/** `file:line: kind (match)` for every banned term in `text`. */
export function findBanned(file: string, text: string): string[] {
  const hits: string[] = []
  const lines = [file, ...text.split('\n')]
  lines.forEach((line, index) => {
    for (const { kind, pattern } of BANNED) {
      const match = pattern.exec(line)
      if (match) {
        const where = index === 0 ? `${file} (file name)` : `${file}:${index}`
        hits.push(`${where}: ${kind} "${match[0]}"`)
      }
    }
  })
  return hits
}

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // `.next`, `.next-*` and `.output` are build output; `.claude/worktrees` holds other checkouts.
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.next') || entry.name === '.output') {
        continue
      }
      if (entry.name === 'worktrees' && path.basename(dir) === '.claude') continue
      yield* walk(path.join(dir, entry.name))
    } else {
      yield path.join(dir, entry.name)
    }
  }
}

/**
 * The files that belong to the repo: tracked and new-but-not-ignored ones, so build output, logs
 * and anything else git ignores (which may hold absolute paths of the machine) is not scanned.
 * Outside a git checkout it walks the folder instead.
 */
function repoFiles(): string[] {
  let files: string[]
  try {
    const out = execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    files = out
      .split('\0')
      .filter(Boolean)
      .map((relative) => path.join(root, relative))
      .filter((file) => fs.existsSync(file))
  } catch {
    files = [...walk(root)]
  }
  return files.filter(
    (file) =>
      !SKIP_FILES.has(path.basename(file)) &&
      !isBinary(file) &&
      !path
        .relative(root, file)
        .split(path.sep)
        .some((part) => SKIP_DIRS.has(part)),
  )
}

describe('findBanned', () => {
  it('finds each kind of daglier leftover, with its line', () => {
    expect(findBanned('a.css', 'x\n--curtain-color: #39CF67;')).toEqual([
      'a.css:2: colour "#39CF67"',
      'a.css:2: token "--curtain"',
      'a.css:2: effect "curtain"',
    ])
    expect(findBanned('a.ts', "import localFont from 'next/font/local' // Cooper Hewitt")).toEqual([
      'a.ts:1: font "Cooper"',
    ])
    expect(findBanned('a.ts', 'createMeltStage(canvas)')).toEqual(['a.ts:1: effect "Melt"'])
    expect(findBanned('a.md', 'daglier.com, a photography portfolio of albums')).toEqual([
      'a.md:1: identity "daglier"',
      'a.md:1: copy "photograph"',
      'a.md:1: copy "albums"',
    ])
  })

  it('finds a banned file name', () => {
    expect(findBanned('packages/motion/src/melt/index.ts', '')).toEqual([
      'packages/motion/src/melt/index.ts (file name): effect "melt"',
    ])
  })

  it('leaves neutral text alone', () => {
    expect(findBanned('a.ts', 'const waveform = 1; // a heading, a page, a collection')).toEqual([])
  })
})

describe('repo guard: no daglier design in the house starter', () => {
  it('finds no daglier token, font, colour, copy or effect name anywhere in the repo', () => {
    const hits: string[] = []
    for (const file of repoFiles()) {
      const relative = path.relative(root, file)
      if (relative === SELF) continue
      hits.push(...findBanned(relative, fs.readFileSync(file, 'utf8')))
    }
    expect(hits).toEqual([])
  })
})
