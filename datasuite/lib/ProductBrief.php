<?php

declare(strict_types=1);

namespace DataSuite;

/**
 * Executive product brief — plain-language priorities for where to fix and improve.
 * Consumes aggregated queries; no PII, no raw prompts.
 */
final class ProductBrief
{
    /** Approximate engagement score from duration buckets (relative index, not seconds). */
    public static function featureEngagementScore(array $row): float
    {
        return
            ((int) ($row['bucket_0_5s'] ?? 0)) * 1
            + ((int) ($row['bucket_5_30s'] ?? 0)) * 3
            + ((int) ($row['bucket_30s_2m'] ?? 0)) * 8
            + ((int) ($row['bucket_2_10m'] ?? 0)) * 20
            + ((int) ($row['bucket_10m_plus'] ?? 0)) * 40;
    }

    public static function featureLabel(string $feature): string
    {
        return match ($feature) {
            'assistant' => 'AI Assistant',
            'sort' => 'File sorting',
            'external_sources' => 'Connected apps',
            'settings' => 'Settings',
            'voice' => 'Voice',
            'codegen' => 'Codegen studio',
            'memories' => 'Memory',
            'tasks' => 'Tasks',
            default => ucfirst(str_replace('_', ' ', $feature)),
        };
    }

    public static function sortBlockerLabel(string $reason): string
    {
        return match ($reason) {
            'no_output_folder' => 'No output folder set',
            'offline' => 'App offline',
            'model_not_ready' => 'AI models not ready',
            'entitlement_blocked' => 'Trial or plan limit',
            'cloud_auth_required' => 'Sign-in required',
            'local_paths_need_desktop' => 'Needs desktop app for local files',
            'empty_selection' => 'Nothing selected to sort',
            default => ucfirst(str_replace('_', ' ', $reason)),
        };
    }

    public static function setupMilestoneLabel(string $milestone): string
    {
        return match ($milestone) {
            'output_folder_set' => 'Output folder configured',
            'model_ready' => 'AI models ready',
            'telemetry_on' => 'Analytics enabled',
            'account_linked' => 'Account linked',
            'welcome_completed' => 'Welcome wizard finished',
            default => ucfirst(str_replace('_', ' ', $milestone)),
        };
    }

    public static function intentBucketLabel(string $bucket): string
    {
        return match ($bucket) {
            'sort' => 'File sorting',
            'messaging_whatsapp' => 'WhatsApp messaging',
            'messaging_other' => 'Other messaging',
            'assistant' => 'General assistant',
            'settings' => 'Settings & setup',
            default => ucfirst(str_replace('_', ' ', $bucket)),
        };
    }

    /**
     * @param array<string, mixed> $summary
     * @param array<string, int> $conversion
     * @param list<array<string, mixed>> $featureEngagement
     * @param array<string, int> $assistantOps
     * @param list<array<string, mixed>> $assistantTools
     * @param list<array<string, mixed>> $crashByFeature
     * @param list<array<string, mixed>> $integrationHealth
     * @param list<array<string, mixed>> $messagingHealth
     * @param list<array<string, mixed>> $feedbackByCategory
     * @param list<array<string, mixed>> $topCrashSignatures
     */
    public static function headline(
        array $summary,
        array $conversion,
        array $featureEngagement,
        array $assistantOps,
        int $days,
    ): string {
        $devices = (int) ($summary['active_devices'] ?? 0);
        $crashes = (int) ($summary['crashes'] ?? 0);
        $starts = (int) ($conversion['starts'] ?? 0);
        $turnsFailed = (int) ($assistantOps['turns_failed'] ?? 0);
        $providerErrors = (int) ($assistantOps['provider_errors'] ?? 0);

        if ($devices === 0) {
            return sprintf('No opt-in usage in the last %d days — enable telemetry on beta installs to unlock product intelligence.', $days);
        }

        $topFeature = self::topFeatureByEngagement($featureEngagement);
        $parts = [sprintf('%s active installs', number_format($devices))];

        if ($topFeature !== null) {
            $parts[] = sprintf('most time in %s', self::featureLabel($topFeature));
        }
        if ($crashes > 0) {
            $parts[] = sprintf('%s crash%s need triage', number_format($crashes), $crashes === 1 ? '' : 'es');
        } elseif ($turnsFailed > 0 || $providerErrors > 0) {
            $parts[] = 'assistant reliability needs attention';
        } elseif ($starts > 0) {
            $parts[] = 'focus on conversion and finish rate';
        }

        return implode(' · ', $parts) . '.';
    }

