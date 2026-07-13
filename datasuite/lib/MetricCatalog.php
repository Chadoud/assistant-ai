<?php

declare(strict_types=1);

namespace DataSuite;

/** Plain-language labels and descriptions for dashboard metrics and events. */
final class MetricCatalog
{
    /** @var array<string, array{label: string, description: string}> */
    private const METRICS = [
        'active_devices' => [
            'label' => 'Active devices',
            'description' => 'Distinct installs that sent opt-in usage data in this period.',
        ],
        'signed_in_users' => [
            'label' => 'Signed-in users',
            'description' => 'Distinct accounts linked to telemetry while using the desktop app.',
        ],
        'total_events' => [
            'label' => 'Product events',
            'description' => 'All opt-in signals: app opens, sorts, navigation, onboarding, and feedback.',
        ],
        'jobs_started' => [
            'label' => 'Sorts started',
            'description' => 'Times users kicked off a sort job (files dropped or cloud import).',
        ],
        'jobs_completed' => [
            'label' => 'Sorts finished',
            'description' => 'Sort jobs that reached a completed state.',
        ],
        'jobs_failed' => [
            'label' => 'Sorts failed',
            'description' => 'Sort jobs that ended with a pipeline error.',
        ],
        'jobs_cancelled' => [
            'label' => 'Sorts cancelled',
            'description' => 'Sort jobs the user stopped before completion.',
        ],
        'sort_blocked' => [
            'label' => 'Sort blocked',
            'description' => 'Attempts stopped by a prerequisite (offline, no output folder, models missing, …).',
        ],
        'feedback' => [
            'label' => 'Feedback',
            'description' => 'In-app feedback submissions (bug, UX, idea).',
        ],
        'crashes' => [
            'label' => 'Crashes',
            'description' => 'Opt-in crash reports sent from the desktop app.',
        ],
        'new_accounts' => [
            'label' => 'New accounts',
            'description' => 'Cloud sign-ups (excludes automated test registrations).',
        ],
    ];

    /** @var array<string, string> */
    private const EVENT_LABELS = [
        'app_started' => 'App opened',
        'welcome_step_viewed' => 'Welcome step viewed',
        'welcome_completed' => 'Welcome finished',
        'welcome_dismissed' => 'Welcome skipped',
        'settings_opened' => 'Settings opened',
        'tab_changed' => 'Tab changed',
        'first_drop' => 'First files dropped',
        'job_started' => 'Sort started',
        'job_completed' => 'Sort finished',
        'job_cancelled' => 'Sort cancelled',
        'job_failed' => 'Sort failed',
        'sort_blocked' => 'Sort blocked',
        'feedback_submitted' => 'Feedback sent',
        'post_run_cta_clicked' => 'Post-run action',
        'review_filter_changed' => 'Review filter changed',
        'codegen_session_start' => 'Codegen session',
        'codegen_preview_ready' => 'Codegen preview ready',
        'codegen_error' => 'Codegen error',
        'codegen_repair_outcome' => 'Codegen repair outcome',
        'account_signed_in' => 'Signed in',
        'account_signed_out' => 'Signed out',
        'account_deleted' => 'Account deleted',
        'telemetry_opt_in' => 'Analytics enabled',
        'telemetry_opt_out' => 'Analytics disabled',
        'app_heartbeat' => 'Daily check-in',
        'assistant_turn_started' => 'Assistant turn started',
        'assistant_turn_completed' => 'Assistant turn completed',
        'assistant_turn_failed' => 'Assistant turn failed',
        'assistant_tool_invoked' => 'Assistant tool used',
        'send_message_started' => 'Message send started',
        'send_message_completed' => 'Message sent',
        'send_message_failed' => 'Message send failed',
        'integration_connect_started' => 'Integration connect started',
        'integration_connect_completed' => 'Integration connected',
        'integration_connect_failed' => 'Integration connect failed',
        'feature_entered' => 'Feature opened',
        'feature_exited' => 'Feature closed',
        'provider_error' => 'AI provider error',
    ];

    /**
     * @return array{label: string, description: string}
     */
    public static function metric(string $key): array
    {
        return self::METRICS[$key] ?? [
            'label' => Queries::metricLabel($key),
            'description' => '',
        ];
    }

    public static function eventLabel(string $eventName): string
    {
        return self::EVENT_LABELS[$eventName] ?? str_replace('_', ' ', $eventName);
    }

    /**
     * @param array<string, int> $summary
     * @return list<array{label: string, value: string, description: string}>
     */
    public static function overviewInsights(array $summary): array
    {
        $started = (int) ($summary['jobs_started'] ?? 0);
        $completed = (int) ($summary['jobs_completed'] ?? 0);
        $failed = (int) ($summary['jobs_failed'] ?? 0);
        $insights = [];

        if ($started > 0) {
            $rate = (int) round(($completed / $started) * 100);
            $insights[] = [
                'label' => 'Sort finish rate',
                'value' => "{$rate}%",
                'description' => sprintf(
                    '%s finished of %s started%s.',
                    number_format($completed),
                    number_format($started),
                    $failed > 0 ? ' · ' . number_format($failed) . ' cancelled' : ''
                ),
            ];
        }

        $events = (int) ($summary['total_events'] ?? 0);
        $devices = (int) ($summary['active_devices'] ?? 0);
        if ($devices > 0 && $events > 0) {
            $avg = round($events / $devices, 1);
            $insights[] = [
                'label' => 'Events per device',
                'value' => (string) $avg,
                'description' => 'Average product events per active install in this period.',
            ];
        }

        return $insights;
    }
}
