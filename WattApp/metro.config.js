const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Windows hits its process file-handle limit when Metro's default worker
// count (one per CPU core) all open cache files concurrently, causing
// EMFILE errors that silently fail the bundle build. Capping workers
// trades a little cold-build speed for reliability on Windows.
config.maxWorkers = 2;

module.exports = config;
