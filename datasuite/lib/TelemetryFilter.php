<?php

declare(strict_types=1);

namespace DataSuite;

/** Exclude automated verify / smoke-test rows from product analytics. */
final class TelemetryFilter
{
    /** Append to `telemetry_events` queries. */
    public const SQL = " AND app_version COLLATE utf8mb4_unicode_ci <> 'verify'"
        . " AND platform COLLATE utf8mb4_unicode_ci <> 'script'"
        . " AND instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%' ";

    /** Append to `product_feedback` queries. */
    public const FEEDBACK_SQL = " AND app_version COLLATE utf8mb4_unicode_ci <> 'verify'"
        . " AND message COLLATE utf8mb4_unicode_ci NOT LIKE '%Automated verify script%' ";
}
