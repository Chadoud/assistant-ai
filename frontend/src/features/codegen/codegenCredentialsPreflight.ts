import type { AppSettings, ChatProviderId } from "../../types/settings";
import { resolveChatProviderCredentials } from "../../utils/resolveChatProviderCredentials";

const KEYED_PROVIDERS: readonly ChatProviderId[] = ["gemini", "openai", "anthropic"];

type CodegenCredentialsIssue =
  | { kind: "missing_api_key"; provider: ChatProviderId }
  | { kind: "missing_base_url" };

/**
 * Returns a configuration gap that would block Codegen Studio before any network call.
 * Ollama is allowed through — local availability is checked when generation starts.
 */
export function describeCodegenCredentialsIssue(settings: AppSettings): CodegenCredentialsIssue | null {
  const { provider, apiKey, baseUrl } = resolveChatProviderCredentials(settings);
  if (provider === "custom") {
    if (!baseUrl.trim()) return { kind: "missing_base_url" };
    if (!apiKey.trim()) return { kind: "missing_api_key", provider };
  }
  if (KEYED_PROVIDERS.includes(provider) && !apiKey.trim()) {
    return { kind: "missing_api_key", provider };
  }
  return null;
}

/** i18n key for a plain-language credentials message (see assistant.codegen.* locale strings). */
export function codegenCredentialsMessageKey(issue: CodegenCredentialsIssue): string {
  if (issue.kind === "missing_base_url") {
    return "assistant.codegen.missingCustomBaseUrl";
  }
  switch (issue.provider) {
    case "anthropic":
      return "assistant.codegen.missingApiKeyAnthropic";
    case "openai":
      return "assistant.codegen.missingApiKeyOpenai";
    case "gemini":
      return "assistant.codegen.missingApiKeyGemini";
    default:
      return "assistant.codegen.missingApiKeyGeneric";
  }
}
