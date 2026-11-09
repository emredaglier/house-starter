// Repo guards for the GitHub workflows (CODING_STANDARDS.md, "Repo guards"). They enforce ADR rules
// that cannot be run without GitHub, so they assert the structure of the parsed workflow, never its
// literal text. What the scripts do is tested by running them (ci.test.ts, deploy.test.ts,
// media-backup.test.ts).
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  commandLines,
  loadWorkflow,
  needsOf,
  workflowFiles,
  workflowsDir,
  type Job,
} from './workflows'

const ci = loadWorkflow(path.join(workflowsDir, 'ci.yml'))
const media = loadWorkflow(path.join(workflowsDir, 'media-backup.yml'))
const job = (name: string): Job => {
  const found = ci.jobs[name]
  if (!found) throw new Error(`ci.yml has no job ${name}`)
  return found
}
const ON_TAG = "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')"
const DELIVERY = ['build', 'upload', 'push', 'deploy']
const runs = (name: string) =>
  job(name)
    .steps.map((step) => step.run ?? '')
    .filter(Boolean)

describe('ci.yml: delivery only from a release tag, after every check (ADR-0005)', () => {
  it('runs on pull requests, on main and on release tags, and on nothing else', () => {
    expect(Object.keys(ci.on).sort()).toEqual(['pull_request', 'push'])
    const push = ci.on.push as { branches: string[]; tags: string[] }
    expect(push.branches).toEqual(['main'])
    // A release tag is v<number>...; any pattern for it starts with that.
    expect(push.tags.length).toBeGreaterThan(0)
    for (const pattern of push.tags) expect(pattern).toMatch(/^v\[?0-9/)
  })

  it('builds, uploads, publishes and deploys only on a release tag; check runs everywhere', () => {
    for (const name of DELIVERY) expect(job(name).if, name).toBe(ON_TAG)
    expect(job('check').if).toBeUndefined()
    expect(runs('check').join('\n')).not.toMatch(
      /ci\.sh (build|smoke|publish|upload|push|deploy)\b/,
    )
  })

  it('names the release after the tag, and every delivery step carries it', () => {
    expect(ci.env?.RELEASE).toContain("startsWith(github.ref, 'refs/tags/v')")
    for (const cmd of ['build', 'smoke', 'publish', 'upload', 'push', 'deploy']) {
      const all = Object.values(ci.jobs).flatMap((j) => j.steps.map((s) => s.run ?? ''))
      expect(all, cmd).toContain(`infra/ci.sh ${cmd} "$RELEASE"`)
    }
  })

  it('verifies on `check` that a tag is on main, with the history to tell', () => {
    const steps = job('check').steps
    expect(steps.some((s) => s.run === 'infra/ci.sh verify-release "$RELEASE"')).toBe(true)
    expect(
      steps.some((s) => s.uses?.startsWith('actions/checkout') && s.with?.['fetch-depth'] === 0),
    ).toBe(true)
  })

  it('does not build or publish an image before check has passed', () => {
    expect(needsOf(job('build'))).toContain('check')
    expect(needsOf(job('upload'))).toEqual(expect.arrayContaining(['check', 'build']))
    expect(needsOf(job('push'))).toEqual(expect.arrayContaining(['build', 'upload']))
    expect(needsOf(job('deploy'))).toEqual(expect.arrayContaining(['push', 'upload']))
  })

  it('smoke-tests the built images before it publishes them, on the runner that built them', () => {
    const at = ['build', 'smoke', 'publish'].map((cmd) =>
      runs('build').findIndex((run) => run === `infra/ci.sh ${cmd} "$RELEASE"`),
    )
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    // No image artifact: the images reach later jobs through the registry, by digest.
    const uses = Object.values(ci.jobs).flatMap((j) => j.steps.map((s) => s.uses ?? ''))
    expect(uses.some((u) => u.startsWith('actions/download-artifact'))).toBe(false)
    expect(Object.keys(job('build').outputs ?? {}).sort()).toEqual(['cms', 'migrate', 'web'])
  })

  it('has least-privilege permissions', () => {
    expect(ci.permissions).toEqual({ contents: 'read' })
    for (const name of ['build', 'push'])
      expect(job(name).permissions?.packages, name).toBe('write')
    for (const name of ['upload', 'deploy'])
      expect(job(name).permissions?.packages, name).toBe('read')
    expect(job('check').permissions).toBeUndefined()
  })

  it('never cancels a deploy midway, and runs one at a time', () => {
    expect(job('deploy').concurrency).toEqual({ group: 'deploy', 'cancel-in-progress': false })
  })

  it('gates upload and deploy behind steps that skip while the secrets are unset', () => {
    for (const name of ['upload', 'deploy']) {
      const steps = job(name).steps
      const gate = steps.findIndex((s) => s.run === `infra/ci.sh gate ${name}`)
      expect(gate, name).toBeGreaterThan(-1)
      const after = steps.slice(gate + 1)
      expect(after.length, name).toBeGreaterThan(0)
      for (const step of after)
        expect(step.if, JSON.stringify(step)).toContain('steps.gate.outputs.ready')
    }
  })

  it('only orchestrates: every command is an infra/ci.sh call or tool setup', () => {
    const lines = commandLines(ci)
    expect(lines.length).toBeGreaterThan(0)
    const allowed = [
      /^infra\/ci\.sh /,
      /^pnpm install --frozen-lockfile/,
      /^pnpm exec playwright install(-deps)? /,
      /^corepack enable$/,
    ]
    for (const line of lines)
      expect(
        allowed.some((re) => re.test(line)),
        line,
      ).toBe(true)
  })

  it('installs no browser for check: no unit test starts one', () => {
    expect(runs('check').join('\n')).not.toMatch(/playwright/)
  })
})

describe('media-backup.yml: the backup only copies (ADR-0009)', () => {
  const rcloneVerbs = new Set(
    commandLines(media)
      .map((line) => /^"?(?:\S*\/)?rclone"?\s+(?:-\S+\s+)*([a-z]+)/.exec(line)?.[1])
      .filter((verb): verb is string => verb !== undefined),
  )

  it('runs only rclone commands that cannot delete', () => {
    // `copy` is the only one that writes, and it never removes from the destination.
    expect([...rcloneVerbs].sort()).toEqual(['check', 'copy', 'lsf', 'version'])
    expect(commandLines(media).join('\n')).not.toMatch(/--delete|--remove|--track-renames/i)
  })

  it('runs on a schedule, with read-only repository permissions', () => {
    expect(Object.keys(media.on)).toEqual(expect.arrayContaining(['schedule']))
    expect(media.permissions).toEqual({ contents: 'read' })
  })

  // Ubuntu's rclone (1.60.1) got 501s from R2; and rclone reads every RCLONE_* variable as a flag.
  it('installs a pinned rclone with its checksum, in variables that rclone does not read', () => {
    const install = Object.values(media.jobs)
      .flatMap((j) => j.steps)
      .find((s) => s.name === 'Install rclone')
    expect(install?.env?.PINNED_RCLONE_VERSION).toMatch(/^v\d+\.\d+\.\d+$/)
    expect(install?.env?.PINNED_RCLONE_SHA256).toMatch(/^[0-9a-f]{64}$/)
    for (const j of Object.values(media.jobs))
      for (const step of j.steps)
        for (const name of Object.keys(step.env ?? {}))
          expect(name).not.toMatch(/^RCLONE_(VERSION|SHA256)$/)
  })
})

describe('every workflow', () => {
  it('is actionlint clean (when actionlint is installed)', () => {
    for (const file of workflowFiles()) {
      const r = spawnSync('actionlint', [file], { encoding: 'utf8' })
      if (r.error) return // not installed locally; `infra/ci.sh check` lints the workflows in CI
      expect(r.stdout + r.stderr, file).toBe('')
      expect(r.status, file).toBe(0)
    }
  })
})
