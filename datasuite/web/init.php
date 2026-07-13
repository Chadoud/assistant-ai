<?php

declare(strict_types=1);

$candidates = [
    __DIR__ . '/_lib/bootstrap.php',
    dirname(__DIR__) . '/lib/bootstrap.php',
];

foreach ($candidates as $path) {
    if (is_file($path)) {
        require_once $path;
        return;
    }
}

http_response_code(500);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['error' => 'DataSuite lib not found']);
exit;
