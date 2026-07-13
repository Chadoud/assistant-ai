<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

use DataSuite\Insights;
use DataSuite\Queries;

datasuite_api(static function (Queries $q, int $days) {
    $trends = $q->dailyActiveDevices($days);

    return [
        'headline' => Insights::trendsHeadline($trends, $days),
        'trends' => $trends,
        'signed_in_vs_anonymous' => $q->signedInVsAnonymous($days),
    ];
});
