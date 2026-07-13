<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

use DataSuite\Period;
use DataSuite\Queries;

datasuite_require_auth();
$days = Period::fromRequest();
$instanceId = isset($_GET['instance_id']) ? (string) $_GET['instance_id'] : '';

try {
    $q = datasuite_queries();
    $detail = $q->deviceActivityDetail($instanceId, $days);
    json_response([
        'period_days' => $days,
        'detail' => $detail,
        'updated_at' => gmdate('c'),
    ]);
} catch (Throwable $e) {
    error_log('[datasuite] activity-detail ' . $e->getMessage());
    json_response(['error' => 'Query failed'], 500);
}
