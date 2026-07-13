<?php

declare(strict_types=1);

require_once __DIR__ . '/Config.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/Period.php';
require_once __DIR__ . '/ActivityStatus.php';
require_once __DIR__ . '/PrivacyMask.php';
require_once __DIR__ . '/Insights.php';
require_once __DIR__ . '/MetricCatalog.php';
require_once __DIR__ . '/TelemetryFilter.php';
require_once __DIR__ . '/CrashFilter.php';
require_once __DIR__ . '/ProductBrief.php';
require_once __DIR__ . '/Queries.php';
require_once __DIR__ . '/Funnel.php';

use DataSuite\Database;
use DataSuite\Queries;

/**
 * @param mixed $data
 */
function json_response($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $encoded = json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR,
    );
    if ($encoded === false) {
        http_response_code(500);
        echo '{"error":"Response encoding failed"}';
        exit;
    }
    echo $encoded;
    exit;
}

function datasuite_queries(): Queries
{
    return new Queries(Database::pdo());
}
