<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

use DataSuite\Insights;
use DataSuite\MetricCatalog;
use DataSuite\Period;
use DataSuite\Queries;

datasuite_require_auth();
$days = Period::fromRequest();
$key = (string) ($_GET['key'] ?? '');

if (!Queries::isMetricKey($key)) {
    json_response(['error' => 'Unknown metric'], 400);
}

try {
    $q = datasuite_queries();
    $summary = $q->execSummary($days);
    $previous = $q->execSummaryPrevious($days);
    $current = (int) ($summary[$key] ?? 0);
    $prior = (int) ($previous[$key] ?? 0);
    $meta = MetricCatalog::metric($key);

    $payload = [
        'key' => $key,
        'label' => $meta['label'],
        'description' => $meta['description'],
        'current' => $current,
        'previous' => $prior,
        'delta' => Insights::delta($current, $prior),
        'series' => $q->metricDailySeries($key, $days),
        'period_days' => $days,
        'updated_at' => gmdate('c'),
    ];

    if ($key === 'total_events') {
        $payload['breakdown'] = $q->eventBreakdown($days);
    }
    if ($key === 'jobs_started' || $key === 'jobs_completed') {
        $started = (int) ($summary['jobs_started'] ?? 0);
        $completed = (int) ($summary['jobs_completed'] ?? 0);
        $failed = (int) ($summary['jobs_failed'] ?? 0);
        $payload['context'] = [
            'jobs_started' => $started,
            'jobs_completed' => $completed,
            'jobs_failed' => $failed,
            'finish_rate_pct' => $started > 0 ? (int) round(($completed / $started) * 100) : null,
        ];
    }

    json_response($payload);
} catch (Throwable $e) {
    error_log('[datasuite] ' . $e->getMessage());
    json_response(['error' => 'Query failed'], 500);
}
