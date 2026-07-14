/**
 * Renders icon.svg to icon.png at 144x144.
 * Requires: npm install sharp (dev dependency, run once)
 */
const fs = require('fs');
const path = require('path');

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('Run: npm install sharp');
    process.exit(1);
  }

  const assets = path.join(__dirname, '..', 'assets');
  const svgPath = path.join(assets, 'icon.svg');
  const pngPath = path.join(assets, 'icon.png');

  await sharp(svgPath)
    .resize(144, 144)
    .png()
    .toFile(pngPath);

  const { width, height } = await sharp(pngPath).metadata();
  console.log(`Wrote ${pngPath} (${width}x${height})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
