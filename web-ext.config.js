/* eslint-env node */

const defaultConfig = {
  sourceDir: "./",
  ignoreFiles: ["web-ext.config.js", "package-lock.js", "package.json"],
  build: {
    overwriteDest: true,
  }
};

module.exports = defaultConfig;