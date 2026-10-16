import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { createEthereumProxy, readEthereumEnvironment, ENTRYPOINT } from '../backend/ethereumProxy.mjs'


const config = readEthereumEnvironment({ ETHEREUM_CHAIN_ID: '11155111', ETHEREUM_RPC_URL: 'https://rpc.example',
    ETHEREUM_TEST_USDT_ADDRESS: '0x1111111111111111111111111111111111111111',
    ETHEREUM_PAYMASTER_ADDRESS: '0x2222222222222222222222222222222222222222',
    PIMLICO_API_KEY: 'server-secret', ETHEREUM_PROXY_TOKEN: 't'.repeat(32) })


async function fixture(t, overrides = {}, settings = config) {
    const calls = []
    const fetcher = async (url, options) => {
        const body = JSON.parse(options.body)
        calls.push({ url, body })
        const values = { eth_chainId: settings.chainId === 1 ? '0x1' : '0xaa36a7', eth_supportedEntryPoints: [ENTRYPOINT], eth_getCode: '0x6001',
            eth_call: '0x6', pimlico_getSupportedTokens: [{ token: settings.usdtAddress, decimals: 6 }],
            pimlico_getTokenQuotes: { quotes: [{ token: settings.usdtAddress, paymaster: settings.paymasterAddress, exchangeRate: '0x1' }] },
            pimlico_getUserOperationGasPrice: { fast: { maxFeePerGas: '0x1', maxPriorityFeePerGas: '0x1' } },
            eth_getUserOperationReceipt: null }
        return Response.json({ jsonrpc: '2.0', id: body.id, result: Object.hasOwn(overrides, body.method) ? overrides[body.method] : values[body.method] })
    }
    const server = createServer(createEthereumProxy(settings, { fetcher, maxBytes: 4096 }))
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    t.after(() => { server.closeAllConnections(); server.close() })
    const endpoint = 'http://127.0.0.1:' + server.address().port
    const get = (path = '/config', token = settings.accessToken) => fetch(endpoint + path, { headers: { Authorization: 'Bearer ' + token } })
    const post = (route, body) => fetch(endpoint + route, { method: 'POST', headers: {
        Authorization: 'Bearer ' + settings.accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { calls, get, post }
}


test('proxy authenticates, verifies network/contracts/token and never publishes the Pimlico key', async t => {
    const rpc = await fixture(t)
    assert.equal((await rpc.get('/config', 'wrong')).status, 401)
    assert.equal(rpc.calls.length, 0)
    const response = await rpc.get()
    assert.equal(response.status, 200)
    const text = await response.text()
    assert.doesNotMatch(text, /server-secret|apiKey|accessToken/)
    assert.equal(JSON.parse(text).verified, true)
    const catalog = rpc.calls.find(call => call.body.method === 'pimlico_getSupportedTokens')
    assert.deepEqual(catalog.body.params, [])
    assert.match(catalog.url, /^https:\/\/api.pimlico.io\/v2\/11155111\/rpc\?apikey=/)
})


test('hosting liveness reveals no configuration and leaves Ethereum authentication mandatory', async t => {

    const rpc = await fixture(t)
    const response = await rpc.get('/ready', 'wrong')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ready: true })
    assert.equal(rpc.calls.length, 0)
    assert.equal((await rpc.get('/config', 'wrong')).status, 401)
    assert.equal((await rpc.get('/health', 'wrong')).status, 401)
    assert.equal(rpc.calls.length, 0)
})


test('the hosted private test service cannot enable Ethereum mainnet', () => {

    assert.throws(() => readEthereumEnvironment({ ETHEREUM_CHAIN_ID: '1', ETHEREUM_DEPLOYMENT_MODE: 'private-test' }), /Sepolia/)
})


test('wrong chain, unsupported token, absent code, wrong decimals and paymaster mismatch block readiness', async t => {
    for (const update of [{ eth_chainId: '0x1' }, { pimlico_getSupportedTokens: [] }, { eth_getCode: '0x' },
        { eth_call: '0x12' }, { pimlico_getTokenQuotes: { quotes: [{ token: config.usdtAddress, paymaster: config.usdtAddress, exchangeRate: '1' }] } }]) {
        const rpc = await fixture(t, update)
        assert.equal((await rpc.get()).status, 503)
    }
})


test('bundler/paymaster routes permit only required methods, bounded bodies and pinned network context', async t => {
    const rpc = await fixture(t)
    const request = { jsonrpc: '2.0', id: 100, method: 'pimlico_getUserOperationGasPrice', params: [] }
    assert.equal((await rpc.post('/pimlico/bundler', request)).status, 200)
    assert.equal((await rpc.post('/pimlico/paymaster', request)).status, 400)
    assert.equal((await rpc.post('/pimlico/bundler', { ...request, method: 'eth_sendRawTransaction' })).status, 400)
    assert.equal((await rpc.post('/pimlico/bundler', [request])).status, 400)
    assert.equal((await rpc.post('/pimlico/bundler', { ...request, params: ['x'.repeat(5000)] })).status, 413)
    assert.equal((await rpc.post('/pimlico/paymaster', { ...request, method: 'pm_getPaymasterData', params: [{}, ENTRYPOINT, '0xaa36a7', { sponsorshipPolicyId: 'bad' }] })).status, 400)
    assert.equal((await rpc.post('/pimlico/bundler', { ...request, method: 'eth_sendUserOperation', params: [{ paymaster: config.paymasterAddress }, config.usdtAddress] })).status, 400)
})


test('XAUT verification requires mainnet code and six decimals independently of USDT', async t => {

    const sepolia = await fixture(t)
    assert.equal((await sepolia.get('/xaut')).status, 503)
    const mainnet = { ...config, chainId: 1 }
    const rpc = await fixture(t, {}, mainnet)
    const response = await rpc.get('/xaut')
    assert.equal(response.status, 200)
    const token = await response.json()
    assert.equal(token.verified, true)
    assert.equal(token.chainId, 1)
    assert.equal(token.decimals, 6)
    const broken = await fixture(t, { eth_call: '0x12' }, mainnet)
    assert.equal((await broken.get('/xaut')).status, 503)
})


test('MoonPayToken reads its own Sepolia contract with 18 decimals, independently of the fee token', async t => {

    const rpc = await fixture(t, { eth_call: '0x12' })
    const response = await rpc.get('/moonpay-token')
    assert.equal(response.status, 200)
    const token = await response.json()
    assert.equal(token.tokenAddress, '0x699cfe8997d647d03325ef4bfd039d5bb0984a17')
    assert.equal(token.decimals, 18)
    assert.equal(token.chainId, 11155111)
    assert.equal(token.verified, true)
    assert.equal((await rpc.get('/moonpay-token', 'wrong')).status, 401)
    for (const overrides of [{ eth_chainId: '0x1' }, { eth_getCode: '0x' }, { eth_call: '0x6' }]) {
        const broken = await fixture(t, overrides)
        assert.equal((await broken.get('/moonpay-token')).status, 503)
    }
    const mainnet = await fixture(t, {}, { ...config, chainId: 1 })
    assert.equal((await mainnet.get('/moonpay-token')).status, 503)
})
