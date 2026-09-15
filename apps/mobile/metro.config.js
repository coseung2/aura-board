const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);

// Expo SDK 57 no longer includes OGG in Metro's default asset extensions.
// Aura Board bundles local game audio, so keep it in the asset graph explicitly.
config.resolver.assetExts.push("ogg");

// Mobile game UI shares the canonical pet catalog with the web app.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
