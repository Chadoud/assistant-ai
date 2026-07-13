<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/init.php';

use DataSuite\Database;

$db = Database::ping();
json_response([
    'ok' => true,
    'db' => $db['ok'],
    'db_error' => $db['ok'] ? null : ($db['message'] ?? 'unknown'),
]);
