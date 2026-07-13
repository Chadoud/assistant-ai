<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

use DataSuite\Insights;
use DataSuite\Queries;

datasuite_api(static function (Queries $q, int $days) {
    $summary = $q->execSummary($days);
    $inbox = $q->feedbackInbox($days, 50);

    return [
        'headline' => Insights::feedbackHeadline($inbox, $days),
        'inbox' => $inbox,
        'weekly' => $q->feedbackWeekly(),
        'weekly_totals' => $q->feedbackWeeklyTotals(),
    ];
});
