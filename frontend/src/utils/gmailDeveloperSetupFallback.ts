import type { GmailDeveloperSetupStep, GmailStatusResponse } from "../api/gmail";

const DEFAULT_GMAIL_REDIRECT_URI = "http://127.0.0.1:8789/callback";

function loopbackRedirectOk(uri: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/callback\/?$/i.test((uri || "").trim());
}

/**
 * When the backend does not yet return ``developer_setup_steps``, infer the same five rows
 * from legacy ``/gmail/status`` fields so the checklist still renders.
 */
export function buildDeveloperSetupStepsFallback(status: GmailStatusResponse): GmailDeveloperSetupStep[] {
  if (status.developer_setup_steps?.length) return status.developer_setup_steps;

  const envId = !!status.oauth_env_id_present;
  const envSec = !!status.oauth_env_secret_present;
  const envBoth = envId && envSec;
  const oauthOk = !!status.oauth_configured;
  const jsonPath = !!status.oauth_json_path_env_present;
  const jsonDefault = !!status.oauth_default_json_exists;
  const jsonOnDisk = jsonPath || jsonDefault;
  const redirectUri = (status.gmail_oauth_redirect_uri || DEFAULT_GMAIL_REDIRECT_URI).trim();

  const step1: GmailDeveloperSetupStep["status"] = oauthOk ? "pass" : "fail";
  const step2: GmailDeveloperSetupStep["status"] = "manual";

  let step3: GmailDeveloperSetupStep["status"];
  if (envBoth && oauthOk) step3 = "skipped";
  else if (oauthOk && jsonOnDisk && !envBoth) step3 = "pass";
  else if (!oauthOk && jsonOnDisk) step3 = "fail";
  else step3 = "not_applicable";

  let step4: GmailDeveloperSetupStep["status"];
  if (!oauthOk) step4 = "fail";
  else if (loopbackRedirectOk(redirectUri)) step4 = "pass";
  else step4 = "manual";

  let step5: GmailDeveloperSetupStep["status"];
  if (status.connected === true && oauthOk) {
    step5 = "manual";
  } else {
    step5 = "manual";
  }

  return [
    {
      id: "client_credentials",
      status: step1,
      hints: {
        oauth_configured: oauthOk,
        oauth_env_id_present: envId,
        oauth_env_secret_present: envSec,
        backend_dotenv_file_exists: !!status.backend_dotenv_file_exists,
        user_dotenv_file_exists: !!status.user_dotenv_file_exists,
        resource_dotenv_file_exists: !!status.resource_dotenv_file_exists,
      },
    },
    { id: "backend_reload", status: step2 },
    {
      id: "json_client_file",
      status: step3,
      hints: {
        oauth_json_path_env_present: jsonPath,
        oauth_json_file_at_path_exists: jsonPath,
        oauth_default_json_exists: jsonDefault,
      },
    },
    {
      id: "redirect_uri",
      status: step4,
      hints: {
        redirect_uri_effective: redirectUri,
        loopback_redirect_ok: loopbackRedirectOk(redirectUri),
      },
    },
    {
      id: "gmail_api_enabled",
      status: step5,
      hints: { gmail_profile_probe_ok: null as boolean | null },
    },
  ];
}
