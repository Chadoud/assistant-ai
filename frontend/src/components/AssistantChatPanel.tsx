/**
 * Re-export barrel for the assistant chat panel.
 *
 * The panel is always driven by a SHARED voice session owned by the app shell
 * (`AppMainWorkspace`), so there is intentionally no self-session default export:
 * a component that created its own `useVoiceSession()` here would open a second
 * WebSocket + mic capture competing with the Exo HUD's session.
 */

import { AssistantChatPanelWithSharedVoice } from "../features/assistant/chat/AssistantChatPanelCore";

export { AssistantChatPanelWithSharedVoice };
