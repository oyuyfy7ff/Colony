// Exports every generated texture as a PNG for asset QA (create-game-assets skill).
// Needs `npm run dev -- --port 5173` running. Usage: node tools/export-sprites.cjs out/sprites
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const out = process.argv[2] || 'out/sprites';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/');
  const data = await page.evaluate(async () => {
    const m = await import('/src/art/sprites.js');
    const all = m.allSprites();
    return Object.fromEntries(Object.entries(all).map(([k, cv]) => [k, cv.toDataURL('image/png')]));
  });
  for (const [k, url] of Object.entries(data)) fs.writeFileSync(`${out}/${k}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(Object.keys(data).length, 'sprites ->', out);
  await browser.close();
})();
