#!/usr/bin/env node
/**
 * Screenshot a running page once it actually contains what you are looking for.
 *
 *   pnpm screenshot /people?tab=teachers --wait "Showing 1-8 of 11"
 *   pnpm screenshot / --wait "Enrolled Students" --height 420
 *   pnpm screenshot /people --out shots/people.png --height 780
 *
 * Why this exists rather than `chrome --headless --screenshot`: that flag pair
 * captures at the load event, which is before a Convex subscription has
 * delivered anything. The obvious fix, `--virtual-time-budget`, fast-forwards
 * Chrome's timers but NOT real network, so it tears the page down before a live
 * WebSocket can answer - producing a screenshot full of loading skeletons that
 * looks exactly like a broken app. This drives Chrome over the DevTools Protocol
 * and polls the rendered text instead, so a capture means the page really did
 * render, and a timeout really is a problem.
 *
 * Exits non-zero if the text never appears, so it can gate a check.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const HELP = `
Usage: pnpm screenshot <path-or-url> [options]

Options:
  --wait <text>     Text to wait for in the rendered page before capturing.
                    Without it, captures once the document has loaded.
  --out <file>      Where to write the PNG. Default: .screenshots/<name>.png
  --width <px>      Viewport width.  Default: 1512
  --height <px>     Viewport height. Default: 800
  --base <url>      Server to resolve a path against. Default: ${defaultBase()}
  --timeout <ms>    How long to wait for the text. Default: 30000
  --verbose         Log each stage, for when a capture misbehaves.
  --help            Show this.

Set CHROME_PATH if Chrome is somewhere unusual.
`

function defaultBase() {
  return process.env.NUXT_DEV_URL ?? 'http://localhost:3000'
}

function parseArgs(argv) {
  const args = { width: 1512, height: 800, timeout: 30_000, base: defaultBase() }
  const positional = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') return { help: true }
    if (arg.startsWith('--')) {
      if (arg === '--verbose') {
        args.verbose = true
        continue
      }
      const value = argv[++i]
      if (value === undefined) fail(`Missing value for ${arg}`)
      const key = arg.slice(2)
      args[key] = ['width', 'height', 'timeout'].includes(key) ? Number(value) : value
    } else {
      positional.push(arg)
    }
  }

  args.target = positional[0]
  return args
}

class Failure extends Error {}

/** Argument and environment problems: nothing is running yet, so exit directly. */
function fail(message) {
  console.error(`screenshot: ${message}`)
  process.exit(2)
}

/** Problems after Chrome has launched: throw, so the finally block cleans up. */
function abort(message) {
  throw new Failure(message)
}

/** Slack over the caller's own timeout: browser launch plus teardown. */
const LAUNCH_SLACK_MS = 20_000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let verbose = false
let lastStage = 'starting'
const trace = (stage) => {
  lastStage = stage
  if (verbose) console.error(`[screenshot] ${stage}`)
}

/** Never let a single command outlive the run it belongs to. */
const giveUpMs = (ms) => Math.max(1000, ms)

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      // Chrome is an executable file; existsSync via a cheap spawn check is
      // overkill, so rely on the launch failing loudly instead.
      if (candidate) return candidate
    } catch {}
  }
  fail('No Chrome found. Set CHROME_PATH to the browser executable.')
}

/**
 * Chrome is launched with `--remote-debugging-port=0` and writes the port it
 * actually took into DevToolsActivePort. Reading it beats guessing: a hardcoded
 * or random port can collide with a previous run still shutting down, and the
 * connection then hangs against a socket nobody is listening on.
 */
async function debuggingPort(profile, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const [port] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')
      if (port) return Number(port)
    } catch {}
    await sleep(100)
  }
  abort('Chrome never reported a debugging port.')
}

