<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

use DataSuite\ProductBrief;
use DataSuite\Queries;

datasuite_api(static function (Queries $q, int $days) {
    $summary = $q->execSummary($days);
    $conversion = $q->funnelConversion($days) ?? [];
    $featureEngagement = $q->featureEngagement($days);
    $assistantOps = $q->assistantOps($days);
    $assistantTools = $q->assistantTools(10);
    $crashByFeature = $q->crashByFeature($days);
    $integrationHealth = $q->integrationHealth();
    $messagingHealth = $q->messagingHealth();
    $feedbackByCategory = $q->feedbackByCategory($days);
    $topSignatures = $q->topCrashSignatures(min($days, 30));
    $sortHealth = $q->sortHealthSummary($days);
    $sortBlockers = $q->sortBlockers($days);
    $reviewFunnel = $q->reviewFunnelSummary($days);
    $setupMilestones = $q->setupMilestones($days);
    $assistantIntent = $q->assistantIntent($days);

    $featureRank = ProductBrief::rankFeatures($featureEngagement);
    $priorities = ProductBrief::priorities(
        $summary,
        $conversion,
        $featureEngagement,
        $assistantOps,
        $assistantTools,
        $crashByFeature,
        $integrationHealth,
        $messagingHealth,
        $feedbackByCategory,
        $topSignatures,
        $sortHealth,
        $sortBlockers,
        $reviewFunnel,
    );

    $turnsStarted = (int) ($assistantOps['turns_started'] ?? 0);
    $turnsCompleted = (int) ($assistantOps['turns_completed'] ?? 0);
    $turnsFailed = (int) ($assistantOps['turns_failed'] ?? 0);
    $assistantSuccessRate = $turnsStarted > 0
        ? (int) round((max(0, $turnsStarted - $turnsFailed) / $turnsStarted) * 100)
        : null;

    return [
        'headline' => ProductBrief::headline($summary, $conversion, $featureEngagement, $assistantOps, $days),
        'priorities' => $priorities,
        'feature_rank' => $featureRank,
        'assistant_ops' => $assistantOps,
        'assistant_success_rate' => $assistantSuccessRate,
        'assistant_tools' => $assistantTools,
        'crash_by_feature' => $crashByFeature,
        'integration_health' => $integrationHealth,
        'messaging_health' => $messagingHealth,
        'feedback_by_category' => $feedbackByCategory,
        'funnel' => $conversion,
        'summary' => $summary,
        'sort_health' => $sortHealth,
        'sort_blockers' => $sortBlockers,
        'review_funnel' => $reviewFunnel,
        'setup_milestones' => $setupMilestones,
        'assistant_intent' => $assistantIntent,
    ];
});
