import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import { moonpayHosting, renderCustomerIp } from '../backend/moonpayHosting.mjs'
import { createMoonpayServer } from '../backend/moonpayServer.mjs'


test('MoonPay hosting keeps local listeners private and hosted listeners restricted to the sandbox', () => {

    assert.deepEqual(moonpayHosting({}), { hosted: false, host: '127.0.0.1', port: 8788 })
    assert.throws(() => moonpayHosting({ MOONPAY_HOST: '0.0.0.0' }), /loopback/)
    const env = { MOONPAY_DEPLOYMENT_MODE: 'private-test', RENDER: 'true',
        MOONPAY_ENVIRONMENT: 'sandbox', MOONPAY_WALLET_NETWORK: 'testnet', PORT: '10000' }
    assert.deepEqual(moonpayHosting(env), { hosted: true, host: '0.0.0.0', port: 10000 })
    for (const changed of [{ RENDER: '' }, { MOONPAY_ENVIRONMENT: 'production' }, { MOONPAY_WALLET_NETWORK: 'mainnet' }, { PORT: '0' }]) {
        assert.throws(() => moonpayHosting({ ...env, ...changed }))
    }
})


test('hosted signing binds to the ingress client IP and rejects missing or malformed ingress metadata', async t => {

    const key = 'pk_test_hosting', secret = 'server-fixture-secret', token = 'test-access-'.repeat(4)
    const request = headers => ({ headers })
    const headers = { 'x-forwarded-proto': 'https', 'cf-connecting-ip': '::ffff:203.0.113.42',
        'x-forwarded-for': '198.51.100.7', 'true-client-ip': '198.51.100.8' }
    assert.equal(renderCustomerIp(request(headers)), '203.0.113.42')
    for (const changed of [{ 'x-forwarded-proto': 'http' }, { 'cf-connecting-ip': undefined },
        { 'cf-connecting-ip': '127.0.0.1' }, { 'cf-connecting-ip': '203.0.113.42, 198.51.100.7' }]) {
        assert.throws(() => renderCustomerIp(request({ ...headers, ...changed })))
    }
    const metadata = { isSuspended: false, supportsTestMode: true, testnetAddressRegex: 'tb1[a-z0-9]+', minBuyAmount: null, maxBuyAmount: null }
    const server = createMoonpayServer({ apiKey: key, apiSecret: secret, accessToken: token,
        environment: 'sandbox', walletNetwork: 'testnet', getCustomerIp: renderCustomerIp,
        catalog: async () => ({ assets: [{ code: 'btc', networkCode: 'bitcoin', decimals: 8, metadata }],
            euro: { decimals: 2, metadata: { minBuyAmount: 20, maxBuyAmount: 10000 } } }) })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => { server.closeAllConnections(); server.close() })
    const endpoint = 'http://127.0.0.1:' + server.address().port
    assert.deepEqual(await (await fetch(endpoint + '/ready')).json(), { ready: true })
    assert.equal((await fetch(endpoint + '/health')).status, 401)
    const url = new URL('https://buy-sandbox.moonpay.com/')
    for (const [name, value] of Object.entries({ apiKey: key, currencyCode: 'btc', baseCurrencyCode: 'eur',
        baseCurrencyAmount: '20.00', walletAddress: 'tb1qexample', lockAmount: 'true', showOnlyCurrencies: 'btc', showWalletAddressForm: 'false' })) url.searchParams.set(name, value)
    const send = ingress => fetch(endpoint + '/sign', { method: 'POST',
        headers: { ...ingress, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.href }) })
    const signed = await send(headers)
    assert.equal(signed.status, 200)
    const checkout = new URL((await signed.json()).url)
    assert.equal(checkout.searchParams.get('allowedIpAddress'), createHmac('sha256', secret).update('203.0.113.42').digest('base64'))
    assert.equal((await send({})).status, 400)
})
