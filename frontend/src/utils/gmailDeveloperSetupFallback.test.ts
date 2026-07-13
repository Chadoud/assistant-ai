import { describe, expect, it } from "vitest";
import type { GmailStatusResponse } from "../api/gmail";
import { buildDeveloperSetupStepsFallback } from "./gmailDeveloperSetupFallback";

describe("buildDeveloperSetupStepsFallback", () => {
  it("uses server steps when developer_setup_steps is present", () => {
    const custom = [{ id: "client_credentials", status: "pass" as const }];
    const s = {
      connected: false,
      oauth_configured: false,
      developer_setup_steps: custom,
    } as GmailStatusResponse;
    expect(buildDeveloperSetupStepsFallback(s)).toEqual(custom);
  });

  it("builds five steps when developer_setup_steps is missing", () => {
    const s: GmailStatusResponse = {
      connected: false,
      oauth_configured: true,
      oauth_env_id_present: true,
      oauth_env_secret_present: true,
      oauth_json_path_env_present: false,
      oauth_default_json_exists: false,
      backend_dotenv_file_exists: true,
      gmail_oauth_redirect_uri: "http://127.0.0.1:8789/callback",
    };
    const steps = buildDeveloperSetupStepsFallback(s);
    expect(steps).toHaveLength(5);
    expect(steps[0].status).toBe("pass");
    expect(steps[2].status).toBe("skipped");
    expect(steps[3].status).toBe("pass");
  });
});
