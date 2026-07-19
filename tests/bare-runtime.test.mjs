import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const root = new URL('../', import.meta.url)
const packagePath = new URL('package.json', root)
const appConfigPath = new URL('app.json', root)
const providerPath = new URL('runtime/RothbitWdkProvider.tsx', root)
const addonPath = new URL(
  'node_modules/@utexo/rgb-lightning-node-bare/prebuilds/android-arm64/utexo__rgb-lightning-node-bare.bare',
  root
)
const bundlePath = new URL('.wdk-bundle/wdk-worklet.bundle.js', root)
const linkedAddonPath = new URL(
  'node_modules/react-native-bare-kit/android/src/main/addons/arm64-v8a/libutexo__rgb-lightning-node-bare.0.1.0-beta.14.so',
  root
)

test('WDK bundles only the RGB Lightning network for Android arm64', () => {
  const config = require('../wdk.config.cjs')
  assert.equal(config.transport, 'hrpc')
  assert.equal(config.networks['rgb-lightning'].package, '@utexo/wdk-rgb-lightning')
  assert.deepEqual(config.options.targets, ['android-arm64'])
  assert.deepEqual(config.options.platforms, ['android'])
})

test('runtime dependencies are pinned to one compatible beta release', async () => {
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.equal(packageJson.dependencies['@tetherto/wdk'], '1.0.0-beta.14')
  assert.equal(packageJson.dependencies['@tetherto/wdk-react-native-core'], '1.0.0-beta.14')
  assert.equal(packageJson.dependencies['@utexo/wdk-rgb-lightning'], '0.1.0-beta.14')
  assert.equal(packageJson.dependencies['@utexo/rgb-lightning-node-bare'], '0.1.0-beta.14')
  assert.equal(packageJson.dependencies['@utexo/rgb-lightning-node-nodejs'], undefined)
})

test('official Android arm64 addon is installed and linked by the worklet', async () => {
  const addon = await stat(addonPath)
  const linkedAddon = await stat(linkedAddonPath)
  const bundle = await stat(bundlePath)
  const bundleSource = await readFile(bundlePath, 'utf8')
  assert.equal(addon.size, 154_048_736)
  // bare-link adds its Android loader metadata to the original ELF.
  assert.ok(linkedAddon.size >= addon.size)
  assert.ok(linkedAddon.size - addon.size < 1_000_000)
  assert.ok(bundle.size > 2_000_000)
  assert.match(
    bundleSource,
    /linked:libutexo__rgb-lightning-node-bare\.0\.1\.0-beta\.14\.so/
  )
})

test('React Native host uses WdkAppProvider and an HRPC account proxy', async () => {
  const provider = await readFile(providerPath, 'utf8')
  assert.match(provider, /<WdkAppProvider/)
  assert.match(provider, /useAccount<WalletAccountRgbLightning>/)
  assert.match(provider, /bundle=\{\{ bundle \}\}/)
  assert.doesNotMatch(provider, /new WalletManagerRgbLightning/)
})

test('Android grants network access to the Bare node', async () => {
  const { expo } = JSON.parse(await readFile(appConfigPath, 'utf8'))
  assert.deepEqual(expo.android.permissions, ['android.permission.INTERNET'])
})
