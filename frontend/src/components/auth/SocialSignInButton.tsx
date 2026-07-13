import { Spinner } from "../Spinner";
import { SocialGlyph } from "../icons/SocialGlyphs";
import {
  SOCIAL_SIGN_IN_BUTTON_CLASS,
  SOCIAL_SIGN_IN_ICON_BOX_CLASS,
  SOCIAL_SIGN_IN_LABEL_KEYS,
  type SocialProvider,
} from "./socialSignIn";

interface SocialSignInButtonProps {
  provider: SocialProvider;
  label: string;
  busy: boolean;
  pending: boolean;
  onClick: () => void;
}

/** Outlined social sign-in button with a fixed icon slot and provider-specific glyph. */
export default function SocialSignInButton({
  provider,
  label,
  busy,
  pending,
  onClick,
}: SocialSignInButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={SOCIAL_SIGN_IN_BUTTON_CLASS}
      aria-busy={pending}
    >
      {pending ? (
        <Spinner className={SOCIAL_SIGN_IN_ICON_BOX_CLASS} />
      ) : (
        <SocialGlyph provider={provider} />
      )}
      {label}
    </button>
  );
}

export { SOCIAL_SIGN_IN_LABEL_KEYS };
