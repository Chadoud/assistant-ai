<?php

declare(strict_types=1);

namespace DataSuite;

use PDO;
use PDOException;

/** Read-only MariaDB connection for dashboard queries. */
final class Database
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $host = Config::get('DB_HOST', 'localhost');
        $port = Config::get('DB_PORT', '3306');
        $name = Config::get('DB_NAME');
        $user = Config::get('DB_USER');
        $pass = Config::get('DB_PASSWORD');

        if ($name === '' || $user === '') {
            throw new PDOException('Database not configured (DB_NAME / DB_USER).');
        }

        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $host, $port, $name);
        self::$pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            // Match cloud-node pool (utf8mb4_unicode_ci) — avoids 1267 on view/literal compares.
            PDO::MYSQL_ATTR_INIT_COMMAND => 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci',
        ]);

        return self::$pdo;
    }

    /** @return array{ok: bool, message?: string} */
    public static function ping(): array
    {
        try {
            self::pdo()->query('SELECT 1');
            return ['ok' => true];
        } catch (PDOException $e) {
            return ['ok' => false, 'message' => 'Database unreachable'];
        }
    }
}
