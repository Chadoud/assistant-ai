<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

use DataSuite\Queries;

datasuite_api(static function (Queries $q, int $days) {
    $id = (int) ($_GET['id'] ?? 0);
    if ($id <= 0) {
        return ['error' => 'invalid id'];
    }

    $crash = $q->crashById($id);
    if (!$crash) {
        return ['error' => 'not found'];
    }

    $sessionId = isset($crash['session_id']) ? (string) $crash['session_id'] : '';
    $timeline = $sessionId !== '' ? $q->telemetryForSession($sessionId, 30) : [];

    return [
        'crash' => $crash,
        'timeline' => $timeline,
        'inbox_days' => min($days, 30),
    ];
});
