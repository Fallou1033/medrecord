const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Permet à Metro de résoudre et d'importer les fichiers WebAssembly (.wasm)
// requis par expo-sqlite en mode Web
config.resolver.assetExts.push('wasm');

module.exports = config;
