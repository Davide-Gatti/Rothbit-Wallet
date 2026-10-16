import { createServer } from 'node:http'
import { isIP } from 'node:net'
import { createHmac, timingSafeEqual } from 'node:crypto'
import MoonPayProtocol from '@tetherto/wdk-protocol-fiat-moonpay'
import policy from '../modules/rothbit-wdk-moonpay/policy.cjs'


export function canonicalIp(raw) {

    if (typeof raw !== 'string' || !isIP(raw)) throw new Error('IP cliente non valido')
    if (isIP(raw) === 4) return raw
    const normalized = new URL('http://[' + raw + ']/').hostname.slice(1, -1)
    if (normalized.startsWith('::ffff:')) {
        const parts = normalized.slice(7).split(':').map(part => parseInt(part, 16))
        if (parts.length === 2) return [parts[0] >> 8, parts[0] & 255, parts[1] >> 8, parts[1] & 255].join('.')
    }
    return normalized
}


function loopback(ip) {

    return ip === '::1' || ip.startsWith('127.')
}


export function bindAndSignBuyUrl(url, apiSecret, customerIp) {

    const ip = canonicalIp(customerIp)
    if (loopback(ip)) throw new Error('Usare l’IP pubblico del cliente')
    const hash = createHmac('sha256', apiSecret).update(ip).digest('base64')
    // Aggiunge i parametri senza riordinare o ricodificare la query WDK.
    const bound = url.toString() + '&allowedIpAddress=' + encodeURIComponent(hash)
    const signature = createHmac('sha256', apiSecret).update(new URL(bound).search).digest('base64')
    return bound + '&signature=' + encodeURIComponent(signature)
}


export function validateBuyUrl(raw, { apiKey, environment, walletNetwork }, assets, euro) {

    if (typeof raw !== 'string' || raw.length > 2048) throw new Error('URL non valido')
    const url = new URL(raw)
    const origin = environment === 'sandbox' ? 'https://buy-sandbox.moonpay.com' : 'https://buy.moonpay.com'
    if (url.origin !== origin || url.pathname !== '/' || url.username || url.password || url.hash) {
        throw new Error('Origine MoonPay non consentita')
    }
    const allowed = ['apiKey', 'currencyCode', 'baseCurrencyCode', 'baseCurrencyAmount', 'walletAddress',
        'lockAmount', 'showOnlyCurrencies', 'showWalletAddressForm']
    for (const key of url.searchParams.keys()) {
        if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error('Parametro non consentito')
    }
    const get = key => url.searchParams.get(key)
    if (get('apiKey') !== apiKey || get('baseCurrencyCode') !== 'eur' || get('lockAmount') !== 'true' ||
        get('showWalletAddressForm') !== 'false' || get('showOnlyCurrencies') !== get('currencyCode')) {
        throw new Error('Parametri checkout non validi')
    }
    const code = get('currencyCode')
    const sandbox = code === 'usdc' ? policy.sandboxBuyAvailability(assets, environment, walletNetwork) : null
    const asset = sandbox ? sandbox.asset : policy.selectAsset(assets, code === 'btc' ? 'btc' : /^xaut(?:_|$)/.test(code ?? '') ? 'xaut' : 'usdt', environment)
    if (!asset) throw new Error('Asset non disponibile sulla rete richiesta')
    if (!sandbox && code !== 'btc' && (walletNetwork !== 'mainnet' || asset.decimals !== 6 ||
        asset.metadata?.metadata?.contractAddress?.toLowerCase() !== (/^xaut(?:_|$)/.test(code) ? policy.MAINNET_XAUT.toLowerCase() : '0xdac17f958d2ee523a2206206994597c13d831ec7') ||
        (/^xaut(?:_|$)/.test(code) && String(asset.metadata?.metadata?.chainId) !== '1'))) throw new Error('Il token richiede Ethereum mainnet verificato')
    if (asset.code !== code) throw new Error('Asset o rete non consentiti')
    if (!/^\d{1,10}\.\d{2}$/.test(get('baseCurrencyAmount') ?? '')) throw new Error('Importo non valido')
    const amount = policy.units(get('baseCurrencyAmount'), 2)
    if (amount < 2000n) throw new Error('Importo minimo: 20 EUR')
    policy.checkLimits(amount, euro.metadata, 2)
    policy.checkRecipient(get('walletAddress'), asset.metadata, walletNetwork)
    return url
}


