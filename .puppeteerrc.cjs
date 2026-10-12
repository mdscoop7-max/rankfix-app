const { join } = require("path");

// Production runs on Vercel and renders with @sparticuz/chromium (see
// lib/headless-render.ts). The full `puppeteer` package is a dev dependency for
// local development only, so its ~170 MB Chrome download is skipped on Vercel
// builds. Locally it is kept inside the project folder.
/** @type {import("puppeteer").Configuration} */
module.exports = {
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
  skipDownload: Boolean(process.env.VERCEL || process.env.CI),
};
