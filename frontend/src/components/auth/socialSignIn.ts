/** Shared social sign-in provider ids and display order for cloud auth UI. */

export type SocialProvider = "google" | "apple";

export const SOCIAL_SIGN_IN_PROVIDERS: readonly SocialProvider[] = ["google", "apple"];

export const SOCIAL_SIGN_IN_LABEL_KEYS: Record<SocialProvider, string> = {
  google: "cloudAuth.continueWithGoogle",
  apple: "cloudAuth.continueWithApple",
};

export const SOCIAL_SIGN_IN_BROWSER_HINT_KEYS: Record<SocialProvider, string> = {
  google: "cloudAuth.socialBrowserHintGoogle",
  apple: "cloudAuth.socialBrowserHintApple",
};

/** Fixed icon slot — keeps brand glyphs visually aligned in buttons. */
export const SOCIAL_SIGN_IN_ICON_BOX_CLASS =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center";

export const GOOGLE_SIGN_IN_ICON_PATH = "brands/google-sign-in.png";
export const APPLE_SIGN_IN_ICON_PATH = "brands/apple-sign-in.png";

/** Public brand asset URL (respects Vite ``base`` for packaged Electron). */
export function socialSignInBrandAssetUrl(relativeUnderPublic: string): string {
  const path = relativeUnderPublic.replace(/^\//, "");
  return `${import.meta.env.BASE_URL}${path}`;
}

export const SOCIAL_SIGN_IN_BUTTON_CLASS =
  "w-full inline-flex items-center justify-center gap-2.5 min-h-[2.75rem] px-4 py-2.5 rounded-xl text-sm font-medium border border-border text-text-primary hover:border-accent-line disabled:opacity-40";
