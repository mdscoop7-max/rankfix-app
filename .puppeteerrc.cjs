const { join } = require("path");

// Keep the downloaded Chrome inside the project directory. Hosts such as Render
// build in one environment and run in another: the default ~/.cache/puppeteer is
// not carried over, which made every render fail with "Could not find Chrome".
// `npm install` (puppeteer's postinstall) downloads Chrome into this folder.
/** @type {import("puppeteer").Configuration} */
module.exports = {
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
  skipDownload: Boolean(process.env.VERCEL || process.env.CI),
};
