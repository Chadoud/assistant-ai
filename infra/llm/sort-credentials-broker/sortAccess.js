/**
 * Whether an account may receive cloud sort LLM credentials.
 * @param {{ trial_active?: boolean; entitlements?: Array<{ feature?: string; active?: boolean }> } | null | undefined} profile
 */
function accountHasSortAccess(profile) {
  if (!profile) return false;
  if (profile.trial_active) return true;
  const ents = profile.entitlements;
  if (!Array.isArray(ents)) return false;
  return ents.some((e) => e?.feature === "sort" && e?.active);
}

module.exports = { accountHasSortAccess };
