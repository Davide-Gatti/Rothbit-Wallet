import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const appConfigPath = new URL('app.json', root)
const entrypointPath = new URL('index.js', root)
const babelConfigPath = new URL('babel.config.cjs', root)
const metroConfigPath = new URL('metro.config.cjs', root)
const gitignorePath = new URL('.gitignore', root)
const directCorePath = new URL('core.ts', root)
const packagePath = new URL('package.json', root)
const providerPath = new URL('runtime/RothbitWdkProvider.tsx', root)
const walletHookPath = new URL('runtime/useRothbitWallet.ts', root)
const securityPath = new URL('SECURITY.md', root)

test('Expo app config pins the isolated Android development identity and security policy', async () => {
  const { expo } = JSON.parse(await readFile(appConfigPath, 'utf8'))

  assert.deepEqual(expo.platforms, ['android'])
  // Expo SDK 57 only supports the New Architecture and rejects this legacy flag.
  assert.equal(expo.newArchEnabled, undefined)
  assert.equal(expo.android.package, 'com.rothbit.wallet.dev')
  assert.equal(expo.android.allowBackup, false)
  assert.deepEqual(expo.android.permissions, ['android.permission.INTERNET'])
  assert.deepEqual(expo.updates, {
    enabled: false,
    checkAutomatically: 'NEVER'
  })
  assert.equal(expo.runtimeVersion, undefined)
})

test('Expo CNG builds only arm64 with the WDK minimum Android SDK', async () => {
  const { expo } = JSON.parse(await readFile(appConfigPath, 'utf8'))
  const buildProperties = expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-build-properties')

  assert.ok(buildProperties)
  assert.equal(buildProperties[1].android.minSdkVersion, 29)
  assert.deepEqual(buildProperties[1].android.buildArchs, ['arm64-v8a'])
  assert.ok(expo.plugins.includes('expo-dev-client'))

  const gitignore = await readFile(gitignorePath, 'utf8')
  assert.match(gitignore, /^android\/$/m)
})

test('Expo uses a standard development-client entrypoint without Router', async () => {
  const entrypoint = await readFile(entrypointPath, 'utf8')
  const babelConfig = await readFile(babelConfigPath, 'utf8')
  const metroConfig = await readFile(metroConfigPath, 'utf8')

  assert.match(entrypoint, /registerRootComponent\(RothbitApp\)/)
  assert.match(entrypoint, /from 'expo'/)
  assert.doesNotMatch(entrypoint, /expo-router/)
  assert.match(babelConfig, /babel-preset-expo/)
  assert.match(metroConfig, /expo\/metro-config/)
})

test('the direct wallet-manager implementation was removed', async () => {
  await assert.rejects(access(directCorePath), { code: 'ENOENT' })

  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.equal(packageJson.dependencies.bip39, undefined)
  assert.equal(packageJson.dependencies['react-native-keychain'], undefined)
})

test('Expo SDK 57 native modules are direct and overridden across WDK dependencies', async () => {
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))

  assert.match(packageJson.dependencies.expo, /^~57\./)
  assert.match(packageJson.dependencies['expo-dev-client'], /^~57\./)
  assert.match(packageJson.dependencies['expo-build-properties'], /^~57\./)
  assert.match(packageJson.dependencies['expo-crypto'], /^~57\./)
  assert.match(packageJson.dependencies['expo-local-authentication'], /^~57\./)
  const coreOverrides = packageJson.overrides['@tetherto/wdk-react-native-core']
  const storageOverrides = coreOverrides['@tetherto/wdk-react-native-secure-storage']
  assert.equal(coreOverrides['expo-crypto'], '$expo-crypto')
  assert.equal(storageOverrides['expo-crypto'], '$expo-crypto')
  assert.equal(storageOverrides['expo-local-authentication'], '$expo-local-authentication')
  assert.equal(packageJson.dependencies['expo-updates'], undefined)
  assert.deepEqual(
    packageJson.expo.doctor.reactNativeDirectoryCheck.exclude,
    ['react-native-fs']
  )
})

test('Rothbit uses the official WDK React Native provider as its only boundary', async () => {
  const provider = await readFile(providerPath, 'utf8')

  assert.match(provider, /import \{[\s\S]*WdkAppProvider,[\s\S]*useAccount/)
  assert.match(provider, /<WdkAppProvider/)
  assert.match(provider, /bundle=\{\{ bundle \}\}/)
  assert.match(provider, /wdkConfigs=\{wdkConfigs\}/)
  assert.match(provider, /clearSensitiveDataOnBackground/)
  assert.match(provider, /useAccount<WalletAccountRgbLightning>/)
  assert.match(provider, /RNFS\.DocumentDirectoryPath/)
  assert.doesNotMatch(provider, /new WalletManagerRgbLightning|initWDK|react-native-keychain/)
})

test('the app boundary does not configure remote wallet-state backup', async () => {
  const provider = await readFile(providerPath, 'utf8')
  const walletHook = await readFile(walletHookPath, 'utf8')

  for (const unsupportedOption of [
    'vssUrl',
    'vssAllowHttp',
    'vssAllowEmptyRestore',
    'vssBackup',
    'backupWalletState'
  ]) {
    assert.doesNotMatch(provider, new RegExp(unsupportedOption, 'i'))
    assert.doesNotMatch(walletHook, new RegExp(unsupportedOption, 'i'))
  }
})

test('the Rothbit wallet hook restores application operations through WDK', async () => {
  const walletHook = await readFile(walletHookPath, 'utf8')

  assert.match(walletHook, /useWalletManager\(\)/)
  assert.match(walletHook, /useRgbLightningAccount\(accountIndex\)/)
  assert.match(walletHook, /account\.extension\(\)/)

  for (const operation of [
    'createNewWallet',
    'restoreWalletFromSeed',
    'unlockWallet',
    'unlockNode',
    'showAddress',
    'showBitcoinBalance',
    'showBalance',
    'createRgbReceiveInvoice',
    'rgbTx'
  ]) {
    assert.match(walletHook, new RegExp(`const ${operation} =`))
  }

  assert.doesNotMatch(walletHook, /new WalletManagerRgbLightning|react-native-keychain/)
})

test('security documentation matches the WDK provider architecture', async () => {
  const security = await readFile(securityPath, 'utf8')

  assert.match(security, /WdkAppProvider`, bundle BareKit e hook ufficiali/)
  assert.match(security, /@tetherto\/wdk-react-native-secure-storage/)
  assert.match(security, /runtime\/useRothbitWallet\.ts/)
  assert.match(security, /non ricostruisce il precedente `dataDir`/i)
  assert.match(security, /requireBiometrics: false/)
  assert.match(security, /fondi reali/)
  assert.doesNotMatch(security, /com\.rothbit\.wallet\.seed|initWDK|disposeWallet/)
})
