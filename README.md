# Rothbit Ethereum — prova privata Sepolia

Servizio minimo senza dipendenze npm. Avvio: `npm start`.
Configurare le variabili d’ambiente seguendo `.env.example`.
`render.yaml` usa il piano di prova e la modalità `private-test`, riservata a Sepolia.

`GET /ready` controlla solo il processo, senza pubblicare credenziali.
Le altre rotte richiedono il token di accesso; `/health` verifica anche provider,
token e paymaster. La chiave Pimlico resta sul server, le chiavi del wallet sul telefono.

Destinato esclusivamente alla prova privata dell’APK. Il token condiviso non
sostituisce sessioni utente per una distribuzione pubblica o mainnet.
Nessuna credenziale reale è inclusa in questo archivio.
