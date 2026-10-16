import { createServer } from 'node:http'
import { createEthereumProxy, readEthereumEnvironment } from './ethereumProxy.mjs'


const config = readEthereumEnvironment(process.env)
const port = Number(process.env.ETHEREUM_PROXY_PORT ?? process.env.PORT ?? 8787)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta Ethereum non valida')
const server = createServer(createEthereumProxy(config))
server.requestTimeout = 20000
server.headersTimeout = 10000
server.listen(port, process.env.ETHEREUM_PROXY_HOST ?? (process.env.PORT ? '0.0.0.0' : '127.0.0.1'),
    () => console.log('Proxy Ethereum pronto sulla porta ' + port))
