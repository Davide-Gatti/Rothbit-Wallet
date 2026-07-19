import React from 'react'

import {
  RothbitWdkProvider,
  type RgbLightningNetwork
} from '../runtime/RothbitWdkProvider.js'
import { RothbitWalletScreen } from './RothbitWalletScreen.js'



export type RothbitAppProps = {
  network?: RgbLightningNetwork
}



/**
 * Componente radice dell'interfaccia Rothbit.
 *
 * Monta una sola istanza del provider ufficiale WDK attorno alla schermata che
 * usa il wallet. La rete predefinita è testnet per evitare che una build di
 * sviluppo utilizzi mainnet accidentalmente; la build di produzione deve
 * passarla esplicitamente.
 */
export function RothbitApp({

  network = 'testnet'

}: RothbitAppProps): React.JSX.Element {

  return (

    <RothbitWdkProvider network={network}>

      <RothbitWalletScreen />

    </RothbitWdkProvider>
  )
}



export default RothbitApp
