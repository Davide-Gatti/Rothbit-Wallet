import { createRequire } from 'node:module'
import { timingSafeEqual } from 'node:crypto'


const { MAINNET_XAUT, MOONPAY_TEST_TOKEN } = createRequire(import.meta.url)('../modules/rothbit-wdk-moonpay/policy.cjs')


export const MAINNET_USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
export const ENTRYPOINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
const address = value => /^0x[0-9a-fA-F]{40}$/.test(value ?? '') && !/^0x0{40}$/.test(value)
export const METHODS = {
    bundler: new Set(['eth_chainId', 'eth_supportedEntryPoints', 'eth_estimateUserOperationGas',
        'eth_sendUserOperation', 'eth_getUserOperationByHash', 'eth_getUserOperationReceipt', 'pimlico_getUserOperationGasPrice']),
    paymaster: new Set(['pm_getPaymasterStubData', 'pm_getPaymasterData', 'pimlico_getSupportedTokens', 'pimlico_getTokenQuotes'])
}


export function readEthereumEnvironment(env) {

    const chainId = Number(env.ETHEREUM_CHAIN_ID ?? 11155111)
    if (![1, 11155111].includes(chainId)) throw new Error('Ethereum richiede mainnet o Sepolia')
    if (env.ETHEREUM_DEPLOYMENT_MODE === 'private-test' && chainId !== 11155111) {
        throw new Error('Il servizio di prova privato richiede Sepolia')
    }
    if (!env.PIMLICO_API_KEY || !env.ETHEREUM_PROXY_TOKEN || env.ETHEREUM_PROXY_TOKEN.length < 32) throw new Error('Configurare chiave Pimlico e token proxy in .env.ethereum')
    const provider = new URL(env.ETHEREUM_RPC_URL)
    if (provider.protocol !== 'https:' || provider.username || provider.password || provider.search || provider.hash) throw new Error('RPC pubblico Ethereum HTTPS richiesto')
    const usdtAddress = chainId === 1 ? MAINNET_USDT : env.ETHEREUM_TEST_USDT_ADDRESS
    if (!address(usdtAddress) || !address(env.ETHEREUM_PAYMASTER_ADDRESS)) throw new Error('Configurare token e paymaster verificati; Sepolia usa un token di test')
    return { chainId, provider: provider.href, usdtAddress, paymasterAddress: env.ETHEREUM_PAYMASTER_ADDRESS,
        accessToken: env.ETHEREUM_PROXY_TOKEN, apiKey: env.PIMLICO_API_KEY }
}


