import { createMoonpayServer } from './moonpayServer.mjs'
import { moonpayHosting, renderCustomerIp } from './moonpayHosting.mjs'


const { hosted, host, port } = moonpayHosting(process.env)
const server = createMoonpayServer({
    apiKey: process.env.MOONPAY_API_KEY,
    apiSecret: process.env.MOONPAY_API_SECRET,
    accessToken: process.env.MOONPAY_ACCESS_TOKEN,
    environment: process.env.MOONPAY_ENVIRONMENT || 'sandbox',
    walletNetwork: process.env.MOONPAY_WALLET_NETWORK || 'testnet',
    localSandbox: !hosted && (process.env.MOONPAY_ENVIRONMENT || 'sandbox') === 'sandbox',
    getCustomerIp: hosted ? renderCustomerIp : undefined
})
server.listen(port, host, () => console.log('Server MoonPay pronto sulla porta ' + port))
