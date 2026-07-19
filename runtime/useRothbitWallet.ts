import { useCallback, useMemo } from 'react'
import {
    useWalletManager,
    type WalletInfo
} from '@tetherto/wdk-react-native-core'
import type { WalletAccountRgbLightning } from '@utexo/wdk-rgb-lightning'

import { useRgbLightningAccount } from './RothbitWdkProvider.js'



// Configurazione necessaria per collegare il nodo ai backend Bitcoin e RGB
export type RgbLightningUnlockConfig = {
    bitcoind_rpc_username: string
    bitcoind_rpc_password: string
    bitcoind_rpc_host: string
    bitcoind_rpc_port: number
    indexer_url: string
    proxy_endpoint: string
    announce_addresses?: string[]
    announce_alias?: string
}



// Converte un bigint solamente quando può essere rappresentato senza perdita
function toSafeNumber(value: bigint, field: string): number {

    // Rifiuta valori negativi o superiori al limite sicuro JavaScript
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`${field}: valore fuori dall'intervallo numerico sicuro`)
    }

    // Restituisce il valore nel formato richiesto dal binding UTEXO
    return Number(value)
}



// Normalizza una stringa obbligatoria e impedisce valori vuoti
function requireNonEmpty(value: string, field: string): string {

  // Rimuove gli spazi non significativi agli estremi
  const normalized = value.trim()

  // Interrompe l'operazione quando il valore non contiene dati
  if (normalized.length === 0) {
    throw new Error(`${field}: valore obbligatorio`)
  }

  // Restituisce la stringa pronta per il modulo wallet
  return normalized
}








/**
 * API applicativa Rothbit costruita esclusivamente sopra gli hook ufficiali
 * WDK React Native.
 *
 * Il wallet viene aperto in due fasi distinte:
 *
 *   1. `unlockWallet()` carica il seed cifrato e inizializza il worklet WDK.
 *   2. `unlockNode()` collega il nodo RGB Lightning a bitcoind, indexer e proxy.
 *
 * Seed, storage e lifecycle restano responsabilità di `useWalletManager()`.
 * Questo hook non crea un secondo WalletManager e non accede direttamente a
 * Keychain. I metodi RGB Lightning passano attraverso `extension()` e HRPC.
 * 
 */
