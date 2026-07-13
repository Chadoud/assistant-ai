import { useI18n } from "../../i18n/I18nContext";
import {
  EXTERNAL_SOURCE_CARD_PRIMARY_ACTION_CLASS,
  EXTERNAL_SOURCE_CARD_SECONDARY_ACTION_CLASS,
} from "./ExternalSourceCard";
import { connectionStatusLabel } from "./externalSourceConnectionPill";

interface ExternalSourceConnectionButtonProps {
  connected: boolean;
  loading?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  /** When not connected, run setup (e.g. open token modal) instead of OAuth connect. */
  onNotConnectedClick?: () => void;
}

/**
 * Single card action — label is always Connected or Not connected; click toggles the link.
 */
export default function ExternalSourceConnectionButton({
  connected,
  loading = false,
  busy = false,
  disabled = false,
  onConnect,
  onDisconnect,
  onNotConnectedClick,
}: ExternalSourceConnectionButtonProps) {
  const { t } = useI18n();
  const isConnected = !loading && connected;
  const label = connectionStatusLabel(connected, loading, t);

  const handleClick = () => {
    if (isConnected) {
      onDisconnect();
      return;
    }
    if (onNotConnectedClick) {
      onNotConnectedClick();
      return;
    }
    onConnect();
  };

  return (
    <button
      type="button"
      disabled={disabled || busy || loading}
      onClick={handleClick}
      className={
        isConnected
          ? EXTERNAL_SOURCE_CARD_SECONDARY_ACTION_CLASS
          : EXTERNAL_SOURCE_CARD_PRIMARY_ACTION_CLASS
      }
    >
      {label}
    </button>
  );
}
