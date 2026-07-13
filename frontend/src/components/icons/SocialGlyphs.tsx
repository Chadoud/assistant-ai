import type { ComponentType, ReactNode } from "react";

import {
  APPLE_SIGN_IN_ICON_PATH,
  GOOGLE_SIGN_IN_ICON_PATH,
  SOCIAL_SIGN_IN_ICON_BOX_CLASS,
  socialSignInBrandAssetUrl,
  type SocialProvider,
} from "../auth/socialSignIn";

interface GlyphProps {
  className?: string;
}

/** Fixed-size frame so brand marks share one layout slot in buttons. */
function SocialGlyphBox({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={className ? `${SOCIAL_SIGN_IN_ICON_BOX_CLASS} ${className}` : SOCIAL_SIGN_IN_ICON_BOX_CLASS}>
      {children}
    </span>
  );
}

function RasterBrandGlyph({ src, className }: { src: string; className?: string }) {
  return (
    <SocialGlyphBox className={className}>
      <img
        src={socialSignInBrandAssetUrl(src)}
        alt=""
        width={20}
        height={20}
        decoding="async"
        draggable={false}
        className="size-full object-contain select-none"
      />
    </SocialGlyphBox>
  );
}

function GoogleGlyph({ className }: GlyphProps) {
  return <RasterBrandGlyph src={GOOGLE_SIGN_IN_ICON_PATH} className={className} />;
}

function AppleGlyph({ className }: GlyphProps) {
  return <RasterBrandGlyph src={APPLE_SIGN_IN_ICON_PATH} className={className} />;
}

const SOCIAL_GLYPHS: Record<SocialProvider, ComponentType<GlyphProps>> = {
  google: GoogleGlyph,
  apple: AppleGlyph,
};

/** Provider-aware glyph — assets live in ``public/brands/`` (see socialSignIn.ts). */
export function SocialGlyph({ provider, className }: { provider: SocialProvider; className?: string }) {
  const Glyph = SOCIAL_GLYPHS[provider];
  return <Glyph className={className} />;
}
