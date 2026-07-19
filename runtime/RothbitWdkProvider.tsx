import React, { useMemo } from 'react'
import * as RNFS from 'react-native-fs'
import {
  WdkAppProvider,
  useAccount,
  type WdkConfigs
} from '@tetherto/wdk-react-native-core'
import type { WalletAccountRgbLightning } from '@utexo/wdk-rgb-lightning'

import { bundle } from '../.wdk/index.js'

export type RgbLightningNetwork = 'mainnet' | 'testnet' | 'regtest' | 'signet'

export type RothbitWdkProviderProps = {
  children: React.ReactNode
  network: RgbLightningNetwork
}

type RgbLightningConfig = Record<string, unknown> & {
  network: RgbLightningNetwork
  dataDir: string
}

const RGB_LIGHTNING_DATA_DIR = `${RNFS.DocumentDirectoryPath.replace(/\/+$/, '')}/rgb-lightning`

/**
 * Punto di collegamento tra l'interfaccia React Native e il wallet WDK.
 *
 * Questo componente non implementa direttamente il wallet e non istanzia il
 * modulo UTEXO nel thread JavaScript della UI. Prepara invece la configurazione
 * Android (`network` e `dataDir`) e la passa a `WdkAppProvider`, che esegue il
 * bundle generato dentro un worklet BareKit isolato.
 *
 * Flusso di esecuzione:
 *
 *   Interfaccia React Native
 *       -> RothbitWdkProvider
 *       -> WdkAppProvider
 *       -> trasporto HRPC
 *       -> worklet BareKit isolato
 *       -> @utexo/wdk-rgb-lightning
 *       -> nodo RGB/Lightning, dataDir privato e backend di rete configurati
 *
 * `RGB_LIGHTNING_DATA_DIR` si trova sotto `RNFS.DocumentDirectoryPath`, cioè
 * nello storage interno privato dell'app. Questo file non configura endpoint
 * di backup e non contatta autonomamente server esterni: i collegamenti a
 * Bitcoin, indexer, proxy RGB o servizi Lightning avvengono soltanto tramite
 * il modulo wallet quando vengono configurati e utilizzati dal chiamante.
 *
 * Creazione, importazione, lock, unlock, persistenza del seed e ciclo di vita
 * sono delegati alle API ufficiali `WdkAppProvider` e `useWalletManager`. Le
 * schermate Rothbit dovrebbero usare `useRothbitWallet()` come API applicativa
 * unica; `useRgbLightningAccount()` resta il boundary WDK di basso livello.
 * `clearSensitiveDataOnBackground` resta sempre attivo per richiedere a WDK di
 * ripulire la sessione sensibile quando l'app lascia il foreground. Le
 * operazioni richieste tramite `useRgbLightningAccount()` vengono serializzate
 * su HRPC ed eseguite nel worklet, non direttamente dal thread della UI.
 *
 * La sola presenza di questo file non avvia il wallet. Per renderlo operativo,
 * un componente radice dell'app deve montare `RothbitWdkProvider` attorno alla
 * UI che utilizza gli hook WDK.
 */
export function RothbitWdkProvider({ children, network }: RothbitWdkProviderProps): React.JSX.Element {

  const wdkConfigs = useMemo<WdkConfigs<RgbLightningConfig>>(() => ({

    networks: {
      'rgb-lightning': {
        blockchain: 'rgb-lightning',
        config: {
          network,
          dataDir: RGB_LIGHTNING_DATA_DIR
        }
      }
    }

  }), [network])


  return (

    <WdkAppProvider
      bundle={{ bundle }}
      wdkConfigs={wdkConfigs}
      clearSensitiveDataOnBackground
    >
      {children}
    </WdkAppProvider>
  )
}





/**
 * Restituisce l'account WDK standard. Per i metodi specifici RGB Lightning,
 * usare `useRgbLightningAccount().extension()`.
 */
export function useRgbLightningAccount(accountIndex = 0) {

  return useAccount<WalletAccountRgbLightning>({
    network: 'rgb-lightning',
    accountIndex
  })
  
}
