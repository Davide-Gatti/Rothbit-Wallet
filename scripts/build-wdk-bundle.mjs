import { spawnSync } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const generatedDir = path.join(projectRoot, '.wdk')
const bundleDir = path.join(projectRoot, '.wdk-bundle')
const entry = path.join(generatedDir, 'wdk-worklet.generated.js')
const imports = path.join(generatedDir, 'pack.imports.json')
const bundle = path.join(bundleDir, 'wdk-worklet.bundle.js')
const bundlerCli = path.join(
  projectRoot,
  'node_modules',
  '@tetherto',
  'wdk-worklet-bundler',
  'bin',
  'wdk-worklet-bundler.js'
)
const barePackCli = path.join(projectRoot, 'node_modules', 'bare-pack', 'bin.js')

function runNode(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    stdio: 'inherit'
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${path.basename(script)} terminato con codice ${result.status}`)
  }
}

await mkdir(generatedDir, { recursive: true })
await mkdir(bundleDir, { recursive: true })

// beta.6 normally shells out through `npx`, which can fail with EPERM on a
// Windows-mounted WSL workspace. Source generation plus the same bare-pack
// invocation through the current Node executable is deterministic.
runNode(bundlerCli, ['generate', '--source-only'])
await writeFile(imports, '{}\n', 'utf8')
runNode(barePackCli, [
  '--host',
  'android-arm64',
  '--defer',
  '@utexo/rgb-lightning-node-nodejs',
  '--linked',
  '--imports',
  imports,
  '--out',
  bundle,
  entry
])

await writeFile(
  path.join(generatedDir, 'index.js'),
  "const bundle = require('../.wdk-bundle/wdk-worklet.bundle.js')\nmodule.exports = { bundle }\n",
  'utf8'
)
await writeFile(
  path.join(generatedDir, 'index.d.ts'),
  'export const bundle: string\n',
  'utf8'
)

const { size } = await stat(bundle)
if (size < 2_000_000) {
  throw new Error(`Bundle WDK inatteso: ${size} byte`)
}

console.log(`[WDK] bundle Android arm64 generato (${size} byte)`)
