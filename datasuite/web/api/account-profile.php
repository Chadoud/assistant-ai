<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

use DataSuite\Queries;

datasuite_api(static function (Queries $q, int $days) {
    $accountId = trim((string) ($_GET['account_id'] ?? ''));
    if ($accountId === '') {
        return ['error' => 'account_id required'];
    }

    $profile = $q->accountProfile($accountId, $days);
    if (!$profile) {
        return ['error' => 'not found'];
    }

    return ['profile' => $profile];
});
