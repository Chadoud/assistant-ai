<?php

declare(strict_types=1);

namespace DataSuite;

/**
 * Exclude verify/pytest/selftest crash rows from product analytics.
 *
 * Keep in sync with cloud-node/lib/crashFilter.js and migration 022_crash_filter_views.sql.
 */
final class CrashFilter
{
    /** Append to `crash_reports` queries (alias optional via table prefix on bare columns). */
    public const SQL = " AND app_version COLLATE utf8mb4_unicode_ci NOT IN ('verify', '0.0.0-test')"
        . " AND platform COLLATE utf8mb4_unicode_ci NOT IN ('script', 'crash-ingest-selftest', 'test')"
        . " AND source COLLATE utf8mb4_unicode_ci NOT IN ('script', 'selftest')"
        . " AND (instance_id IS NULL OR instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%')"
        . " AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Test error for pytest%'"
        . " AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%connectivity self-test%'"
        . " AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Automated verify%'"
        . " AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Enriched verify ping%'"
        . " AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '[archived_test]%'";

    /** Same predicate with table alias prefix (e.g. `c`). */
    public static function forAlias(string $alias): string
    {
        $a = preg_replace('/[^a-z_]/', '', $alias) ?: 'c';
        return " AND {$a}.app_version COLLATE utf8mb4_unicode_ci NOT IN ('verify', '0.0.0-test')"
            . " AND {$a}.platform COLLATE utf8mb4_unicode_ci NOT IN ('script', 'crash-ingest-selftest', 'test')"
            . " AND {$a}.source COLLATE utf8mb4_unicode_ci NOT IN ('script', 'selftest')"
            . " AND ({$a}.instance_id IS NULL OR {$a}.instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%')"
            . " AND {$a}.error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Test error for pytest%'"
            . " AND {$a}.error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%connectivity self-test%'"
            . " AND {$a}.error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Automated verify%'"
            . " AND {$a}.error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Enriched verify ping%'"
            . " AND {$a}.error_message COLLATE utf8mb4_unicode_ci NOT LIKE '[archived_test]%'";
    }
}
