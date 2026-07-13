<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

use DataSuite\Queries;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'method not allowed'], 405);
}

datasuite_require_auth();

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    $body = $_POST;
}

$signature = (string) ($body['crash_signature'] ?? '');
$status = (string) ($body['status'] ?? '');
$notes = isset($body['notes']) ? (string) $body['notes'] : null;
$fixedInVersion = isset($body['fixed_in_version']) ? (string) $body['fixed_in_version'] : null;

try {
    $result = datasuite_queries()->updateCrashTriage($signature, $status, $notes, $fixedInVersion);
    if (isset($result['error'])) {
        $code = $result['error'] === 'not found' ? 404 : 400;
        json_response($result, $code);
    }
    json_response([
        'ok' => true,
        'row' => $result['row'],
        'updated_at' => gmdate('c'),
    ]);
} catch (Throwable $e) {
    error_log('[datasuite] triage-update: ' . $e->getMessage());
    json_response(['error' => 'Update failed — check crash_triage write grants'], 500);
}
