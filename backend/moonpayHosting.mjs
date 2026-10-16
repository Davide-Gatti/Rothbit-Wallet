import { canonicalIp } from './moonpayServer.mjs'


export function moonpayHosting(env) {

    const hosted = env.MOONPAY_DEPLOYMENT_MODE === 'private-test'
    if (hosted && (env.RENDER !== 'true' || env.MOONPAY_ENVIRONMENT !== 'sandbox' || env.MOONPAY_WALLET_NETWORK !== 'testnet')) {
        throw new Error('Il servizio MoonPay ospitato richiede Render, sandbox e testnet')
    }
    const host = hosted ? '0.0.0.0' : env.MOONPAY_HOST || '127.0.0.1'
    if (!hosted && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Il server di sviluppo richiede loopback')
    const port = Number(hosted ? env.PORT : env.MOONPAY_PORT || 8788)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta MoonPay non valida')
    return { hosted, host, port }
}


// Solo il listener Render abilita gli header del suo ingresso Cloudflare.
// Nessun ripiego sull'IP del server: il checkout deve corrispondere al cliente.
export function renderCustomerIp(request) {

    if (request.headers['x-forwarded-proto'] !== 'https') throw new Error('Ingresso HTTPS richiesto')
    const ip = canonicalIp(request.headers['cf-connecting-ip'])
    if (ip === '::1' || ip.startsWith('127.')) throw new Error('IP cliente pubblico non disponibile')
    return ip
}
