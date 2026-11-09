import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const script = path.resolve(import.meta.dirname, 'ci.sh')
const file = path.resolve(import.meta.dirname, '../.github/workflows/ci.yml')
const text = fs.readFileSync(file, 'utf8')

function ci(args: string[], env: Record<string, string> = {}) {
  // A clean environment: nothing from the developer's shell may satisfy a secret gate.
  const r = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      // Names come from infra/project.env; the environment wins over the file.
      PROJECT_NAME: 'atlas',
      DOMAIN: 'atlas.studio',
      ...env,
    },
  })
  return { status: r.status, out: r.stdout + r.stderr }
}

const SHA = 'a'.repeat(40)
const TAG = 'v1.2.3'
const upload = { R2_ACCOUNT_ID: 'a', R2_MEDIA_WRITE_KEY_ID: 'k', R2_MEDIA_WRITE_SECRET: 's' }
const deploy = {
  ...upload,
  DEPLOY_HOST: 'h',
  DEPLOY_USER: 'u',
  DEPLOY_SSH_KEY: 'key',
  DEPLOY_HOST_KEY: 'hostkey',
  TS_OAUTH_CLIENT_ID: 'i',
  TS_OAUTH_SECRET: 's',
}

describe('secret gates (the steps that skip until the owner sets the secrets)', () => {
  it('upload skips cleanly, exit 0, while any secret is missing', () => {
    const none = ci(['gate', 'upload'])
    expect(none.status).toBe(0)
    expect(none.out).toContain('ready=false')
    expect(none.out).toContain('R2_ACCOUNT_ID')
    const partial = ci(['gate', 'upload'], { ...upload, R2_MEDIA_WRITE_SECRET: '' })
    expect(partial.out).toContain('ready=false')
    expect(partial.out).toContain('R2_MEDIA_WRITE_SECRET')
  })

  it('upload is ready when all secrets are set', () => {
    expect(ci(['gate', 'upload'], upload).out).toContain('ready=true')
  })

  it('deploy needs the tailnet, SSH and upload secrets together', () => {
    expect(ci(['gate', 'deploy']).out).toContain('ready=false')
    expect(ci(['gate', 'deploy'], upload).out).toContain('ready=false')
    for (const key of Object.keys(deploy)) {
      const missing = ci(['gate', 'deploy'], { ...deploy, [key]: '' })
      expect(missing.status, key).toBe(0)
      expect(missing.out, key).toContain('ready=false')
    }
    expect(ci(['gate', 'deploy'], deploy).out).toContain('ready=true')
  })

  it('writes the result for GitHub Actions', () => {
    const out = path.join(fs.mkdtempSync(path.join(import.meta.dirname, '.gate-')), 'output')
    try {
      ci(['gate', 'upload'], { GITHUB_OUTPUT: out })
      expect(fs.readFileSync(out, 'utf8')).toBe('ready=false\n')
    } finally {
      fs.rmSync(path.dirname(out), { recursive: true, force: true })
    }
  })

  it('rejects an unknown group and an id that is neither a git sha nor a release tag', () => {
    expect(ci(['gate', 'nope']).status).toBe(1)
    expect(ci(['build', 'latest']).status).toBe(1)
    expect(ci(['smoke', 'main']).status).toBe(1)
    expect(ci(['push', 'main']).status).toBe(1)
    expect(ci(['deploy', '../x']).status).toBe(1)
  })

  it('publish, upload, push and deploy take a release tag only, never a commit', () => {
    for (const cmd of ['publish', 'upload', 'push', 'deploy']) {
      const r = ci([cmd, SHA])
      expect(r.status, cmd).toBe(1)
      expect(r.out, cmd).toContain('release tag')
    }
    for (const bad of ['1.2.3', 'v1', 'v1.2', 'v1.2.3+build', 'v1.2.3/../x', 'vlatest']) {
      expect(ci(['deploy', bad]).status, bad).toBe(1)
    }
  })

  it('upload, push and deploy refuse to run without their secrets', () => {
    for (const cmd of ['upload', 'push', 'deploy']) {
      const r = ci([cmd, TAG])
      expect(r.status, cmd).not.toBe(0)
    }
  })

  it('every release command refuses while infra/project.env is still the template placeholder', () => {
    for (const cmd of ['publish', 'upload', 'push', 'deploy', 'verify-release']) {
      const r = ci([cmd, TAG], { DOMAIN: 'example.com', ...deploy })
      expect(r.status, cmd).toBe(1)
      expect(r.out, cmd).toContain('project.env')
    }
  })
})

