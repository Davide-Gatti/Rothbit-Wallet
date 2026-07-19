import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '0.1.0-beta.14'
const EXPECTED_BYTES = 154_048_736
const ASSET = 'utexo__rgb-lightning-node-bare-android-arm64.bare'
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destination = path.join(
  projectRoot,
  'node_modules',
  '@utexo',
  'rgb-lightning-node-bare',
  'prebuilds',
  'android-arm64',
  'utexo__rgb-lightning-node-bare.bare'
)
const partial = `${destination}.partial`
const releaseUrl = new URL(
  `https://github.com/UTEXO-Protocol/rgb-lightning-node-bare/releases/download/v${VERSION}/${ASSET}`
)

async function sizeOf(file) {
  try {
    return (await stat(file)).size
  } catch (error) {
    if (error?.code === 'ENOENT') return 0
    throw error
  }
}

function request(url, offset, redirects = 0) {
  if (redirects > 8) {
    return Promise.reject(new Error('Troppi redirect durante il download dell addon Bare'))
  }

  return new Promise((resolve, reject) => {
    const headers = offset > 0 ? { Range: `bytes=${offset}-` } : undefined
    const req = https.get(url, { headers }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        resolve(request(new URL(response.headers.location, url), offset, redirects + 1))
        return
      }

      if (response.statusCode !== 200 && response.statusCode !== 206) {
        response.resume()
        reject(new Error(`Download addon Bare fallito: HTTP ${response.statusCode}`))
        return
      }

      const append = response.statusCode === 206 && offset > 0
      const output = createWriteStream(partial, { flags: append ? 'a' : 'w' })
      response.pipe(output)
      output.on('finish', () => output.close(resolve))
      output.on('error', reject)
      response.on('error', reject)
    })
    req.setTimeout(30_000, () => req.destroy(new Error('Timeout download addon Bare')))
    req.on('error', reject)
  })
}

await mkdir(path.dirname(destination), { recursive: true })

if (await sizeOf(destination) === EXPECTED_BYTES) {
  console.log(`[Bare Android] ${ASSET} già installato`)
  process.exit(0)
}

let offset = await sizeOf(partial)
if (offset === EXPECTED_BYTES) {
  await rename(partial, destination)
  console.log(`[Bare Android] addon installato (${offset} byte)`)
  process.exit(0)
}

if (offset > EXPECTED_BYTES) {
  await unlink(partial)
  offset = 0
}

console.log(`[Bare Android] download ${ASSET} da byte ${offset}`)
await request(releaseUrl, offset)

const downloadedBytes = await sizeOf(partial)
if (downloadedBytes !== EXPECTED_BYTES) {
  throw new Error(
    `Addon Bare incompleto: ${downloadedBytes} byte, attesi ${EXPECTED_BYTES}. Rilancia il comando per riprendere.`
  )
}

await rename(partial, destination)
console.log(`[Bare Android] addon installato (${downloadedBytes} byte)`)
