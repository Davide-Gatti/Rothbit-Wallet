/** @type {import('@tetherto/wdk-worklet-bundler').WdkBundleConfig} */
module.exports = {
  transport: 'hrpc',
  networks: {
    'rgb-lightning': {
      package: '@utexo/wdk-rgb-lightning'
    }
  },
  options: {
    // Rothbit is Android-only. Keeping the host list scoped prevents the
    // binding installer/bundler from pulling unused Apple and desktop builds.
    targets: ['android-arm64'],
    linkAddons: false,
    platforms: ['android']
  }
}
