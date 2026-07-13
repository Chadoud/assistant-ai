/**
 * Shared crash-report filter for product analytics (DataSuite, CLI, digest).
 *
 * Keep in sync with datasuite/lib/CrashFilter.php and migration 022_crash_filter_views.sql.
 */

/** SQL predicate without leading AND — use inside WHERE clauses. */
const CRASH_FILTER_PREDICATE = `
  app_version NOT IN ('verify', '0.0.0-test')
  AND platform NOT IN ('script', 'crash-ingest-selftest', 'test')
  AND source NOT IN ('script', 'selftest')
  AND (instance_id IS NULL OR instance_id NOT LIKE 'verify-%')
  AND error_message NOT LIKE '%Test error for pytest%'
  AND error_message NOT LIKE '%connectivity self-test%'
  AND error_message NOT LIKE '%Automated verify%'
  AND error_message NOT LIKE '%Enriched verify ping%'
  AND error_message NOT LIKE '[archived_test]%'
`.replace(/\s+/g, " ").trim();

/** Append to existing WHERE (includes leading AND). */
const CRASH_FILTER_SQL = ` AND ${CRASH_FILTER_PREDICATE}`;

/**
 * @param {string} [alias] Table alias without trailing dot.
 * @returns {string}
 */
function crashFilterSql(alias = "") {
  const prefix = alias ? `${alias}.` : "";
  return ` AND ${prefix}app_version NOT IN ('verify', '0.0.0-test')
    AND ${prefix}platform NOT IN ('script', 'crash-ingest-selftest', 'test')
    AND ${prefix}source NOT IN ('script', 'selftest')
    AND (${prefix}instance_id IS NULL OR ${prefix}instance_id NOT LIKE 'verify-%')
    AND ${prefix}error_message NOT LIKE '%Test error for pytest%'
    AND ${prefix}error_message NOT LIKE '%connectivity self-test%'
    AND ${prefix}error_message NOT LIKE '%Automated verify%'
    AND ${prefix}error_message NOT LIKE '%Enriched verify ping%'
    AND ${prefix}error_message NOT LIKE '[archived_test]%'`.replace(/\s+/g, " ");
}

/** Inverse predicate — rows that should be archived as test noise. */
const CRASH_TEST_ROW_PREDICATE = `
  NOT (${CRASH_FILTER_PREDICATE})
`.replace(/\s+/g, " ").trim();

module.exports = {
  CRASH_FILTER_PREDICATE,
  CRASH_FILTER_SQL,
  CRASH_TEST_ROW_PREDICATE,
  crashFilterSql,
};
