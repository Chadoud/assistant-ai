<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

use DataSuite\Funnel;
use DataSuite\Insights;
use DataSuite\Queries;

datasuite_api(static function (Queries $q, int $days) {
    $conversion = $q->funnelConversion($days) ?? [];
    $sortSteps = $q->sortFunnel($days);
    $setupMilestones = $q->setupMilestones($days);
    $appStarts = (int) ($conversion['starts'] ?? 0);
    $setupWaterfall = Funnel::setupMilestoneWaterfall($setupMilestones, $appStarts);
    if ($appStarts > 0 && (int) ($conversion['first_drops'] ?? 0) > 0) {
        $setupWaterfall[] = [
            'milestone' => 'first_drop',
            'label' => 'First files dropped',
            'unique_installs' => (int) $conversion['first_drops'],
            'pct_of_start' => round(((int) $conversion['first_drops'] / $appStarts) * 100, 1),
        ];
    }
    return [
        'headline' => Insights::funnelHeadline($conversion, $days),
        'conversion' => $conversion,
        'rates' => Funnel::conversionRates($conversion),
        'waterfall' => Funnel::waterfall($sortSteps),
        'steps' => $sortSteps,
        'onboarding' => $q->onboardingFunnel($days),
        'setup_milestones' => $setupWaterfall,
    ];
});
