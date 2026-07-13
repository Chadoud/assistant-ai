import { useI18n } from "../../i18n/I18nContext";
import ModalShell from "../ModalShell";
import MeetingModePanel from "../MeetingModePanel";

interface Props {
  open: boolean;
  onClose: () => void;
  backendOnline: boolean;
  onMeetingEnded: () => void;
  onOpenConversation?: () => void;
  proAllowed?: boolean;
  onUpgrade?: () => void;
}

export default function MeetingModeModal({
  open,
  onClose,
  backendOnline,
  onMeetingEnded,
  onOpenConversation,
  proAllowed,
  onUpgrade,
}: Props) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <ModalShell title={t("tasks.recordMeeting")} onClose={onClose} maxWidthClass="max-w-lg">
      <MeetingModePanel
        backendOnline={backendOnline}
        onMeetingEnded={() => {
          onMeetingEnded();
          onClose();
        }}
        onOpenConversation={onOpenConversation}
        proAllowed={proAllowed}
        onUpgrade={onUpgrade}
        hideProCard
      />
    </ModalShell>
  );
}