export function validateSellUrl(raw, { apiKey, environment, walletNetwork }, assets, euro) {

    if (typeof raw !== 'string' || raw.length > 2048) throw new Error('URL non valido')
    const url = new URL(raw)
    const origin = environment === 'sandbox' ? 'https://sell-sandbox.moonpay.com' : 'https://sell.moonpay.com'
    if (url.origin !== origin || url.pathname !== '/' || url.username || url.password || url.hash) throw new Error('Origine MoonPay non consentita')
    const allowed = ['apiKey', 'baseCurrencyCode', 'quoteCurrencyCode', 'baseCurrencyAmount',
        'refundWalletAddress', 'lockAmount', 'showWalletAddressForm', 'externalTransactionId', 'mpSdk']
    for (const key of url.searchParams.keys()) {
        if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error('Parametro non consentito')
    }
    const get = key => url.searchParams.get(key)
    if (get('apiKey') !== apiKey || get('quoteCurrencyCode') !== 'eur' || get('lockAmount') !== 'true' ||
        get('showWalletAddressForm') !== 'false' || euro.metadata?.isSellSupported !== true ||
        !/^[a-zA-Z0-9-]{1,128}$/.test(get('externalTransactionId') ?? '') ||
        get('mpSdk') !== JSON.stringify({ version: '1.1.8', environment, flow: 'sell', variant: 'webview', platform: 'rn' })) {
        throw new Error('Parametri checkout non validi')
    }
    const code = get('baseCurrencyCode')
    const asset = policy.selectAsset(assets, code === 'btc' ? 'btc' : /^xaut(?:_|$)/.test(code ?? '') ? 'xaut' : 'usdt', environment, 'sell')
    if (code !== 'btc' && (walletNetwork !== 'mainnet' || asset.decimals !== 6 ||
        asset.metadata?.metadata?.contractAddress?.toLowerCase() !== (/^xaut(?:_|$)/.test(code) ? policy.MAINNET_XAUT.toLowerCase() : '0xdac17f958d2ee523a2206206994597c13d831ec7') ||
        (/^xaut(?:_|$)/.test(code) && String(asset.metadata?.metadata?.chainId) !== '1'))) throw new Error('Il token richiede Ethereum mainnet verificato')
    if (asset.code !== code || !/^\d{1,10}(?:\.\d{1,18})?$/.test(get('baseCurrencyAmount') ?? '')) throw new Error('Importo non valido')
    const amount = policy.units(get('baseCurrencyAmount'), asset.decimals)
    if (amount <= 0n) throw new Error('Importo non valido')
    policy.checkLimits(amount, asset.metadata, asset.decimals, 'sell')
    policy.checkRecipient(get('refundWalletAddress'), asset.metadata, walletNetwork)
    return url
}


