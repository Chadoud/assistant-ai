import { useCallback, useEffect, useState } from "react";
import { loadConnectedIntegrationIds } from "../utils/assistantIntegrationProviders";
import { EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT } from "../utils/platform";
import { MICROSOFT_INTEGRATION_CHANGED_EVENT } from "../components/externalSources/OneDriveConnectionSection";
import {
  INFOMANIAK_CALENDAR_INTEGRATION_CHANGED_EVENT,
  INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT,
} from "../components/externalSources/infomaniakIntegrationEvents";

const INTEGRATION_REFRESH_EVENTS = [
  EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT,
  MICROSOFT_INTEGRATION_CHANGED_EVENT,
  INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT,
  INFOMANIAK_CALENDAR_INTEGRATION_CHANGED_EVENT,
] as const;

/** Live External Sources connection flags for assistant provider gating. */
export function useConnectedIntegrationIds(): {
  connectedIds: Set<string> | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [connectedIds, setConnectedIds] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setConnectedIds(await loadConnectedIntegrationIds());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onChange = () => {
      void refresh();
    };
    for (const eventName of INTEGRATION_REFRESH_EVENTS) {
      window.addEventListener(eventName, onChange);
    }
    return () => {
      for (const eventName of INTEGRATION_REFRESH_EVENTS) {
        window.removeEventListener(eventName, onChange);
      }
    };
  }, [refresh]);

  return { connectedIds, loading, refresh };
}