export function createEthereumProxy(config, { fetcher = fetch, timeoutMs = 15000, maxBytes = 131072 } = {}) {

    const upstream = 'https://api.pimlico.io/v2/' + config.chainId + '/rpc?apikey=' + encodeURIComponent(config.apiKey)
    let id = 0
    const rpc = async (url, method, params) => {
        const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
        if (!response.ok) throw new Error('Servizio Ethereum non disponibile')
        const payload = await response.json()
        if (payload.error || payload.result === undefined) throw new Error('Verifica Ethereum fallita: ' + method)
        return payload.result
    }
    const verify = async () => {
        const chain = await rpc(config.provider, 'eth_chainId', [])
        if (BigInt(chain) !== BigInt(config.chainId)) throw new Error('Rete RPC Ethereum errata')
        const entries = await rpc(upstream, 'eth_supportedEntryPoints', [])
        if (!Array.isArray(entries) || !entries.some(item => item.toLowerCase() === ENTRYPOINT.toLowerCase())) throw new Error('EntryPoint v0.7 non supportato')
        const code = async contract => {
            const result = await rpc(config.provider, 'eth_getCode', [contract, 'latest'])
            if (!/^0x[0-9a-f]+$/i.test(result) || result === '0x0' || /^0x0+$/.test(result)) throw new Error('Contratto Ethereum assente')
        }
        await code(ENTRYPOINT)
        await code(config.paymasterAddress)
        await code(config.usdtAddress)
        const decimals = await rpc(config.provider, 'eth_call', [{ to: config.usdtAddress, data: '0x313ce567' }, 'latest'])
        if (BigInt(decimals) !== 6n) throw new Error('USDT richiede sei decimali')
        const catalog = await rpc(upstream, 'pimlico_getSupportedTokens', [])
        const tokens = Array.isArray(catalog) ? catalog : catalog?.tokens
        if (!Array.isArray(tokens) || !tokens.some(token => (token.address ?? token.token)?.toLowerCase() === config.usdtAddress.toLowerCase() && token.decimals === 6)) throw new Error('Token USDT non supportato dal paymaster')
        const quotes = await rpc(upstream, 'pimlico_getTokenQuotes', [{ tokens: [config.usdtAddress] }, ENTRYPOINT, '0x' + config.chainId.toString(16)])
        if (!Array.isArray(quotes?.quotes) || !quotes.quotes.some(quote => quote.token?.toLowerCase() === config.usdtAddress.toLowerCase() &&
            quote.paymaster?.toLowerCase() === config.paymasterAddress.toLowerCase() && BigInt(quote.exchangeRate) > 0n)) throw new Error('Paymaster configurato incompatibile con token e servizio')
        return { chainId: config.chainId, provider: config.provider, paymasterAddress: config.paymasterAddress,
            usdtAddress: config.usdtAddress, decimals: 6, entryPoint: ENTRYPOINT, verified: true }
    }
    let verification
    let verifiedAt = 0
    const publicConfig = async () => {
        if (!verification || Date.now() - verifiedAt > 30000) {
            verifiedAt = Date.now()
            verification = verify().catch(error => { verification = undefined; throw error })
        }
        return verification
    }
    let active = 0
    let requests = 0
    let windowStart = Date.now()
    return async (request, response) => {
        const send = (status, payload) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(payload)) }
        if (request.method === 'GET' && request.url === '/ready') return send(200, { ready: true })
        const expected = Buffer.from('Bearer ' + config.accessToken)
        const actual = Buffer.from(request.headers.authorization ?? '')
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return send(401, { error: 'Accesso negato' })
        if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); requests = 0 }
        if (++requests > 180 || active >= 16) return send(429, { error: 'Troppe richieste' })
        active++
        response.once('close', () => { active-- })
        try {
            if (request.method === 'GET' && request.url === '/moonpay-token') {
                if (config.chainId !== 11155111 || BigInt(await rpc(config.provider, 'eth_chainId', [])) !== 11155111n) {
                    throw new Error('MoonPayToken richiede Sepolia')
                }
                const code = await rpc(config.provider, 'eth_getCode', [MOONPAY_TEST_TOKEN, 'latest'])
                if (!/^0x[0-9a-f]+$/i.test(code) || /^0x0*$/.test(code)) throw new Error('Contratto MoonPayToken assente')
                const decimals = await rpc(config.provider, 'eth_call', [{ to: MOONPAY_TEST_TOKEN, data: '0x313ce567' }, 'latest'])
                if (BigInt(decimals) !== 18n) throw new Error('Decimali MoonPayToken incompatibili')
                return send(200, { chainId: 11155111, tokenAddress: MOONPAY_TEST_TOKEN, decimals: 18, verified: true })
            }
            if (request.method === 'GET' && request.url === '/xaut') {
                await publicConfig()
                if (config.chainId !== 1) throw new Error('XAUT richiede Ethereum mainnet')
                const code = await rpc(config.provider, 'eth_getCode', [MAINNET_XAUT, 'latest'])
                if (!/^0x[0-9a-f]+$/i.test(code) || /^0x0*$/.test(code)) throw new Error('Contratto XAUT assente')
                const decimals = await rpc(config.provider, 'eth_call', [{ to: MAINNET_XAUT, data: '0x313ce567' }, 'latest'])
                if (BigInt(decimals) !== 6n) throw new Error('Decimali XAUT incompatibili')
                return send(200, { chainId: 1, xautAddress: MAINNET_XAUT, usdtAddress: config.usdtAddress, decimals: 6, verified: true })
            }
            if (request.method === 'GET' && ['/config', '/health'].includes(request.url)) return send(200, await publicConfig())
            const route = request.url === '/pimlico/bundler' ? 'bundler' : request.url === '/pimlico/paymaster' ? 'paymaster' : null
            if (request.method !== 'POST' || !route) return send(404, { error: 'Percorso non disponibile' })
            if (Number(request.headers['content-length']) > maxBytes) return send(413, { error: 'Richiesta troppo grande' })
            let size = 0
            const chunks = []
            for await (const chunk of request) {
                size += chunk.length
                if (size > maxBytes) return send(413, { error: 'Richiesta troppo grande' })
                chunks.push(chunk)
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (!body || Array.isArray(body) || body.jsonrpc !== '2.0' || !METHODS[route].has(body.method) ||
                !Array.isArray(body.params) || !['number', 'string'].includes(typeof body.id)) return send(400, { error: 'Metodo JSON-RPC non consentito' })
            if (['pm_getPaymasterData', 'pm_getPaymasterStubData'].includes(body.method) &&
                (body.params[1]?.toLowerCase() !== ENTRYPOINT.toLowerCase() || typeof body.params[2] !== 'string' || !/^0x[0-9a-f]+$/i.test(body.params[2]) || BigInt(body.params[2]) !== BigInt(config.chainId) ||
                body.params[3]?.token?.toLowerCase() !== config.usdtAddress.toLowerCase() ||
                Object.keys(body.params[3]).some(key => key !== 'token'))) return send(400, { error: 'Rete o token paymaster incompatibile' })
            if (body.method === 'pimlico_getTokenQuotes' && (body.params[0]?.tokens?.length !== 1 ||
                body.params[0].tokens[0]?.toLowerCase() !== config.usdtAddress.toLowerCase() || body.params[1]?.toLowerCase() !== ENTRYPOINT.toLowerCase() ||
                body.params[2] !== '0x' + config.chainId.toString(16))) return send(400, { error: 'Token o rete preventivo incompatibile' })
            if (['eth_sendUserOperation', 'eth_estimateUserOperationGas'].includes(body.method) &&
                body.params[1]?.toLowerCase() !== ENTRYPOINT.toLowerCase()) return send(400, { error: 'EntryPoint incompatibile' })
            if (body.method === 'eth_sendUserOperation' && body.params[0]?.paymaster?.toLowerCase() !== config.paymasterAddress.toLowerCase()) return send(400, { error: 'Paymaster incompatibile' })
            await publicConfig()
            const result = await fetcher(upstream, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
            if (!result.ok) return send(502, { error: 'Pimlico non disponibile' })
            const payload = await result.json()
            if (payload.jsonrpc !== '2.0' || payload.id !== body.id) throw new Error('Risposta RPC non valida')
            // Gli errori upstream possono contenere URL con chiavi: restituisce soltanto un messaggio locale.
            if (payload.error) return send(200, { jsonrpc: '2.0', id: body.id, error: { code: payload.error.code, message: 'Operazione Ethereum rifiutata dal servizio' } })
            return send(200, payload)
        } catch { return send(503, { error: 'Configurazione o servizio Ethereum non disponibile' }) }
    }
}
