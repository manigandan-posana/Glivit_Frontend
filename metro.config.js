const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('fbx')) {
  config.resolver.assetExts.push('fbx');
}

module.exports = config;
