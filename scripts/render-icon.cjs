/**
 * Build dock/app icons from electron/assets/app-icon-source.png
 *
 * macOS: artwork inset in Apple's 1024×1024 safe zone (opaque pixels must not
 * touch the icon edges — otherwise Dock shows an oversized square).
 * Windows: same artwork with a slightly smaller inset for .ico tiles.
 *
 * Outputs:
 *   - electron/assets/icon.png       macOS (.icns / Dock)
 *   - electron/assets/icon-win.png   Windows .ico source
 *   - electron/assets/icon.ico       Windows installer / electron-builder
 *   - electron/assets/logo.png       In-app logo
 *   - frontend/public/logo.png
 *
 * Run: node scripts/render-icon.cjs
 */
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const sourcePng = path.join(root, "electron", "assets", "app-icon-source.png");
const outMac = path.join(root, "electron", "assets", "icon.png");
const outWin = path.join(root, "electron", "assets", "icon-win.png");
const outIco = path.join(root, "electron", "assets", "icon.ico");
const outLogoElectron = path.join(root, "electron", "assets", "logo.png");
const outLogoFrontend = path.join(root, "frontend", "public", "logo.png");

const CANVAS = 1024;
/** Apple 1024×1024 template: keep artwork inside inset so Dock glyph is not oversized. */
const MAC_ART_INSET = 128;
/** Windows tile: slightly tighter inset so the glyph does not touch the .ico edge. */
const WIN_ART_INSET = 88;
/** In-app logo canvas (favicon / title bar / auth screens). */
const LOGO_CANVAS = 512;
const LOGO_ART_INSET = 48;

/** Dock / .ico plate — white squircle background behind the cube. */
const ICON_BG = { r: 255, g: 255, b: 255, alpha: 1 };
/** In-app logos sit on themed UI — keep alpha outside the artwork. */
const LOGO_BG = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * @param {import("sharp")} sharp
 * @param {Buffer} sourceBuf
 * @param {number} artInset px inset from canvas edge
 */
async function renderSquareIcon(sharp, sourceBuf, artInset) {
  const inner = CANVAS - 2 * artInset;

  const artBuf = await sharp(sourceBuf)
    .resize(inner, inner, { fit: "contain", position: "centre", background: ICON_BG })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: ICON_BG,
    },
  })
    .composite([{ input: artBuf, left: artInset, top: artInset }])
    .png()
    .toBuffer();
}

/**
 * Smaller square for in-app / browser favicon use.
 * Uses the source alpha channel — no opaque plate (Dock icons still use ICON_BG).
 *
 * @param {import("sharp")} sharp
 * @param {Buffer} sourceWithAlphaBuf
 */
async function renderLogo(sharp, sourceWithAlphaBuf) {
  const inner = LOGO_CANVAS - 2 * LOGO_ART_INSET;

  const artBuf = await sharp(sourceWithAlphaBuf)
    .resize(inner, inner, { fit: "contain", position: "centre", background: LOGO_BG })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: LOGO_CANVAS,
      height: LOGO_CANVAS,
      channels: 4,
      background: LOGO_BG,
    },
  })
    .composite([{ input: artBuf, left: LOGO_ART_INSET, top: LOGO_ART_INSET }])
    .png()
    .toBuffer();
}

/** Build a multi-size .ico from the Windows PNG master. */
async function renderWindowsIco(sharp, winBuf) {
  const pngToIco = require("png-to-ico");
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = await Promise.all(
    sizes.map((size) => sharp(winBuf).resize(size, size).png().toBuffer()),
  );
  return pngToIco(pngBuffers);
}

async function main() {
  if (!fs.existsSync(sourcePng)) {
    console.error("Missing", sourcePng);
    process.exit(1);
  }
  const sharp = require("sharp");
  const sourceWithAlphaBuf = await sharp(sourcePng).ensureAlpha().png().toBuffer();
  // Flatten transparency onto the dock plate colour so .icns tiles stay opaque.
  const sourceBuf = await sharp(sourceWithAlphaBuf)
    .flatten({ background: ICON_BG })
    .png()
    .toBuffer();

  const [macBuf, winBuf, logoBuf] = await Promise.all([
    renderSquareIcon(sharp, sourceBuf, MAC_ART_INSET),
    renderSquareIcon(sharp, sourceBuf, WIN_ART_INSET),
    renderLogo(sharp, sourceWithAlphaBuf),
  ]);

  const icoBuf = await renderWindowsIco(sharp, winBuf);

  fs.mkdirSync(path.dirname(outLogoFrontend), { recursive: true });
  fs.writeFileSync(outMac, macBuf);
  fs.writeFileSync(outWin, winBuf);
  fs.writeFileSync(outIco, icoBuf);
  fs.writeFileSync(outLogoElectron, logoBuf);
  fs.writeFileSync(outLogoFrontend, logoBuf);

  console.log("Wrote (macOS):     ", outMac);
  console.log("Wrote (Windows):   ", outWin, outIco);
  console.log("Wrote logos:       ", outLogoElectron, outLogoFrontend);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
