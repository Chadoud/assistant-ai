/**
 * electron-builder `afterSign` hook: notarize the macOS app with Apple.
 *
 * Runs only when ALL of these are present in the environment:
 *   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
 *
 * Without them (local dev, unsigned CI), this is a no-op so the unsigned build
 * keeps working. `@electron/notarize` is required lazily, after the credential
 * check, so the dependency is only needed on real release runners.
 */

exports.default = async function notarize(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  if (!appleId || !appleIdPassword || !teamId) {
    console.log("[notarize] Apple credentials not set — skipping notarization (unsigned build).");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  // Lazy require: only release runners with credentials need this dependency.
  const { notarize } = require("@electron/notarize");

  console.log(`[notarize] Submitting ${appPath} to Apple notary service…`);
  await notarize({
    appBundleId: "com.exo.app",
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
  console.log("[notarize] Notarization complete.");
};
