# Sicurezza e persistenza del wallet Android

Rothbit usa il percorso React Native raccomandato da WDK:
`WdkAppProvider`, bundle BareKit e hook ufficiali. Non esiste più un secondo
manager wallet inizializzato direttamente dall'app.

## Architettura

```text
Interfaccia React Native
    -> RothbitWdkProvider
    -> WdkAppProvider
    -> HRPC
    -> worklet BareKit isolato
    -> @utexo/wdk-rgb-lightning
    -> nodo RGB/Lightning e dataDir privato
```

`RothbitWdkProvider` configura soltanto la rete RGB Lightning e il `dataDir`.
Creazione, importazione, lock, unlock, storage del seed e lifecycle sono gestiti
da `@tetherto/wdk-react-native-core`.

L'integrazione runtime del wallet si trova in due file:

- `runtime/RothbitWdkProvider.tsx`: configura e ospita WDK;
- `runtime/useRothbitWallet.ts`: espone le operazioni usate dalla UI.

La UI si trova nella cartella `frontend`:

- `frontend/App.tsx`: monta una sola istanza di `RothbitWdkProvider`;
- `frontend/RothbitWalletScreen.tsx`: esegue le singole operazioni del wallet.

L'interfaccia deve usare `useRothbitWallet()`. L'hook delega a
`useWalletManager()` la creazione, l'importazione e il lock/unlock del seed, e
delega a `useRgbLightningAccount().extension()` l'unlock del nodo, gli address,
i saldi, le invoice e i pagamenti RGB Lightning.

Il wallet viene aperto in due fasi:

1. `unlockWallet()` apre lo storage WDK e inizializza il worklet;
2. `unlockNode()` collega il nodo a bitcoind, indexer e proxy RGB.

Le altre operazioni applicative disponibili sono `createNewWallet()`,
`restoreWalletFromSeed()`, `showAddress()`, `showBitcoinBalance()`,
`showBalance()`, `createRgbReceiveInvoice()` e `rgbTx()`. L'hook espone anche
`rgbLightning` per eventuali metodi UTEXO non ancora adattati da Rothbit.

`frontend/App.tsx` monta il provider una sola volta attorno all'interfaccia.
Le chiamate reali partono soltanto quando l'utente preme il relativo pulsante:
prima `unlockWallet()` e poi `unlockNode()`.

La schermata mantiene mnemonica importata, mnemonica appena generata e password
RPC solamente nello stato volatile React. Le rimuove quando l'app lascia il
foreground; inoltre richiede una conferma Android prima di inviare un pagamento.

## Seed e storage sicuro WDK

`WdkAppProvider` crea lo storage ufficiale
`@tetherto/wdk-react-native-secure-storage`. Durante creazione o importazione,
il worklet WDK produce:

- un seed cifrato;
- un'entropia cifrata, usata per ricavare la mnemonica;
- la chiave di cifratura necessaria ad aprire questi dati.

Lo storage WDK salva questi valori localmente tramite `react-native-keychain`,
che su Android usa le protezioni del sistema e Android Keystore. I nomi
`service` usati da Keychain sono identificatori locali delle credenziali, non
server o endpoint Internet.

Nella versione installata `1.0.0-beta.14`, il normale percorso WDK salva e
legge la chiave di cifratura con `requireBiometrics: false`. Di conseguenza
l'app non deve dichiarare che ogni creazione, avvio o unlock mostri
necessariamente una richiesta biometrica. Rimangono la cifratura Keychain e le
protezioni del dispositivo, ma l'effettiva autenticazione deve essere provata
sui dispositivi Android supportati prima di presentarla come garanzia.

Il seed in chiaro esiste temporaneamente nella memoria del worklet quando WDK
deve derivare chiavi o inizializzare il wallet. Non deve essere copiato in log,
analytics, crash report, screenshot o appunti.

La UI deve mostrare e far confermare la mnemonica prima di accettare fondi.
`useWalletManager().restoreWallet(mnemonic, walletId)` è il percorso ufficiale
per l'importazione; non deve essere affiancato da un secondo seed storage.

## Stato RGB Lightning nel dataDir

La directory configurata è:

```text
RNFS.DocumentDirectoryPath/rgb-lightning
```

Si trova nello storage interno privato dell'app Android. Le normali altre app
non possono accedervi e non sono richiesti permessi per lo storage condiviso.

Il modulo `@utexo/wdk-rgb-lightning` gestisce direttamente SQLite, stato LDK e
dati RGB presenti nella directory. Rothbit non modifica, cifra, copia o
ricostruisce manualmente questi file.

Lo stato locale persiste normalmente durante:

- chiusura e riapertura dell'app;
- riavvio del dispositivo;
- aggiornamenti dell'app che conservano i dati applicativi.

Il `dataDir` viene perso in caso di:

- disinstallazione;
- cancellazione dei dati dell'app;
- perdita o guasto irreparabile del dispositivo;
- corruzione dello storage.

