<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

use DataSuite\Period;
use DataSuite\Queries;

datasuite_require_auth();
$weeks = Period::weeksFromRequest([8, 12], 12);

try {
    $q = datasuite_queries();
    json_response([
        'weeks' => $weeks,
        'cohorts' => $q->retentionCohorts($weeks),
        'headline' => 'Weekly retention — share of installs still sending events each week after first open.',
        'note' => 'Percentages appear only when a cohort has at least 5 installs.',
        'updated_at' => gmdate('c'),
    ]);
} catch (Throwable $e) {
    error_log('[datasuite] retention ' . $e->getMessage());
    json_response(['error' => 'Query failed'], 500);
}
