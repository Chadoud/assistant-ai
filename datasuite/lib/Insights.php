<?php

declare(strict_types=1);

namespace DataSuite;

/** Plain-language summaries for dashboard panels. */
final class Insights
{
    /**
     * @param array<string, mixed> $summary
     */
    public static function overviewHeadline(array $summary, int $days): string
    {
        $devices = (int) ($summary['active_devices'] ?? 0);
        $signedIn = (int) ($summary['signed_in_users'] ?? 0);
        $crashes = (int) ($summary['crashes'] ?? 0);
        $jobs = (int) ($summary['jobs_started'] ?? 0);

        $parts = [
            sprintf('%s active device%s', number_format($devices), $devices === 1 ? '' : 's'),
            sprintf('%s signed in', number_format($signedIn)),
        ];
        if ($jobs > 0) {
            $parts[] = sprintf('%s sort%s started', number_format($jobs), $jobs === 1 ? '' : 's');
        }
        if ($crashes > 0) {
            $parts[] = sprintf('%s crash%s', number_format($crashes), $crashes === 1 ? '' : 'es');
        }
        if ($devices === 0 && $signedIn === 0) {
            return sprintf('No opt-in activity in the last %d days — normal during early beta.', $days);
        }
        return implode(' · ', $parts);
    }

    /**
     * @param array<string, mixed> $conversion
     */
    public static function funnelHeadline(array $conversion, int $days): string
    {
        $starts = (int) ($conversion['starts'] ?? 0);
        $jobs = (int) ($conversion['jobs_started'] ?? 0);
        $completed = (int) ($conversion['jobs_completed'] ?? 0);
        if ($starts <= 0) {
            return sprintf('No app starts in the last %d days.', $days);
        }
        if ($completed > 0) {
            return sprintf(
                '%s starts → %s sorts finished in %d days.',
                number_format($starts),
                number_format($completed),
                $days
            );
        }
        if ($jobs > 0) {
            return sprintf(
                '%s starts → %s sorts started — none finished yet.',
                number_format($starts),
                number_format($jobs)
            );
        }
        return sprintf(
            '%s starts — no sort jobs yet. Biggest gap: before first drop.',
            number_format($starts)
        );
    }

    /**
     * @param int|float|string|null $current
     * @param int|float|string|null $previous
     * @return array{direction: string, label: string}|null
     */
    public static function delta($current, $previous): ?array
    {
        $cur = (int) $current;
        $prev = (int) $previous;
        if ($cur === $prev) {
            return ['direction' => 'flat', 'label' => 'same as prior period'];
        }
        if ($prev <= 0) {
            return $cur > 0
                ? ['direction' => 'up', 'label' => 'new this period']
                : null;
        }
        $pct = (int) round((($cur - $prev) / $prev) * 100);
        if ($pct > 0) {
            return ['direction' => 'up', 'label' => "+{$pct}% vs prior period"];
        }
        return ['direction' => 'down', 'label' => "{$pct}% vs prior period"];
    }

    /**
     * @param array<string, int> $summary
     */
    public static function qualityHeadline(array $summary, int $days): string
    {
        $crashes = (int) ($summary['crashes'] ?? 0);
        if ($crashes <= 0) {
            return sprintf('No crashes reported in the last %d days.', $days);
        }
        return sprintf(
            '%s crash report%s in the last %d days — check release health below.',
            number_format($crashes),
            $crashes === 1 ? '' : 's',
            $days
        );
    }

    /**
     * @param list<array<string, mixed>> $inbox
     */
    public static function feedbackHeadline(array $inbox, int $days): string
    {
        $count = count($inbox);
        if ($count <= 0) {
            return sprintf('No user feedback in the last %d days.', $days);
        }
        $categories = [];
        foreach ($inbox as $row) {
            $cat = (string) ($row['category'] ?? 'other');
            $categories[$cat] = ($categories[$cat] ?? 0) + 1;
        }
        arsort($categories);
        $top = array_key_first($categories);
        return sprintf(
            '%s submission%s in %d days — most common: %s.',
            number_format($count),
            $count === 1 ? '' : 's',
            $days,
            $top ?? 'other'
        );
    }

    /**
     * @param list<array<string, mixed>> $trends
     */
    public static function trendsHeadline(array $trends, int $days): string
    {
        if ($trends === []) {
            return sprintf('No device activity in the last %d days.', $days);
        }
        $peak = 0;
        $peakDay = '';
        foreach ($trends as $row) {
            $devices = (int) ($row['devices'] ?? 0);
            if ($devices >= $peak) {
                $peak = $devices;
                $peakDay = (string) ($row['day'] ?? '');
            }
        }
        if ($peak <= 0) {
            return sprintf('Devices seen in period but no daily peaks yet (%dd window).', $days);
        }
        $dayLabel = $peakDay !== '' ? substr($peakDay, 0, 10) : 'recent day';
        return sprintf(
            'Peak %s active device%s on %s (%dd window).',
            number_format($peak),
            $peak === 1 ? '' : 's',
            $dayLabel,
            $days
        );
    }
}
