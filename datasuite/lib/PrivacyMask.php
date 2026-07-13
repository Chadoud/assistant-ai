<?php

declare(strict_types=1);

namespace DataSuite;

/** Mask email for internal dashboard display. */
final class PrivacyMask
{
    public static function email(string $email): string
    {
        $email = trim($email);
        if ($email === '' || !str_contains($email, '@')) {
            return '***';
        }
        [$local, $domain] = explode('@', $email, 2);
        $first = $local !== '' ? $local[0] : '*';

        return $first . '***@' . $domain;
    }

    /** Human-readable label from account name fields (internal dashboard). */
    public static function displayName(?string $firstName, ?string $lastName): ?string
    {
        $first = trim((string) $firstName);
        $last = trim((string) $lastName);
        if ($first !== '' && $last !== '') {
            return $first . ' ' . $last;
        }
        if ($first !== '') {
            return $first;
        }
        if ($last !== '') {
            return $last;
        }

        return null;
    }
}