    /**
     * @param list<array<string, mixed>> $rows
     */
    private static function topFeatureByEngagement(array $rows): ?string
    {
        $best = null;
        $bestScore = -1.0;
        foreach ($rows as $row) {
            $score = self::featureEngagementScore($row);
            if ($score > $bestScore) {
                $bestScore = $score;
                $best = (string) ($row['feature'] ?? '');
            }
        }
        return $best !== '' ? $best : null;
    }

    /**
     * Ranked action list for engineering and product.
     *
     * @return list<array{severity: string, area: string, title: string, evidence: string, action: string, panel: string}>
     */
    public static function priorities(
        array $summary,
        array $conversion,
        array $featureEngagement,
        array $assistantOps,
        array $assistantTools,
        array $crashByFeature,
        array $integrationHealth,
        array $messagingHealth,
        array $feedbackByCategory,
        array $topCrashSignatures,
        array $sortHealth = [],
        array $sortBlockers = [],
        array $reviewFunnel = [],
    ): array {
        $priorities = [];

        $reviewOpened = (int) ($reviewFunnel['review_opened'] ?? 0);
        $applyRate = $reviewFunnel['apply_rate_pct'] ?? null;
        if ($reviewOpened >= 5 && $applyRate !== null && $applyRate < 40) {
            $priorities[] = [
                'severity' => $applyRate < 20 ? 'high' : 'medium',
                'area' => 'Review loop',
                'title' => 'Users open review but rarely apply fixes',
                'evidence' => sprintf(
                    '%s%% apply rate (%s bulk applies / %s review opens)',
                    number_format((float) $applyRate, 1),
                    number_format((int) ($reviewFunnel['bulk_applied'] ?? 0)),
                    number_format($reviewOpened)
                ),
                'action' => 'Reduce review friction — bulk-apply obvious moves, clearer folder suggestions, fewer clicks to finish.',
                'panel' => 'product',
            ];
        }

        $sortCompleted = (int) ($sortHealth['jobs_completed'] ?? 0);
        $messyRate = $sortHealth['messy_rate_pct'] ?? null;
        if ($sortCompleted >= 3 && $messyRate !== null && $messyRate >= 30) {
            $priorities[] = [
                'severity' => $messyRate >= 50 ? 'high' : 'medium',
                'area' => 'Sort quality',
                'title' => 'Too many messy sorts',
                'evidence' => sprintf(
                    '%s%% of completed sorts had uncertain files or failures (%s / %s jobs)',
                    number_format((float) $messyRate, 1),
                    number_format((int) ($sortHealth['uncertain_jobs'] ?? 0) + (int) ($sortHealth['failure_jobs'] ?? 0)),
                    number_format($sortCompleted)
                ),
                'action' => 'Tune classification, OCR quality, or onboarding — users should bulk-apply, not fix everything manually.',
                'panel' => 'product',
            ];
        }

        if ($sortBlockers !== []) {
            $top = $sortBlockers[0];
            $blocks = (int) ($top['blocks'] ?? 0);
            $reason = (string) ($top['reason'] ?? '');
            if ($blocks >= 2 && $reason === 'no_output_folder') {
                $priorities[] = [
                    'severity' => 'high',
                    'area' => 'Onboarding',
                    'title' => 'Users hit sort without an output folder',
                    'evidence' => sprintf(
                        '%s blocked attempts across %s installs',
                        number_format($blocks),
                        number_format((int) ($top['unique_installs'] ?? 0))
                    ),
                    'action' => 'Set output folder during welcome or infer a sensible default — prerequisite work is a product failure.',
                    'panel' => 'funnel',
                ];
            } elseif ($blocks >= 2) {
                $priorities[] = [
                    'severity' => 'medium',
                    'area' => 'Sort',
                    'title' => sprintf('Sort blocked: %s', (string) ($top['label'] ?? $reason)),
                    'evidence' => sprintf(
                        '%s blocked attempts across %s installs',
                        number_format($blocks),
                        number_format((int) ($top['unique_installs'] ?? 0))
                    ),
                    'action' => 'Remove friction at this guard — users never reach first successful sort.',
                    'panel' => 'funnel',
                ];
            }
        }

        $crashes = (int) ($summary['crashes'] ?? 0);
        if ($crashes > 0 && $topCrashSignatures !== []) {
            $sig = $topCrashSignatures[0];
            $priorities[] = [
                'severity' => 'critical',
                'area' => 'Reliability',
                'title' => 'Top crash signature is recurring',
                'evidence' => sprintf(
                    '%s reports · %s · last seen %s',
                    number_format((int) ($sig['crashes'] ?? 0)),
                    substr((string) ($sig['signature'] ?? 'unknown'), 0, 80),
                    substr((string) ($sig['last_seen'] ?? ''), 0, 10)
                ),
                'action' => 'Open Quality → crash inbox, reproduce from breadcrumbs, ship fix in next desktop build.',
                'panel' => 'quality',
            ];
        }

        foreach ($crashByFeature as $row) {
            $feature = (string) ($row['feature'] ?? '');
            $count = (int) ($row['crashes'] ?? 0);
            if ($count <= 0 || $feature === 'unknown') {
                continue;
            }
            $priorities[] = [
                'severity' => $count >= 3 ? 'critical' : 'high',
                'area' => 'Reliability',
                'title' => sprintf('Crashes cluster in %s', self::featureLabel($feature)),
                'evidence' => sprintf('%s crash%s · %s sessions affected', number_format($count), $count === 1 ? '' : 'es', number_format((int) ($row['affected_sessions'] ?? 0))),
                'action' => 'Prioritize stability work in this feature before new capabilities.',
                'panel' => 'quality',
            ];
            break;
        }

        $providerErrors = (int) ($assistantOps['provider_errors'] ?? 0);
        $turnsFailed = (int) ($assistantOps['turns_failed'] ?? 0);
        $turnsStarted = (int) ($assistantOps['turns_started'] ?? 0);
        if ($providerErrors > 0) {
            $priorities[] = [
                'severity' => 'high',
                'area' => 'Assistant',
                'title' => 'LLM provider errors are blocking assistant turns',
                'evidence' => sprintf('%s provider errors in period (%s turns started)', number_format($providerErrors), number_format($turnsStarted)),
                'action' => 'Check quota, fallback model, and user-visible error handling — users see failures as product bugs.',
                'panel' => 'product',
            ];
        } elseif ($turnsFailed > 0 && $turnsStarted > 0) {
            $rate = (int) round(($turnsFailed / max(1, $turnsStarted)) * 100);
            $priorities[] = [
                'severity' => $rate >= 20 ? 'high' : 'medium',
                'area' => 'Assistant',
                'title' => 'Assistant turns fail too often',
                'evidence' => sprintf('%s%% failure rate (%s failed / %s started)', number_format($rate), number_format($turnsFailed), number_format($turnsStarted)),
                'action' => 'Review tool results, timeouts, and offline paths — assistant is a core retention surface.',
                'panel' => 'product',
            ];
        }

        foreach ($messagingHealth as $row) {
            $failed = (int) ($row['failed'] ?? 0);
            $started = (int) ($row['started'] ?? 0);
            if ($failed <= 0 || $started <= 0) {
                continue;
            }
            $rate = (int) round(($failed / $started) * 100);
            if ($rate >= 10) {
                $priorities[] = [
                    'severity' => $rate >= 30 ? 'high' : 'medium',
                    'area' => 'Messaging',
                    'title' => sprintf('%s send path is unreliable', (string) ($row['platform'] ?? 'messaging')),
                    'evidence' => sprintf('%s%% failure (%s failed / %s started)', number_format($rate), number_format($failed), number_format($started)),
                    'action' => 'Harden send_message flow and surface actionable errors instead of crashing.',
                    'panel' => 'quality',
                ];
            }
            break;
        }

        foreach ($integrationHealth as $row) {
            $failed = (int) ($row['connects_failed'] ?? 0);
            $ok = (int) ($row['connects_ok'] ?? 0);
            if ($failed <= 0) {
                continue;
            }
            $total = $ok + $failed;
            $rate = $total > 0 ? (int) round(($failed / $total) * 100) : 100;
            $priorities[] = [
                'severity' => $rate >= 40 ? 'high' : 'medium',
                'area' => 'Integrations',
                'title' => sprintf('%s connect flow failing', (string) ($row['provider'] ?? 'integration')),
                'evidence' => sprintf('%s%% failed (%s / %s attempts)', number_format($rate), number_format($failed), number_format($total)),
                'action' => 'Fix OAuth/embedded signup UX — broken connect blocks the whole integration value prop.',
                'panel' => 'product',
            ];
            break;
        }

        $starts = (int) ($conversion['starts'] ?? 0);
        $firstDrops = (int) ($conversion['first_drops'] ?? 0);
        $jobsStarted = (int) ($conversion['jobs_started'] ?? 0);
        if ($starts > 0 && $firstDrops > 0 && $jobsStarted === 0) {
            $dropRate = (int) round(($firstDrops / $starts) * 100);
            $priorities[] = [
                'severity' => 'medium',
                'area' => 'Onboarding',
                'title' => 'Users drop files but never start a sort',
                'evidence' => sprintf('%s%% reach first drop without a sort job (%s drops / %s opens)', number_format($dropRate), number_format($firstDrops), number_format($starts)),
                'action' => 'Reduce friction after first drop — clarify next step, auto-start when obvious.',
                'panel' => 'funnel',
            ];
        }

        $jobsCompleted = (int) ($conversion['jobs_completed'] ?? 0);
        if ($jobsStarted > 0) {
            $finishRate = (int) round(($jobsCompleted / $jobsStarted) * 100);
            if ($finishRate < 60) {
                $priorities[] = [
                    'severity' => 'medium',
                    'area' => 'Sort',
                    'title' => 'Sort jobs rarely finish',
                    'evidence' => sprintf('%s%% finish rate (%s completed / %s started)', number_format($finishRate), number_format($jobsCompleted), number_format($jobsStarted)),
                    'action' => 'Investigate review step friction, slow analysis, and cancellation reasons.',
                    'panel' => 'funnel',
                ];
            }
        }

        if ($feedbackByCategory !== []) {
            $top = $feedbackByCategory[0];
            $cat = (string) ($top['category'] ?? 'other');
            $count = (int) ($top['count'] ?? 0);
            if ($count > 0 && $cat === 'bug') {
                $priorities[] = [
                    'severity' => 'medium',
                    'area' => 'Voice of customer',
                    'title' => 'Users are reporting bugs in feedback',
                    'evidence' => sprintf('%s bug reports in period', number_format($count)),
                    'action' => 'Read Feedback inbox weekly and link themes to crash signatures.',
                    'panel' => 'feedback',
                ];
            }
        }

        if ($assistantTools !== []) {
            $topTool = $assistantTools[0];
            $tool = (string) ($topTool['tool_name'] ?? '');
            if ($tool !== '' && $tool === 'send_message') {
                $priorities[] = [
                    'severity' => 'medium',
                    'area' => 'Assistant',
                    'title' => 'Messaging is the top assistant action',
                    'evidence' => sprintf('%s send_message invocations — highest tool usage', number_format((int) ($topTool['invocations'] ?? 0))),
                    'action' => 'Treat messaging (WhatsApp, email, SMS) as tier-1 reliability — test end-to-end on every release.',
                    'panel' => 'product',
                ];
            }
        }

        if ($priorities === [] && $featureEngagement !== []) {
            $top = $featureEngagement[0];
            $priorities[] = [
                'severity' => 'medium',
                'area' => 'Growth',
                'title' => sprintf('Double down on %s', self::featureLabel((string) ($top['feature'] ?? ''))),
                'evidence' => 'Highest engagement score in period — users spend the most time here.',
                'action' => 'Ship improvements where attention already is; don\'t spread effort evenly.',
                'panel' => 'product',
            ];
        }

        if ($priorities === []) {
            $priorities[] = [
                'severity' => 'medium',
                'area' => 'Data',
                'title' => 'Collect more signal before prioritizing',
                'evidence' => 'Telemetry volume is still sparse for automated recommendations.',
                'action' => 'Ensure beta users opt in to analytics; revisit after more active days.',
                'panel' => 'overview',
            ];
        }

        usort($priorities, static function (array $a, array $b): int {
            $rank = ['critical' => 0, 'high' => 1, 'medium' => 2];
            return ($rank[$a['severity']] ?? 9) <=> ($rank[$b['severity']] ?? 9);
        });

        return array_slice($priorities, 0, 8);
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array{feature: string, label: string, score: float, entries: int, exits: int}>
     */
    public static function rankFeatures(array $rows): array
    {
        $out = [];
        foreach ($rows as $row) {
            $feature = (string) ($row['feature'] ?? '');
            if ($feature === '') {
                continue;
            }
            $out[] = [
                'feature' => $feature,
                'label' => self::featureLabel($feature),
                'score' => self::featureEngagementScore($row),
                'entries' => (int) ($row['entries'] ?? 0),
                'exits' => (int) ($row['exits'] ?? 0),
            ];
        }
        usort($out, static fn (array $a, array $b): int => $b['score'] <=> $a['score']);
        return $out;
    }
}
