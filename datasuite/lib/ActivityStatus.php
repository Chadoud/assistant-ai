<?php

declare(strict_types=1);

namespace DataSuite;

/** Human labels for activity / retention status codes. */
final class ActivityStatus
{
    /** @var array<string, string> */
    public const LABELS = [
        'active' => 'Active',
        'silent' => 'Silent',
        'likely_churned' => 'Likely stopped',
        'new' => 'New',
    ];

    /** @var list<string> */
    public const FILTERABLE = ['active', 'silent', 'likely_churned', 'new'];

    public static function label(string $status): string
    {
        return self::LABELS[$status] ?? ucfirst(str_replace('_', ' ', $status));
    }

    public static function isFilterable(string $status): bool
    {
        return in_array($status, self::FILTERABLE, true);
    }
}
