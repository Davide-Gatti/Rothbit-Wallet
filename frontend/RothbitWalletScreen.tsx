import React, { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  AppState,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput
} from 'react-native'

import { useRothbitWallet } from '../runtime/useRothbitWallet.js'



const WALLET_ID = 'rothbit'
const INVOICE_EXPIRY_SECONDS = 3600



function errorMessage(error: unknown): string {

  return error instanceof Error ? error.message : String(error)
}



function formatResult(value: unknown): string {

  if (value === undefined) {
    return 'Operazione completata.'
  }

  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(
    value,
    (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item,
    2
  )
}



function positiveInteger(value: string, field: string): number {

  const parsed = Number(value)

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${field}: inserire un intero positivo`)
  }

  return parsed
}



function positiveBigInt(value: string, field: string): bigint {

  const normalized = value.trim()

  if (!/^\d+$/.test(normalized) || BigInt(normalized) <= 0n) {
    throw new Error(`${field}: inserire un intero positivo`)
  }

  return BigInt(normalized)
}



/** Pannello tecnico minimale per invocare le operazioni del wallet. */
export function RothbitWalletScreen(): React.JSX.Element {

  const {
    createNewWallet,
    restoreWalletFromSeed,
    unlockWallet,
    lockWallet,
    unlockNode,
    showAddress,
    showBitcoinBalance,
    showBalance,
    createRgbReceiveInvoice,
    rgbTx
  } = useRothbitWallet()

  const [mnemonic, setMnemonic] = useState('')
  const [rpcUsername, setRpcUsername] = useState('')
  const [rpcPassword, setRpcPassword] = useState('')
  const [rpcHost, setRpcHost] = useState('')
  const [rpcPort, setRpcPort] = useState('')
  const [indexerUrl, setIndexerUrl] = useState('')
  const [proxyEndpoint, setProxyEndpoint] = useState('')
  const [assetId, setAssetId] = useState('')
  const [assetAmount, setAssetAmount] = useState('')
  const [invoice, setInvoice] = useState('')
  const [paymentAmountMsat, setPaymentAmountMsat] = useState('')
  const [output, setOutput] = useState('')

  useEffect(() => {

    const subscription = AppState.addEventListener('change', nextState => {

      if (nextState !== 'active') {
        setMnemonic('')
        setRpcPassword('')
        setInvoice('')
        setOutput('')
      }
    })

    return () => subscription.remove()

  }, [])

  const runOperation = useCallback(async (
    operation: () => unknown | Promise<unknown>
  ): Promise<void> => {

    setOutput('')

    try {
      setOutput(formatResult(await operation()))
    } catch (error) {
      setOutput(`Errore: ${errorMessage(error)}`)
    }

  }, [])

  return (
    <ScrollView
      contentContainerStyle={styles.panel}
      keyboardShouldPersistTaps="handled"
    >
      <Button
        title="Crea wallet"
        onPress={() => {
          void runOperation(() => createNewWallet(WALLET_ID))
        }}
      />

      <TextInput
        accessibilityLabel="Mnemonica da importare"
        placeholder="Mnemonica da importare"
        value={mnemonic}
        onChangeText={setMnemonic}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, styles.multilineInput]}
      />
      <Button
        title="Importa wallet"
        onPress={() => {
          void runOperation(async () => {
            const restoredWalletId = await restoreWalletFromSeed(mnemonic, WALLET_ID)
            setMnemonic('')
            return restoredWalletId
          })
        }}
      />

      <Button
        title="Sblocca wallet"
        onPress={() => {
          void runOperation(() => unlockWallet(WALLET_ID))
        }}
      />
      <Button
        title="Blocca wallet"
        onPress={() => {
          void runOperation(() => {
            lockWallet()
            return 'Wallet bloccato.'
          })
        }}
      />

      <TextInput
        accessibilityLabel="Utente RPC Bitcoin"
        placeholder="Utente RPC Bitcoin"
        value={rpcUsername}
        onChangeText={setRpcUsername}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="Password RPC Bitcoin"
        placeholder="Password RPC Bitcoin"
        value={rpcPassword}
        onChangeText={setRpcPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="Host RPC Bitcoin"
        placeholder="Host RPC Bitcoin"
        value={rpcHost}
        onChangeText={setRpcHost}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="Porta RPC Bitcoin"
        placeholder="Porta RPC Bitcoin"
        value={rpcPort}
        onChangeText={setRpcPort}
        keyboardType="number-pad"
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="URL indexer"
        placeholder="URL indexer"
        value={indexerUrl}
        onChangeText={setIndexerUrl}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="Endpoint proxy RGB"
        placeholder="Endpoint proxy RGB"
        value={proxyEndpoint}
        onChangeText={setProxyEndpoint}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <Button
        title="Collega nodo"
        onPress={() => {
          void runOperation(() => unlockNode({
            bitcoind_rpc_username: rpcUsername.trim(),
            bitcoind_rpc_password: rpcPassword,
            bitcoind_rpc_host: rpcHost.trim(),
            bitcoind_rpc_port: positiveInteger(rpcPort, 'Porta RPC'),
            indexer_url: indexerUrl.trim(),
            proxy_endpoint: proxyEndpoint.trim(),
            announce_alias: 'rothbit-wallet'
          }))
        }}
      />

      <Button
        title="Mostra indirizzo Bitcoin"
        onPress={() => {
          void runOperation(() => showAddress())
        }}
      />
      <Button
        title="Mostra saldo Bitcoin"
        onPress={() => {
          void runOperation(() => showBitcoinBalance())
        }}
      />

      <TextInput
        accessibilityLabel="Asset ID RGB"
        placeholder="Asset ID RGB"
        value={assetId}
        onChangeText={setAssetId}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <Button
        title="Mostra saldo RGB"
        onPress={() => {
          void runOperation(() => showBalance(assetId))
        }}
      />

      <TextInput
        accessibilityLabel="Quantità asset RGB"
        placeholder="Quantità asset RGB"
        value={assetAmount}
        onChangeText={setAssetAmount}
        keyboardType="number-pad"
        style={styles.input}
      />
      <Button
        title="Crea invoice RGB"
        onPress={() => {
          void runOperation(async () => {
            const createdInvoice = await createRgbReceiveInvoice(
              assetId,
              positiveInteger(assetAmount, 'Quantità asset'),
              INVOICE_EXPIRY_SECONDS
            )
            setInvoice(createdInvoice)
            return createdInvoice
          })
        }}
      />

      <TextInput
        accessibilityLabel="Invoice BOLT11 da pagare"
        placeholder="Invoice BOLT11 da pagare"
        value={invoice}
        onChangeText={setInvoice}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, styles.multilineInput]}
      />
      <TextInput
        accessibilityLabel="Millisatoshi da inviare"
        placeholder="Millisatoshi da inviare"
        value={paymentAmountMsat}
        onChangeText={setPaymentAmountMsat}
        keyboardType="number-pad"
        style={styles.input}
      />
      <Button
        title="Invia pagamento RGB"
        color="#b00020"
        onPress={() => {
          Alert.alert(
            'Conferma pagamento',
            `Inviare ${paymentAmountMsat} msat dell'asset ${assetId}?`,
            [
              { text: 'Annulla', style: 'cancel' },
              {
                text: 'Invia',
                style: 'destructive',
                onPress: () => {
                  void runOperation(() => rgbTx(
                    invoice,
                    positiveBigInt(paymentAmountMsat, 'Millisatoshi'),
                    assetId
                  ))
                }
              }
            ]
          )
        }}
      />

      <Text selectable style={styles.output}>{output}</Text>
    </ScrollView>
  )
}



const styles = StyleSheet.create({
  panel: {
    gap: 10,
    padding: 16,
    paddingBottom: 48
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#777777',
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top'
  },
  output: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#777777',
    padding: 10
  }
})
