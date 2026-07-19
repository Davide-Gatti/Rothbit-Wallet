import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const appPath = new URL('frontend/App.tsx', root)
const screenPath = new URL('frontend/RothbitWalletScreen.tsx', root)
const tsconfigPath = new URL('tsconfig.json', root)



test('the frontend root mounts the wallet screen inside the WDK provider', async () => {
  const app = await readFile(appPath, 'utf8')

  assert.match(app, /<RothbitWdkProvider network=\{network\}>/)
  assert.match(app, /<RothbitWalletScreen \/>/)
  assert.doesNotMatch(app, /<RothbitWalletScreen\s+network=/)
  assert.match(app, /network = 'testnet'/)
})



test('the wallet screen calls the Rothbit application API', async () => {
  const screen = await readFile(screenPath, 'utf8')

  assert.match(screen, /useRothbitWallet\(\)/)

  for (const call of [
    /createNewWallet\(WALLET_ID\)/,
    /restoreWalletFromSeed\(mnemonic, WALLET_ID\)/,
    /unlockWallet\(WALLET_ID\)/,
    /lockWallet\(\)/,
    /unlockNode\(\{/,
    /showAddress\(\)/,
    /showBitcoinBalance\(\)/,
    /showBalance\(assetId\)/,
    /createRgbReceiveInvoice\(/,
    /rgbTx\(/
  ]) {
    assert.match(screen, call)
  }

  assert.doesNotMatch(
    screen,
    /WalletManagerRgbLightning|useWalletManager|react-native-keychain|AsyncStorage/
  )
})



test('the technical panel exposes exactly ten always-available actions', async () => {
  const screen = await readFile(screenPath, 'utf8')

  const buttons = screen.match(/<Button\b/g) ?? []
  assert.equal(buttons.length, 10)

  for (const title of [
    'Crea wallet',
    'Importa wallet',
    'Sblocca wallet',
    'Blocca wallet',
    'Collega nodo',
    'Mostra indirizzo Bitcoin',
    'Mostra saldo Bitcoin',
    'Mostra saldo RGB',
    'Crea invoice RGB',
    'Invia pagamento RGB'
  ]) {
    assert.match(screen, new RegExp(`title="${title}"`))
  }

  assert.doesNotMatch(screen, /\bdisabled=/)
})



test('the wallet screen remains a minimal technical panel', async () => {
  const screen = await readFile(screenPath, 'utf8')

  assert.match(screen, /import \{[\s\S]*?Button,[\s\S]*?TextInput[\s\S]*?\} from 'react-native'/)
  assert.equal((screen.match(/<Text\b/g) ?? []).length, 1)
  assert.doesNotMatch(
    screen,
    /\bField\b|\bActionButton\b|\bPressable\b|\bActivityIndicator\b|walletStatus|nodeUnlocked|busyOperation|ONLINE|OFFLINE/
  )
  assert.doesNotMatch(screen, /RothbitWalletScreenProps|\{\s*network\s*\}/)
})



test('the panel fixes wallet id and invoice options', async () => {
  const screen = await readFile(screenPath, 'utf8')

  assert.match(screen, /const WALLET_ID = 'rothbit'/)
  assert.match(screen, /const INVOICE_EXPIRY_SECONDS = 3600/)
  assert.match(
    screen,
    /createRgbReceiveInvoice\(\s*assetId,\s*positiveInteger\(assetAmount, 'Quantità asset'\),\s*INVOICE_EXPIRY_SECONDS\s*\)/
  )
  assert.doesNotMatch(screen, /Identificatore wallet|Millisatoshi da ricevere|Scadenza invoice/)
})



test('the frontend keeps RPC credentials in volatile protected fields', async () => {
  const screen = await readFile(screenPath, 'utf8')

  assert.match(screen, /const \[rpcPassword, setRpcPassword\] = useState\(''\)/)
  assert.match(screen, /accessibilityLabel="Password RPC Bitcoin"[\s\S]*?secureTextEntry/)
  assert.match(screen, /setRpcPassword\(''\)/)
  assert.match(screen, /AppState\.addEventListener\('change'/)
  assert.match(screen, /setMnemonic\(''\)/)
  assert.match(screen, /setInvoice\(''\)/)
  assert.match(screen, /setOutput\(''\)/)
  assert.doesNotMatch(screen, /AsyncStorage|SecureStore|MMKV|\.setItem\(/)
})



test('the frontend requires confirmation before sending a payment', async () => {
  const screen = await readFile(screenPath, 'utf8')

  assert.match(screen, /Alert\.alert\(/)
  assert.match(screen, /Conferma pagamento/)
  assert.match(screen, /style: 'destructive'/)
})



test('TypeScript includes the frontend sources', async () => {
  const tsconfig = JSON.parse(await readFile(tsconfigPath, 'utf8'))

  assert.ok(tsconfig.include.includes('frontend/**/*.ts'))
  assert.ok(tsconfig.include.includes('frontend/**/*.tsx'))
})