Rothbit conserva una sola copia del `dataDir`. Non configura VSS, un server di
salvataggio, sincronizzazione dello stato o un'esportazione locale.

## Mnemonica e recupero

La mnemonica permette a WDK di recuperare seed, chiavi e identità
crittografica. Non ricostruisce il precedente `dataDir`, lo stato aggiornato dei
canali Lightning o lo stato RGB con validazione client-side.

Su una nuova installazione, importare le parole non equivale quindi a
ripristinare completamente il wallet RGB Lightning. L'interfaccia deve
avvertire che perdita del telefono, cancellazione dati o disinstallazione
possono rendere irrecuperabile lo stato e mettere a rischio i fondi anche se la
mnemonica è disponibile.

## Identità della development build

La development build Android usa l'application ID:

```text
com.rothbit.wallet.dev
```

Android assegna a questo pacchetto storage, credenziali Keychain e directory
documenti separati da quelli di qualsiasi futura build di produzione con un
application ID differente. Installare la build `.dev` non rende quindi
disponibile un wallet Rothbit di produzione già presente e non ne migra seed,
`dataDir`, node ID o address.

La build `.dev` include `expo-dev-client` e strumenti di sviluppo. Non deve
contenere fondi reali. Una futura build di produzione richiederà un audit
separato di application ID, firma, persistenza e compatibilità con eventuale
stato già installato.

## CNG, backup Android e trasferimento dati

Il progetto usa Continuous Native Generation: `android/` è output generato e
non è sorgente autorevole. `app.json` imposta:

```json
{
  "android": {
    "package": "com.rothbit.wallet.dev",
    "allowBackup": false
  },
  "updates": {
    "enabled": false
  }
}
```

Expo SDK 57 usa esclusivamente la New Architecture; il vecchio campo
`newArchEnabled` non viene impostato perché non è più accettato dallo schema.
La configurazione generata deve comunque mantenere `newArchEnabled=true` nelle
proprietà native prodotte da Expo.

`npm run android:generate` rigenera il progetto nativo con
`expo prebuild --clean`. Il manifest generato deve continuare a contenere
`android:allowBackup="false"`. Questo disabilita il cloud backup Android
dell'app. Le credenziali cifrate e il `dataDir` non devono essere considerati
un meccanismo di recupero remoto.

Il pacchetto secure-storage di WDK distingue valori device-only da valori
potenzialmente sincronizzabili, ma la policy dell'app disabilita il backup a
livello di manifest. Android segnala comunque che su alcuni dispositivi Android
12 o successivi il produttore può trattare diversamente il trasferimento diretto
tra dispositivi; questo comportamento deve essere verificato sulle build e sui
dispositivi distribuiti.

Il permesso `android.permission.INTERNET` rimane necessario per bitcoind,
indexer, proxy RGB e servizi o peer Lightning. Non viene usato per inviare il
seed o configurare un backup remoto Rothbit.

EAS Update ed Expo OTA non sono configurati: `updates.enabled` è `false` e
`expo-updates` non è una dipendenza diretta. Ogni modifica JavaScript distribuita
agli utenti deve quindi essere inclusa in una nuova build nativa.

## Lifecycle

`clearSensitiveDataOnBackground` è sempre abilitato sul `WdkAppProvider`.
Rothbit delega quindi alla libreria ufficiale la transizione in background e la
successiva reinizializzazione della sessione.

La UI azzera inoltre la propria copia temporanea di mnemonica e password RPC e
considera il nodo nuovamente bloccato quando Android porta l'app in background.

La versione beta installata deve essere verificata sul dispositivo: la sola
presenza dell'opzione non dimostra che ogni buffer nativo sia stato azzerato o
che venga sempre richiesta autenticazione al ritorno in foreground.

## Verifiche richieste prima di fondi reali

Prima della produzione servono test Android con importi controllati che coprano:

1. creazione, visualizzazione e conferma della mnemonica tramite gli hook WDK;
2. importazione, lock, unlock e riavvio dell'app;
3. comportamento con e senza PIN o biometria configurati sul dispositivo;
4. persistenza dopo chiusura forzata, riavvio e aggiornamento;
5. invio e ricezione Bitcoin, Lightning e RGB;
6. apertura, utilizzo e chiusura dei canali;
7. cancellazione dati e disinstallazione;
8. importazione della mnemonica in un'installazione senza il vecchio `dataDir`;
9. conferma che cloud backup e trasferimento dati non includano dati Rothbit;
10. verifica che nessuna build configuri opzioni o endpoint di backup remoto.

Per la development build `.dev` bisogna inoltre verificare su un dispositivo
Android arm64 che un APK aggiornato, installato senza disinstallare quello
precedente, conservi seed cifrato, `dataDir`, node ID e address. La separazione
dal pacchetto di produzione va verificata esplicitamente: la build `.dev` non
deve essere presentata come percorso di recupero di un wallet di produzione.

La suite automatica protegge la configurazione di base, ma non sostituisce i
test end-to-end su Android richiesti per un wallet RGB Lightning con fondi
reali.