/** A tiny DevTools Protocol client over Node's built-in WebSocket. */
async function connect(profile, timeoutMs) {
  const port = await debuggingPort(profile, timeoutMs)
  const deadline = Date.now() + timeoutMs
  let target

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      target = (await res.json()).find((t) => t.type === 'page')
      if (target?.webSocketDebuggerUrl) break
    } catch {}
    await sleep(200)
  }
  if (!target?.webSocketDebuggerUrl) abort('Chrome did not expose a debugging target.')

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  // Every wait here is bounded. An unbounded one turns a bad launch into a hang.
  await new Promise((resolve, reject) => {
    const giveUp = setTimeout(() => reject(new Error('Timed out connecting to Chrome.')), timeoutMs)
    socket.onopen = () => {
      clearTimeout(giveUp)
      resolve()
    }
    socket.onerror = () => {
      clearTimeout(giveUp)
      reject(new Error('Could not connect to Chrome.'))
    }
  })

  let nextId = 1
  const pending = new Map()
  const consoleErrors = []

  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.id && pending.has(message.id)) {
      const [resolve] = pending.get(message.id)
      pending.delete(message.id)
      resolve(message)
      return
    }
    // Surfacing page errors turns "the screenshot is blank" into a real clue.
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      consoleErrors.push(message.params.entry.text)
    }
    if (message.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(message.params.exceptionDetails.text)
    }
  }

  // If the browser goes away mid-run, everything waiting on it must fail rather
  // than wait forever.
  socket.onclose = () => {
    for (const [, reject] of pending.values()) reject(new Error('Chrome closed the connection.'))
    pending.clear()
  }

  /**
   * Every command is bounded. An unanswered one used to hang the process
   * indefinitely, which looked like the tool freezing rather than the browser
   * failing to reply.
   */
  const send = (method, params = {}, timeoutMs = 10_000) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      const giveUp = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Chrome did not answer ${method} within ${timeoutMs}ms`))
      }, giveUpMs(timeoutMs))
      pending.set(id, [
        (message) => {
          clearTimeout(giveUp)
          resolve(message)
        },
        (error) => {
          clearTimeout(giveUp)
          reject(error)
        },
      ])
      socket.send(JSON.stringify({ id, method, params }))
    })

  return { send, socket, consoleErrors }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  verbose = args.verbose !== undefined
  if (args.help || !args.target) {
    console.log(HELP)
    process.exit(args.help ? 0 : 2)
  }

  // Backstop. Every individual wait is bounded, but browser automation finds new
  // ways to stall; a screenshot tool must never hang a terminal or a CI job.
  const watchdog = setTimeout(() => {
    console.error(`screenshot: gave up after ${args.timeout + LAUNCH_SLACK_MS}ms during "${lastStage}"`)
    console.error('Re-run with --verbose to see how far it gets.')
    process.exit(3)
  }, args.timeout + LAUNCH_SLACK_MS)
  // Deliberately not unref'd: an unref'd timer cannot guarantee anything, and
  // guaranteeing termination is this timer's only job. It is cleared on the way
  // out, so it never delays a healthy run.

  const url = /^https?:\/\//.test(args.target)
    ? args.target
    : new URL(args.target, args.base).toString()

  // Fail fast and clearly when the dev server simply is not running.
  trace('preflight')
  try {
    const probe = await fetch(url)
    // An unread body keeps undici's socket - and the event loop - alive.
    await probe.body?.cancel()
  } catch {
    fail(`Could not reach ${url}. Is the dev server running? (pnpm dev)`)
  }

  const outfile = resolve(
    args.out ?? join('.screenshots', `${slug(args.target)}.png`)
  )
  mkdirSync(dirname(outfile), { recursive: true })

  trace('launching chrome')
  const profile = mkdtempSync(join(tmpdir(), 'easy-academy-shot-'))
  const chrome = spawn(findChrome(), [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    // Chrome's second cold start after a previous instance exits can take ~20s
    // on macOS. These trim the startup work that causes it: no profile sync, no
    // component updates, no background network chatter, no extensions.
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-client-side-phishing-detection',
    '--disable-default-apps',
    '--metrics-recording-only',
    '--mute-audio',
    '--remote-debugging-port=0',
    `--window-size=${args.width},${args.height}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })

  let chromeStderr = ''
  chrome.stderr?.on('data', (chunk) => {
    chromeStderr += chunk
  })

  let client
  try {
  trace('connecting')
    client = await connect(profile, 15_000)
    const { send, consoleErrors } = client

    await send('Page.enable')
    await send('Log.enable')
    await send('Runtime.enable')
  trace('navigating')
    await send('Page.navigate', { url })

    let found = !args.wait
    if (args.wait) {
      const deadline = Date.now() + args.timeout
      while (Date.now() < deadline) {
        await sleep(400)
        // A page mid-navigation can drop a call; that is not fatal, just retry.
        const text = await send('Runtime.evaluate', {
          expression: 'document.body ? document.body.innerText : ""',
          returnByValue: true,
        }).catch(() => null)

        if (String(text?.result?.result?.value ?? '').includes(args.wait)) {
          found = true
          break
        }
      }
    } else {
      await sleep(1000)
    }

    // Let the last paint settle before capturing.
    await sleep(300)
  trace('capturing')
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(outfile, Buffer.from(shot.result.data, 'base64'))

    if (consoleErrors.length > 0) {
      console.error('Page reported errors:')
      for (const error of consoleErrors.slice(0, 10)) console.error(`  ${error}`)
    }

    if (!found) {
      console.error(`Timed out after ${args.timeout}ms waiting for: ${args.wait}`)
      console.error(`Captured anyway: ${outfile}`)
      process.exitCode = 1
      return
    }

    console.log(`Captured ${url} -> ${outfile}`)
  } catch (error) {
    if (!(error instanceof Failure)) throw error
    console.error(`screenshot: ${error.message}`)
    if (chromeStderr.trim()) {
      console.error('Chrome said:')
      for (const line of chromeStderr.trim().split('\n').slice(-8)) console.error(`  ${line}`)
    }
    process.exitCode = 2
  } finally {
    clearTimeout(watchdog)
    client?.socket.close()
    await stop(chrome)
    // Chrome writes to its profile as it shuts down, so removal can lose a race.
    // Cleaning up a temp directory must never fail an otherwise good run.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    } catch {}
  }
}

/** Wait for Chrome to actually exit, escalating if it will not. */
function stop(chrome) {
  if (chrome.exitCode !== null || chrome.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const force = setTimeout(() => {
      chrome.kill('SIGKILL')
      resolve()
    }, 3000)
    chrome.once('exit', () => {
      clearTimeout(force)
      resolve()
    })
    chrome.kill()
  })
}

function slug(target) {
  return target.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'page'
}

await main()

// Chrome's debugging socket can outlive the work; exit on the result rather than
// waiting for every handle to settle.
process.exit(process.exitCode ?? 0)
