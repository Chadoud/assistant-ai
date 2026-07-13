<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

use DataSuite\Insights;
use DataSuite\Queries;

datasuite_api(static function (Queries $q, int $days) {
    $summary = $q->execSummary($days);
    $crashDays = min($days, 30);

    return [
        'headline' => Insights::qualityHeadline($summary, $days),
        'crash_daily' => $q->crashDaily($crashDays),
        'top_signatures' => $q->topCrashSignatures($crashDays),
        'release_health' => $q->releaseHealth(min($days, 14)),
        'release_rates' => $q->releaseCrashRates(min($days, 14)),
        'crash_inbox' => $q->crashInbox($crashDays, 50),
        'crash_triage' => $q->crashTriageInbox(25),
    ];
});
