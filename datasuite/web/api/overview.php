<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

use DataSuite\Insights;
use DataSuite\MetricCatalog;
use DataSuite\Queries;

datasuite_api(static function (Queries $q, int $days) {
    $summary = $q->execSummary($days);
    $previous = $q->execSummaryPrevious($days);
    $metricKeys = [
        'active_devices',
        'signed_in_users',
        'total_events',
        'jobs_started',
        'jobs_completed',
        'feedback',
        'crashes',
        'new_accounts',
    ];
    $metrics = [];
    foreach ($metricKeys as $key) {
        $meta = MetricCatalog::metric($key);
        $metrics[] = [
            'key' => $key,
            'label' => $meta['label'],
            'description' => $meta['description'],
            'current' => $summary[$key] ?? 0,
            'previous' => $previous[$key] ?? 0,
            'delta' => Insights::delta($summary[$key] ?? 0, $previous[$key] ?? 0),
        ];
    }

    return [
        'headline' => Insights::overviewHeadline($summary, $days),
        'summary' => $summary,
        'previous' => $previous,
        'metrics' => $metrics,
        'insights' => MetricCatalog::overviewInsights($summary),
        'event_mix' => $q->eventBreakdown($days),
        'sparklines' => [
            'devices' => $q->sparklineDevices(min($days, 30)),
            'events' => $q->sparklineEvents(min($days, 30)),
        ],
    ];
});
