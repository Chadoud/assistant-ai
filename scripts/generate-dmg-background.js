/**
 * Build electron/assets/dmg-background.png for the macOS installer window.
 * Matches package.json → build.dmg window size (540×440) and icon positions.
 *
 * No drawn arrow — macOS 15+ / Retina DMG backgrounds double-scale @2x art and
 * mis-size SVG markers. Finder icons + “Drag to Applications” copy are enough.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "electron", "assets");
const WINDOW = { width: 540, height: 440 };

/** Brand indigo — keep in sync with frontend/src/styles/tokens.css */
const INDIGO = "#0f0b2e";
const INDIGO_MUTED = "#1a1548";

/**
 * @param {number} scale 1 or 2
 * @returns {string}
 */
function dmgBackgroundSvg(scale) {
  const w = WINDOW.width * scale;
  const h = WINDOW.height * scale;
  const s = scale;
  const titleSize = 22 * s;
  const subtitleSize = 13 * s;
  const noteSize = 11 * s;

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff" rx="${12 * s}"/>
  <text x="${w / 2}" y="${48 * s}" text-anchor="middle" fill="${INDIGO}"
    font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
    font-size="${titleSize}" font-weight="700">Install Exo</text>
  <text x="${w / 2}" y="${72 * s}" text-anchor="middle" fill="${INDIGO_MUTED}"
    font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
    font-size="${subtitleSize}" font-weight="600">Drag to Applications</text>
  <text x="${w / 2}" y="${392 * s}" text-anchor="middle" fill="${INDIGO_MUTED}"
    font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
    font-size="${noteSize}" font-weight="500">After installing, open Exo from Applications</text>
  <text x="${w / 2}" y="${412 * s}" text-anchor="middle" fill="${INDIGO_MUTED}"
    font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
    font-size="${noteSize}" font-weight="500">— not from this installer window.</text>
</svg>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "dmg-background.png");
  await sharp(Buffer.from(dmgBackgroundSvg(1))).png().toFile(outPath);
  console.log(`[generate-dmg-background] ${outPath} (${WINDOW.width}×${WINDOW.height})`);

  const retinaPath = path.join(OUT_DIR, "dmg-background@2x.png");
  if (fs.existsSync(retinaPath)) {
    fs.unlinkSync(retinaPath);
    console.log("[generate-dmg-background] removed dmg-background@2x.png (Retina double-scale broke arrow art)");
  }
}

main().catch((err) => {
  console.error("[generate-dmg-background] failed:", err);
  process.exit(1);
});
