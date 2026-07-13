<?php

declare(strict_types=1);

namespace DataSuite;

/** Allowlisted dashboard time windows (days). */
final class Period
{
    /** @var list<int> */
    private const ALLOWED = [7, 30, 90];

    public static function fromRequest(): int
    {
        $raw = $_GET['days'] ?? '30';
        $days = (int) $raw;
        return in_array($days, self::ALLOWED, true) ? $days : 30;
    }

    /**
     * @param list<int> $allowed
     */
    public static function weeksFromRequest(array $allowed, int $default): int
    {
        $raw = $_GET['weeks'] ?? (string) $default;
        $weeks = (int) $raw;
        return in_array($weeks, $allowed, true) ? $weeks : $default;
    }

    /** @return list<int> */
    public static function allowed(): array
    {
        return self::ALLOWED;
    }
}
