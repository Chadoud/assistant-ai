<?php

declare(strict_types=1);

namespace DataSuite;

/** Loads configuration from Infomaniak panel env or docroot `.env`. */
final class Config
{
    private static ?array $values = null;

    /** @return array<string, string> */
    public static function all(): array
    {
        if (self::$values !== null) {
            return self::$values;
        }

        self::loadEnvFile();
        self::$values = [
            'DB_HOST' => self::env('DB_HOST', 'localhost'),
            'DB_PORT' => self::env('DB_PORT', '3306'),
            'DB_NAME' => self::env('DB_NAME', ''),
            'DB_USER' => self::env('DB_USER', ''),
            'DB_PASSWORD' => self::env('DB_PASSWORD', ''),
            'ADMIN_PASSWORD_HASH' => self::env('ADMIN_PASSWORD_HASH', ''),
            'SESSION_NAME' => self::env('SESSION_NAME', 'datasuite_session'),
        ];

        return self::$values;
    }

    public static function get(string $key, string $default = ''): string
    {
        return self::all()[$key] ?? $default;
    }

    private static function loadEnvFile(): void
    {
        $path = dirname(__DIR__) . '/.env';
        if (!is_readable($path)) {
            return;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value, " \t\"'");
            if ($key !== '' && getenv($key) === false) {
                putenv("{$key}={$value}");
                $_ENV[$key] = $value;
            }
        }
    }

    private static function env(string $key, string $default): string
    {
        $value = getenv($key);
        if ($value === false || $value === '') {
            return $default;
        }
        return trim($value);
    }
}
