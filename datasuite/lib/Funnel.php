<?php

declare(strict_types=1);

namespace DataSuite;

/** Funnel conversion helpers (fixed event names only). */
final class Funnel
{
    /** @var list<string> */
    public const SORT_STEPS = [
        'app_started',
        'welcome_completed',
        'first_drop',
        'job_started',
        'job_completed',
        'job_cancelled',
        'job_failed',
        'sort_blocked',
        'post_run_cta_clicked',
    ];

    /** @var list<string> */
    public const ONBOARDING_STEPS = [
        'app_started',
        'welcome_step_viewed',
        'welcome_completed',
        'welcome_dismissed',
        'first_drop',
    ];

    /** @var list<string> */
    public const SETUP_MILESTONE_STEPS = [
        'welcome_completed',
        'output_folder_set',
        'model_ready',
        'telemetry_on',
        'account_linked',
    ];

    /**
     * @param list<array{milestone: string, label: string, unique_installs: int}> $milestones
     * @return list<array{milestone: string, label: string, unique_installs: int, pct_of_start: float|null}>
     */
    public static function setupMilestoneWaterfall(array $milestones, int $appStarts = 0): array
    {
        $byName = [];
        foreach ($milestones as $row) {
            $name = (string) ($row['milestone'] ?? '');
            if ($name === '') {
                continue;
            }
            $byName[$name] = [
                'label' => (string) ($row['label'] ?? $name),
                'unique_installs' => (int) ($row['unique_installs'] ?? 0),
            ];
        }
        $baseline = $appStarts > 0 ? $appStarts : max(
            1,
            ...array_map(static fn (array $row): int => $row['unique_installs'], $byName)
        );
        $out = [];
        foreach (self::SETUP_MILESTONE_STEPS as $name) {
            if (!isset($byName[$name])) {
                continue;
            }
            $row = $byName[$name];
            $count = $row['unique_installs'];
            $out[] = [
                'milestone' => $name,
                'label' => $row['label'],
                'unique_installs' => $count,
                'pct_of_start' => round(($count / $baseline) * 100, 1),
            ];
        }

        return $out;
    }

    /**
     * @param array<string, mixed>|null $conversion
     * @return array<string, float|null>
     */
    public static function conversionRates(?array $conversion): array
    {
        if ($conversion === null) {
            return [];
        }
        $starts = (int) ($conversion['starts'] ?? 0);
        if ($starts <= 0) {
            return [];
        }
        $drops = (int) ($conversion['first_drops'] ?? 0);
        $jobs = (int) ($conversion['jobs_started'] ?? 0);
        $completed = (int) ($conversion['jobs_completed'] ?? 0);
        return [
            'start_to_welcome' => self::percent($conversion['welcome_completed'] ?? 0, $starts),
            'start_to_drop' => self::percent($drops, $starts),
            'drop_to_job' => self::percent($jobs, $drops),
            'job_to_complete' => self::percent($completed, $jobs),
            'job_to_cancel' => self::percent($conversion['jobs_cancelled'] ?? 0, $jobs),
            'job_to_fail' => self::percent($conversion['jobs_failed'] ?? 0, $jobs),
            'complete_to_cta' => self::percent(
                $conversion['post_run_cta'] ?? 0,
                $completed > 0 ? $completed : $jobs
            ),
        ];
    }

    /**
     * @param list<array{event_name: string, events: int}> $steps
     * @return list<array{event_name: string, events: int, label: string, pct_of_start: float|null}>
     */
    public static function waterfall(array $steps, string $baselineEvent = 'app_started'): array
    {
        $byName = [];
        foreach ($steps as $step) {
            $byName[$step['event_name']] = (int) $step['events'];
        }
        $baseline = max($byName[$baselineEvent] ?? 0, 1);
        $out = [];
        foreach (self::SORT_STEPS as $name) {
            if (!isset($byName[$name])) {
                continue;
            }
            $count = $byName[$name];
            $out[] = [
                'event_name' => $name,
                'events' => $count,
                'label' => MetricCatalog::eventLabel($name),
                'pct_of_start' => round(($count / $baseline) * 100, 1),
            ];
        }
        return $out;
    }

    /** @param int|float|string|null $numerator */
    private static function percent($numerator, int $denominator): ?float
    {
        $n = (int) $numerator;
        if ($denominator <= 0) {
            return null;
        }
        return round(($n / $denominator) * 100, 1);
    }
}
