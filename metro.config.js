// Ship the on-device ML runtime and model as plain assets (see lib/ml/embedder.js)
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
for (const ext of ['wasm', 'onnx']) {
  if (!config.resolver.assetExts.includes(ext)) config.resolver.assetExts.push(ext);
}
config.resolver.sourceExts = config.resolver.sourceExts.filter((ext) => ext !== 'wasm');

module.exports = config;