// `verify-release` needs a git checkout, so it runs against a throwaway copy of the scripts.
describe('verify-release: a release is cut from main only', () => {
  const git = (cwd: string, ...args: string[]) =>
    spawnSync(
      'git',
      [
        '-c',
        'user.email=t@example.test',
        '-c',
        'user.name=t',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd, encoding: 'utf8' },
    )
  function checkout() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-release-'))
    fs.mkdirSync(`${dir}/infra`)
    for (const f of ['ci.sh', 'project.sh', 'project.env']) {
      fs.copyFileSync(path.resolve(import.meta.dirname, f), `${dir}/infra/${f}`)
    }
    git(dir, 'init', '-q', '-b', 'main')
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'one')
    return dir
  }
  const verify = (dir: string) =>
    spawnSync('bash', [`${dir}/infra/ci.sh`, 'verify-release', TAG], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        PROJECT_NAME: 'atlas',
        DOMAIN: 'atlas.studio',
      },
    })

  it('passes for a commit that is in origin/main', () => {
    const dir = checkout()
    try {
      git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
      const r = verify(dir)
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout).toContain(`${TAG} is on main`)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails for a commit that only exists on another branch', () => {
    const dir = checkout()
    try {
      git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
      git(dir, 'checkout', '-q', '-b', 'feature')
      fs.writeFileSync(`${dir}/x`, 'x')
      git(dir, 'add', '.')
      git(dir, 'commit', '-q', '-m', 'two')
      const r = verify(dir)
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('not on main')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when origin/main is not there, instead of passing', () => {
    const dir = checkout()
    try {
      const r = verify(dir)
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('origin/main')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

// A fake `docker` on the PATH: logs every call and answers `push` the way the real one ends its
// output, with a digest per image. No daemon, no registry.
const DIGEST = { web: 'a'.repeat(64), cms: 'b'.repeat(64), migrate: 'c'.repeat(64) }
function fakeDocker() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-docker-'))
  const log = path.join(dir, 'calls')
  fs.writeFileSync(
    path.join(dir, 'docker'),
    `#!/usr/bin/env bash
echo "$*" >>"${log}"
if [ "$1" = push ]; then
  case "$2" in
    */web:*) d=${DIGEST.web} ;; */cms:*) d=${DIGEST.cms} ;; */migrate:*) d=${DIGEST.migrate} ;;
  esac
  echo "The push refers to repository [\${2%:*}]"
  echo "\${2##*:}: digest: sha256:$d size: 1234"
fi
`,
    { mode: 0o755 },
  )
  return {
    env: { PATH: `${dir}:${process.env.PATH ?? ''}` },
    calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []),
    done: () => fs.rmSync(dir, { recursive: true, force: true }),
  }
}

describe('images go between jobs by digest, through the registry', () => {
  const P = 'ghcr.io/o/atlas'
  const registry = { IMAGE_PREFIX: P, GHCR_TOKEN: 't', GITHUB_ACTOR: 'a' }
  const ref = (t: keyof typeof DIGEST) => `${P}/${t}@sha256:${DIGEST[t]}`

  it('publish pushes the release tag only and hands each pushed digest to the later jobs', () => {
    const docker = fakeDocker()
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ci-out-')), 'output')
    try {
      const r = ci(['publish', TAG], { ...registry, ...docker.env, GITHUB_OUTPUT: out })
      expect(r.status, r.out).toBe(0)
      expect(docker.calls().filter((c) => c.startsWith('push '))).toEqual([
        `push ${P}/web:${TAG}`,
        `push ${P}/cms:${TAG}`,
        `push ${P}/migrate:${TAG}`,
      ])
      expect(fs.readFileSync(out, 'utf8')).toBe(
        `web=${ref('web')}\ncms=${ref('cms')}\nmigrate=${ref('migrate')}\n`,
      )
      expect(r.out).toContain(ref('web'))
    } finally {
      docker.done()
      fs.rmSync(path.dirname(out), { recursive: true, force: true })
    }
  })

  const images = { WEB_IMAGE: ref('web'), CMS_IMAGE: ref('cms'), MIGRATE_IMAGE: ref('migrate') }

  it('push moves the latest tags to the published digests, in the registry, without pulling', () => {
    const docker = fakeDocker()
    try {
      const r = ci(['push', TAG], { ...registry, ...images, ...docker.env })
      expect(r.status, r.out).toBe(0)
      const calls = docker.calls().filter((c) => !c.startsWith('login '))
      expect(calls).toEqual([
        `buildx imagetools create --prefer-index=false -t ${P}/web:latest ${ref('web')}`,
        `buildx imagetools create --prefer-index=false -t ${P}/cms:latest ${ref('cms')}`,
        `buildx imagetools create --prefer-index=false -t ${P}/migrate:latest ${ref('migrate')}`,
      ])
    } finally {
      docker.done()
    }
  })

  it('push refuses a missing digest, a tag instead of a digest, or another image', () => {
    const docker = fakeDocker()
    try {
      const bad = [
        { ...images, CMS_IMAGE: '' },
        { ...images, WEB_IMAGE: `${P}/web:${TAG}` },
        { ...images, MIGRATE_IMAGE: ref('web') },
      ]
      for (const env of bad) {
        const r = ci(['push', TAG], { ...registry, ...env, ...docker.env })
        expect(r.status, JSON.stringify(env)).not.toBe(0)
      }
      expect(docker.calls().some((c) => c.includes('imagetools'))).toBe(false)
    } finally {
      docker.done()
    }
  })

  it('upload refuses a web image that is not a published digest, before touching anything', () => {
    const docker = fakeDocker()
    try {
      for (const WEB_IMAGE of ['', `${P}/web:${TAG}`, ref('cms')]) {
        const r = ci(['upload', TAG], { ...registry, ...upload, WEB_IMAGE, ...docker.env })
        expect(r.status, WEB_IMAGE).not.toBe(0)
        expect(r.out, WEB_IMAGE).toContain('WEB_IMAGE')
      }
      expect(docker.calls()).toEqual([])
    } finally {
      docker.done()
    }
  })

  it('publish refuses without registry credentials', () => {
    const docker = fakeDocker()
    try {
      expect(ci(['publish', TAG], { IMAGE_PREFIX: P, ...docker.env }).status).not.toBe(0)
      expect(docker.calls().some((c) => c.startsWith('push '))).toBe(false)
    } finally {
      docker.done()
    }
  })
})

describe('ci workflow', () => {
  const jobs = text.split(/^jobs:\n/m)[1] ?? ''
  const jobBlock = (name: string) =>
    new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  \\w[\\w-]*:\\n|(?![\\s\\S]))`, 'm').exec(
      jobs,
    )?.[1] ?? ''
  const onTag = "if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')"

  it('runs on pull requests, on main and on release tags, except for docs and tickets alone', () => {
    // A change only under docs/ or .scratch/ starts no run on a branch. GitHub does not apply
    // `paths` to a tag push, so a release tag always runs.
    const filter = [
      '    paths:',
      "      - '**'",
      "      - '!docs/**'",
      "      - '!.scratch/**'",
    ].join('\n')
    const on = text.split(/^on:\n/m)[1]?.split(/^\S/m)[0] ?? ''
    expect(on).toBe(
      `  push:\n    branches: [main]\n    tags: ['v[0-9]*']\n${filter}\n  pull_request:\n${filter}\n\n`,
    )
  })

  it('has the jobs in delivery order', () => {
    const order = ['check', 'build', 'upload', 'push', 'deploy']
    const at = order.map((n) => jobs.search(new RegExp(`^  ${n}:`, 'm')))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(jobs).not.toMatch(/^ {2}smoke:/m)
    // `check` runs beside `build` (neither needs the other), to keep the run short...
    expect(jobBlock('check')).not.toMatch(/needs:/)
    expect(jobBlock('build')).not.toMatch(/needs:/)
    // ...and nothing is uploaded, pushed or deployed unless check AND the build's smoke test passed.
    expect(jobBlock('upload')).toMatch(/needs: \[check, build\]/)
    expect(jobBlock('push')).toMatch(/needs: \[build, upload\]/)
    expect(jobBlock('deploy')).toMatch(/needs: \[push, upload\]/)
  })

  it('builds images, publishes, uploads and deploys only from a release tag', () => {
    for (const name of ['build', 'upload', 'push', 'deploy']) {
      expect(jobBlock(name), name).toContain(`    ${onTag}\n`)
    }
    // Pull requests and main run `check` alone: no image, no registry, no CDN, no server.
    expect(jobBlock('check')).not.toMatch(/\n {4}if:/)
    expect(jobBlock('check')).not.toMatch(/ci\.sh (build|smoke|publish|upload|push|deploy) /)
    // The release is the tag, so the images, the CDN folder and the deploy all carry its name.
    expect(text).toContain(
      "RELEASE: ${{ startsWith(github.ref, 'refs/tags/v') && github.ref_name || github.sha }}",
    )
    for (const cmd of ['build', 'smoke', 'publish', 'upload', 'push', 'deploy'])
      expect(text).toContain(`infra/ci.sh ${cmd} "$RELEASE"`)
    // A tag must point into main.
    expect(jobBlock('check')).toContain('infra/ci.sh verify-release "$RELEASE"')
    expect(jobBlock('check')).toContain('fetch-depth: 0')
  })

  // No unit test starts a browser, and the install once cost `check` 12 minutes.
  it('installs a browser only for the smoke test, not for check', () => {
    // Not empty: a renamed job would otherwise pass the next line on its own.
    expect(jobBlock('check')).toContain('infra/ci.sh check')
    expect(jobBlock('check')).not.toMatch(/playwright install|ms-playwright/)
  })

  it('smoke-tests the images on the runner that built them, then publishes them', () => {
    const build = jobBlock('build')
    const at = ['infra/ci.sh build ', 'infra/ci.sh smoke ', 'infra/ci.sh publish '].map((s) =>
      build.indexOf(s),
    )
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    // No image artifact: the images reach later jobs through the registry, by digest.
    expect(text).not.toMatch(/name: images/)
    expect(text).not.toMatch(/download-artifact/)
    expect(text).not.toMatch(/infra\/ci\.sh (save|load) /)
    for (const t of ['web', 'cms', 'migrate'])
      expect(build).toContain(`${t}: \${{ steps.publish.outputs.${t} }}`)
    expect(jobBlock('upload')).toContain('WEB_IMAGE: ${{ needs.build.outputs.web }}')
    for (const t of ['web', 'cms', 'migrate'])
      expect(jobBlock('push')).toContain(
        `${t.toUpperCase()}_IMAGE: \${{ needs.build.outputs.${t} }}`,
      )
  })

  it('has least-privilege permissions', () => {
    expect(text).toMatch(/\npermissions:\n {2}contents: read\n/)
    // build publishes; push moves the latest tags; upload and deploy only pull.
    for (const name of ['build', 'push']) expect(jobBlock(name), name).toMatch(/packages: write/)
    for (const name of ['upload', 'deploy']) {
      expect(jobBlock(name), name).toMatch(/packages: read/)
      expect(jobBlock(name), name).not.toMatch(/packages: write/)
    }
    expect(jobBlock('check')).not.toMatch(/permissions:/)
  })

  it("never adds an error over the failed smoke test's report", () => {
    const steps = jobBlock('build').split(/^ {6}- /m)
    const report = steps.find((s) => s.includes('name: smoke-output')) ?? ''
    expect(report).toMatch(/if: failure\(\)/)
    expect(report).toMatch(/continue-on-error: true/)
  })

  it('never cancels a deploy midway, and runs one at a time', () => {
    expect(jobBlock('deploy')).toMatch(
      /concurrency:\n {6}group: deploy\n {6}cancel-in-progress: false/,
    )
  })

  it('only gates secrets behind steps that skip, never fails on them', () => {
    for (const name of ['upload', 'deploy']) {
      const block = jobBlock(name)
      expect(block, name).toMatch(/run: infra\/ci\.sh gate /)
      // Every step after the gate step is conditional on it.
      const after = block.split(/run: infra\/ci\.sh gate [a-z]+\n/)[1] ?? ''
      const steps = after.split(/^ {6}- /m).slice(1)
      expect(steps.length, name).toBeGreaterThan(0)
      for (const step of steps)
        expect(step, step).toMatch(/if: steps\.gate\.outputs\.ready == 'true'/)
    }
  })

  it('only orchestrates: every run step is an infra/ci.sh call or tool setup', () => {
    const runs = [...text.matchAll(/^ +run: (.*)$/gm)].map((m) => m[1] ?? '')
    const blocks = [...text.matchAll(/^ +run: \|\n((?: {10}.*\n)+)/gm)].flatMap((m) =>
      (m[1] ?? '').split('\n').filter(Boolean),
    )
    const lines = [...runs.filter((r) => r !== '|'), ...blocks].map((l) => l.trim())
    expect(lines.length).toBeGreaterThan(0)
    const allowed = [
      /^infra\/ci\.sh /,
      /^pnpm install --frozen-lockfile/,
      /^pnpm exec playwright install --with-deps /,
      /^pnpm exec playwright install-deps /,
      /^corepack enable$/,
    ]
    for (const line of lines)
      expect(
        allowed.some((re) => re.test(line)),
        line,
      ).toBe(true)
  })

  it('keeps the contract with the other scripts', () => {
    const ci = fs.readFileSync(script, 'utf8')
    // The deploy tag is the release the images were built with, prune after deploy.
    expect(ci).toContain('assets.sh" build-args "$release"')
    expect(ci).toContain('assets.sh" prune --keep "$keep"')
    expect(ci).toContain('./deploy.sh live-releases')
    expect(ci).toContain('release_dir="$dir/releases/$release"')
    expect(ci).toContain('assets.sh" upload "$WEB_IMAGE" "$release"')
    // infra/ is copied, IMAGE_PREFIX set, a non-zero exit stops the script (set -e).
    expect(ci).toContain("cd '$release_dir' && IMAGE_PREFIX='$p' ./deploy.sh deploy '$release'")
    expect(ci).toMatch(/^set -euo pipefail$/m)
    expect(text).toContain('playwright install --with-deps chromium')
    expect(text).toContain('smoke/.output')
    expect(text).toContain('if: failure()')
    expect(text).toContain('infra/ci.sh check')
  })

  it('is actionlint clean (when actionlint is installed)', () => {
    const r = spawnSync('actionlint', [file], { encoding: 'utf8' })
    if (r.error) return // `infra/ci.sh check` lints the workflows in CI
    expect(r.stdout + r.stderr).toBe('')
    expect(r.status).toBe(0)
  })
})
