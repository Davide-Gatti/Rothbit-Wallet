// Valori MoonPay in unità maggiori: conversione decimale esatta, senza Number().
function units(value, decimals) {

    const text = String(value)
    if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error('Importo MoonPay non valido')
    const [whole, fraction = ''] = text.split('.')
    if (fraction.length > decimals && /[1-9]/.test(fraction.slice(decimals))) {
        throw new Error('Precisione MoonPay non valida')
    }
    return BigInt(whole + fraction.slice(0, decimals).padEnd(decimals, '0'))
}


// Contratto Ethereum pubblicato su https://tether.to/en/supported-protocols/
// Token di prova collegato dalla guida https://dev.moonpay.com/widget/sandbox-testing
const MOONPAY_TEST_TOKEN = '0x699cfe8997d647d03325ef4bfd039d5bb0984a17'
const MAINNET_XAUT = '0x68749665FF8D2d112Fa859AA293F07A622782F38'


function assetAvailability(assets, asset, environment, direction = 'buy') {

    const candidates = assets.filter(item =>
        asset === 'btc' ? item.code === 'btc' && item.networkCode === 'bitcoin'
            : ['usdt', 'xaut', 'usdc'].includes(asset) && new RegExp('^' + asset + '(?:_|$)').test(item.code) && item.networkCode === 'ethereum')
    const supported = candidates.filter(item => direction !== 'sell' || item.metadata?.isSellSupported === true)
    const active = supported.filter(item => item.metadata?.isSuspended === false)
    const matches = active.filter(item => environment !== 'sandbox' || item.metadata?.supportsTestMode === true)
    if (matches.length === 1) return { asset: matches[0], reason: null }
    const reason = !supported.length ? 'unsupported' : !active.length ? 'suspended'
        : environment === 'sandbox' && !matches.length ? 'sandbox' : 'ambiguous'
    return { asset: null, reason }
}


function sandboxBuyAvailability(assets, environment, walletNetwork, direction = 'buy') {

    if (environment !== 'sandbox' || walletNetwork !== 'testnet' || direction !== 'buy') return null
    const selected = assetAvailability(assets, 'usdc', environment)
    if (selected.asset && (selected.asset.code !== 'usdc' || selected.asset.decimals !== 6 ||
        String(selected.asset.metadata?.metadata?.chainId) !== '1')) return { asset: null, reason: 'ethereum' }
    return selected
}


function selectAsset(assets, asset, environment, direction = 'buy') {

    const selected = assetAvailability(assets, asset, environment, direction).asset
    if (!selected) throw new Error('Asset non disponibile sulla rete richiesta')
    return selected
}


function checkLimits(amount, details, decimals, direction = 'buy') {

    const minimum = direction === 'sell' ? details.minSellAmount : details.minBuyAmount
    const maximum = direction === 'sell' ? details.maxSellAmount : details.maxBuyAmount
    if (minimum != null && amount < units(minimum, decimals)) {
        throw new Error('Importo inferiore al minimo MoonPay')
    }
    if (maximum != null && amount > units(maximum, decimals)) {
        throw new Error('Importo superiore al massimo MoonPay')
    }
}


function checkRecipient(recipient, details, network) {

    const pattern = network === 'testnet' ? details.testnetAddressRegex : details.addressRegex
    if (typeof recipient !== 'string' || recipient.length > 128 || !pattern ||
        !new RegExp('^(?:' + pattern + ')$').test(recipient)) {
        throw new Error('Destinazione incompatibile con la rete MoonPay')
    }
}


module.exports = { MAINNET_XAUT, MOONPAY_TEST_TOKEN, sandboxBuyAvailability, units, selectAsset, assetAvailability, checkLimits, checkRecipient }