export function useRothbitWallet(accountIndex = 0) {


  // Ottiene le operazioni ufficiali per creazione, importazione e lifecycle
  const walletManager = useWalletManager()

  // Ottiene l'account standard collegato al worklet WDK
  const account = useRgbLightningAccount(accountIndex)

  // Costruisce il proxy tipizzato per i metodi specifici RGB Lightning
  const rgbLightning = useMemo<WalletAccountRgbLightning>(

    () => account.extension(),
    [account.extension]
  )


  //-------------------------------------------------------------------------------


  // Impedisce di associare seed differenti allo stesso dataDir RGB Lightning
  const requireSingleWallet = useCallback((walletId: string): void => {

    // Cerca un wallet già salvato con un identificatore differente
    const differentWallet = walletManager.wallets.find(

      (wallet: WalletInfo) => wallet.exists && wallet.identifier !== walletId
    )

    // Blocca la creazione per proteggere l'identità persistita nel dataDir
    if (differentWallet) {

      throw new Error(
        `Rothbit supporta un solo wallet RGB Lightning per dataDir; ` +
        `esiste già il wallet "${differentWallet.identifier}"`
      )
    }

  }, [walletManager.wallets])


  //-------------------------------------------------------------------------------


  // Genera un nuovo wallet di 24 parole usando solamente le API WDK
  const createNewWallet = useCallback(async (

    walletId: string

  ): Promise<string> => {

    // Valida l'identificatore scelto per il wallet
    const normalizedWalletId = requireNonEmpty(walletId, 'walletId')

    // Verifica che il dataDir non appartenga a un altro seed
    requireSingleWallet(normalizedWalletId)

    // Genera una nuova mnemonica BIP-39 di 24 parole nel worklet
    const mnemonic = await walletManager.generateMnemonic(24)

    // Salva il wallet attraverso lo storage sicuro ufficiale WDK
    await walletManager.restoreWallet(mnemonic, normalizedWalletId)

    // Restituisce le parole affinché la UI possa mostrarle e confermarle
    return mnemonic

  }, [requireSingleWallet, walletManager])


  //-------------------------------------------------------------------------------


  // Importa una mnemonica esistente nello storage ufficiale WDK
  const restoreWalletFromSeed = useCallback(async (

    mnemonic: string,
    walletId: string

  ): Promise<string> => {

    // Valida l'identificatore scelto per il wallet
    const normalizedWalletId = requireNonEmpty(walletId, 'walletId')

    // Verifica che il dataDir non appartenga a un altro seed
    requireSingleWallet(normalizedWalletId)

    // Valida la presenza della mnemonica e delega l'importazione a WDK
    return walletManager.restoreWallet(

      requireNonEmpty(mnemonic, 'mnemonic'),
      normalizedWalletId
    )

  }, [requireSingleWallet, walletManager])


  //-------------------------------------------------------------------------------


  // Apre il seed cifrato e inizializza la sessione WDK
  const unlockWallet = useCallback(async (walletId?: string): Promise<void> => {

    // Delega autenticazione e inizializzazione al lifecycle ufficiale
    await walletManager.unlock(walletId)

  }, [walletManager])


  //-------------------------------------------------------------------------------


  // Collega il nodo RGB Lightning ai backend necessari al funzionamento
  const unlockNode = useCallback(async (

    config: RgbLightningUnlockConfig

  ): Promise<{ ok: true }> => {

    // Controlla che la porta RPC Bitcoin sia valida
    if (

      !Number.isInteger(config.bitcoind_rpc_port) ||
      config.bitcoind_rpc_port < 1 ||
      config.bitcoind_rpc_port > 65535

    ) {

      throw new Error('unlockNode: bitcoind_rpc_port non valido')
    }

    // Invia la configurazione al nodo attraverso il proxy HRPC
    return rgbLightning.unlock({

      bitcoind_rpc_username: config.bitcoind_rpc_username,
      bitcoind_rpc_password: config.bitcoind_rpc_password,
      bitcoind_rpc_host: config.bitcoind_rpc_host,
      bitcoind_rpc_port: config.bitcoind_rpc_port,
      indexer_url: config.indexer_url,
      proxy_endpoint: config.proxy_endpoint,
      announce_addresses: config.announce_addresses ?? [],
      announce_alias: config.announce_alias ?? 'rothbit-wallet'
    })

  }, [rgbLightning])


  //-------------------------------------------------------------------------------


  // Recupera l'address Bitcoin corrente del nodo
  const showAddress = useCallback(async (): Promise<string> => {

    // Richiede l'address direttamente al modulo UTEXO
    return rgbLightning.getAddress()

  }, [rgbLightning])


  //-------------------------------------------------------------------------------


  // Recupera il saldo Bitcoin on-chain del nodo
  const showBitcoinBalance = useCallback(async (): Promise<string> => {

    // Richiede il saldo direttamente al modulo UTEXO
    return rgbLightning.getBalance()

  }, [rgbLightning])


  //-------------------------------------------------------------------------------


  // Recupera il saldo relativo a uno specifico asset RGB
  const showBalance = useCallback(async (assetId: string): Promise<object> => {

    // Valida l'asset e inoltra la richiesta al nodo
    return rgbLightning.getAssetBalance(requireNonEmpty(assetId, 'assetId'))

  }, [rgbLightning])


  //-------------------------------------------------------------------------------


  // Crea una BOLT11 invoice per ricevere un asset RGB su Lightning
  const createRgbReceiveInvoice = useCallback(async (

    assetId: string,
    assetAmount: number,
    expirySec = 3600,
    amountMsat?: bigint

  ): Promise<string> => {

    // Verifica che la quantità RGB sia un intero positivo sicuro
    if (!Number.isSafeInteger(assetAmount) || assetAmount <= 0) {
      throw new Error('createRgbReceiveInvoice: assetAmount deve essere un intero positivo sicuro')
    }

    // Verifica che la scadenza sia un intero positivo sicuro
    if (!Number.isSafeInteger(expirySec) || expirySec <= 0) {
      throw new Error('createRgbReceiveInvoice: expirySec deve essere un intero positivo sicuro')
    }

    // Richiede al nodo la creazione della invoice RGB Lightning
    const response = await rgbLightning.createLightningInvoice({

      expirySec,
      assetId: requireNonEmpty(assetId, 'assetId'),
      assetAmount,
      amountMsat: amountMsat === undefined
        ? undefined
        : toSafeNumber(amountMsat, 'amountMsat')

    }) as { invoice?: string; bolt11?: string }

    // Supporta entrambi i nomi restituiti dalle versioni del modulo
    const invoice = response.invoice ?? response.bolt11

    // Interrompe il flusso se il modulo non restituisce una invoice
    if (invoice === undefined) {
      throw new Error('createRgbReceiveInvoice: il modulo non ha restituito una BOLT11 invoice')
    }

    // Restituisce la BOLT11 pronta per essere mostrata o condivisa
    return invoice

  }, [rgbLightning])


  //-------------------------------------------------------------------------------


  // Invia un pagamento RGB attraverso una BOLT11 invoice Lightning
  const rgbTx = useCallback(async (

    invoiceValue: string,
    amountMsat: bigint,
    assetId: string

  ): Promise<object> => {

    // Normalizza e valida la presenza della invoice
    const invoice = requireNonEmpty(invoiceValue, 'invoice')

    // Accetta solamente invoice appartenenti alle reti Lightning supportate
    if (!/^ln(bc|tb|bcrt|sb)/i.test(invoice)) {
      throw new Error('rgbTx richiede una BOLT11 invoice Lightning, non una RGB invoice on-chain')
    }

    // Inoltra il pagamento al nodo attraverso il proxy HRPC
    return rgbLightning.sendPayment({

      invoice,
      amt_msat: toSafeNumber(amountMsat, 'amountMsat'),
      asset_id: requireNonEmpty(assetId, 'assetId')
    })

  }, [rgbLightning])


  //-------------------------------------------------------------------------------


  // Espone stato WDK, account grezzo e operazioni applicative alla UI
  return {
    activeWalletId: walletManager.activeWalletId,
    walletStatus: walletManager.status,
    wallets: walletManager.wallets,
    account,
    rgbLightning,
    createNewWallet,
    restoreWalletFromSeed,
    unlockWallet,
    lockWallet: walletManager.lock,
    unlockNode,
    showAddress,
    showBitcoinBalance,
    showBalance,
    createRgbReceiveInvoice,
    rgbTx
  }

}
