<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

use DataSuite\ActivityStatus;
use DataSuite\Period;
use DataSuite\Queries;

datasuite_require_auth();
$days = Period::fromRequest();
$scope = isset($_GET['scope']) ? (string) $_GET['scope'] : 'devices';
$statusRaw = isset($_GET['status']) ? (string) $_GET['status'] : '';

try {
    $status = ActivityStatus::isFilterable($statusRaw) ? $statusRaw : null;
    $q = datasuite_queries();
    if ($scope === 'accounts') {
        json_response([
            'scope' => 'accounts',
            'period_days' => $days,
            'summary' => $q->accountActivitySummary(),
            'accounts' => $q->accountActivity($status),
            'updated_at' => gmdate('c'),
        ]);
    }

    $accounts = [];
    try {
        $accounts = $q->accountActivity(null);
    } catch (Throwable $accountError) {
        error_log('[datasuite] accountActivity ' . $accountError->getMessage());
    }

    json_response([
        'scope' => 'devices',
        'period_days' => $days,
        'headline' => 'Who is using Exo — installs with opt-in analytics.',
        'summary' => $q->activitySummary(),
        'account_summary' => $q->accountActivitySummary(),
        'devices' => $q->deviceActivity($status),
        'accounts' => $accounts,
        'status_labels' => ActivityStatus::LABELS,
        'updated_at' => gmdate('c'),
    ]);
} catch (Throwable $e) {
    error_log('[datasuite] activity ' . $e->getMessage());
    json_response(['error' => 'Query failed', 'detail' => $e->getMessage()], 500);
}