export function createMoonpayServer({
    apiKey, apiSecret, accessToken, environment = 'sandbox', walletNetwork = 'testnet',
    fetcher = fetch, timeoutMs = 15000, rateLimit = 30, now = Date.now, catalog,
    localSandbox = false, getCustomerIp
}) {

    if (!['sandbox', 'production'].includes(environment) || !['testnet', 'mainnet'].includes(walletNetwork) ||
        (environment === 'production' && walletNetwork !== 'mainnet')) throw new Error('Ambiente MoonPay non valido')
    if (!new RegExp('^pk_' + (environment === 'sandbox' ? 'test' : 'live') + '_[a-zA-Z0-9]+$').test(apiKey ?? '') ||
        !apiSecret?.trim() || typeof accessToken !== 'string' || accessToken.length < 32) {
        throw new Error('Configurare credenziali MoonPay separate da Ethereum')
    }
    if (localSandbox && environment !== 'sandbox') throw new Error('Il rilevamento IP locale è solo sandbox')
    const expected = Buffer.from('Bearer ' + accessToken)
    let windowStart = now()
    let requests = 0
    // Il catalogo usa il modulo ufficiale per normalizzare le risposte MoonPay.
    const getCatalog = catalog ?? (async () => {
        const response = await fetcher('https://api.moonpay.com/v3/currencies?apiKey=' + encodeURIComponent(apiKey), {
            signal: AbortSignal.timeout(timeoutMs), redirect: 'error', headers: { Accept: 'application/json' }
        })
        if (!response.ok) throw new Error('Catalogo MoonPay non disponibile')
        const data = await response.json()
        if (!Array.isArray(data)) throw new Error('Catalogo MoonPay non valido')
        const protocol = new MoonPayProtocol(undefined, { apiKey, environment })
        protocol._supportedCurrenciesCache = { timestamp: Date.now(), data }
        return {
            assets: await protocol.getSupportedCryptoAssets(),
            euro: (await protocol.getSupportedFiatCurrencies()).find(item => item.code === 'eur' && item.decimals === 2)
        }
    })
    const customerIp = getCustomerIp ?? (async request => {
        const socketIp = canonicalIp(request.socket.remoteAddress)
        if (!loopback(socketIp)) return socketIp
        if (!localSandbox) throw new Error('IP cliente pubblico non disponibile')
        // adb reverse nasconde l'IP: nell'emulatore locale si usa l'uscita della stessa macchina.
        const response = await fetcher('https://api.moonpay.com/v4/ip_address?apiKey=' + encodeURIComponent(apiKey), {
            signal: AbortSignal.timeout(timeoutMs), redirect: 'error', headers: { Accept: 'application/json' }
        })
        if (!response.ok) throw new Error('IP sandbox non disponibile')
        const payload = await response.json()
        return canonicalIp(payload?.ipAddress)
    })
    const server = createServer(async (request, response) => {

        const send = (status, payload) => {
            response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
            response.end(JSON.stringify(payload))
        }
        if (request.method === 'GET' && request.url === '/ready') return send(200, { ready: true })
        const supplied = Buffer.from(request.headers.authorization ?? '')
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(401, { error: 'Accesso negato' })
        if (now() - windowStart >= 60000) { windowStart = now(); requests = 0 }
        if (++requests > rateLimit) return send(429, { error: 'Troppe richieste' })
        if (request.method === 'GET' && request.url === '/health') return send(200, { environment, walletNetwork, apiKey, ipMatching: true })
        if (request.method !== 'POST' || request.url !== '/sign') return send(404, { error: 'Percorso non disponibile' })
        if (!request.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Usare JSON' })
        let body
        try {
            let bytes = 0
            const chunks = []
            for await (const chunk of request) {
                bytes += chunk.length
                if (bytes > 4096) { send(413, { error: 'Richiesta troppo grande' }); return }
                chunks.push(chunk)
            }
            body = JSON.parse(Buffer.concat(chunks).toString())
            if (!body || Object.keys(body).length !== 1 || typeof body.url !== 'string') throw new Error('Richiesta non valida')
        } catch { return send(400, { error: 'Richiesta non valida' }) }
        try {
            const { assets, euro } = await getCatalog()
            if (!euro) throw new Error('Euro non disponibile')
            const selling = new URL(body.url).hostname === (environment === 'sandbox' ? 'sell-sandbox.moonpay.com' : 'sell.moonpay.com')
            const validate = selling ? validateSellUrl : validateBuyUrl
            const url = validate(body.url, { apiKey, environment, walletNetwork }, assets, euro)
            const signed = bindAndSignBuyUrl(url, apiSecret, await customerIp(request))
            send(200, { url: signed })
        } catch { send(400, { error: 'Checkout MoonPay non valido o servizio non disponibile' }) }
    })
    server.requestTimeout = 20000
    server.headersTimeout = 10000
    server.timeout = 20000
    return server
}
