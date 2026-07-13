<?php

declare(strict_types=1);

namespace DataSuite;

/** Session-based login for internal team access. */
final class Auth
{
    private const SESSION_KEY = 'datasuite_authenticated';

    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        $name = Config::get('SESSION_NAME', 'datasuite_session');
        session_name($name);
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => true,
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        session_start();
    }

    public static function isAuthenticated(): bool
    {
        self::startSession();
        return !empty($_SESSION[self::SESSION_KEY]);
    }

    public static function login(string $password): bool
    {
        self::startSession();
        $hash = Config::get('ADMIN_PASSWORD_HASH');
        if ($hash === '') {
            return false;
        }
        if (!password_verify($password, self::normalizeBcryptHash($hash))) {
            return false;
        }
        session_regenerate_id(true);
        $_SESSION[self::SESSION_KEY] = true;
        return true;
    }

    public static function logout(): void
    {
        self::startSession();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                time() - 42000,
                $params['path'],
                $params['domain'] ?? '',
                (bool) $params['secure'],
                (bool) $params['httponly']
            );
        }
        session_destroy();
    }

    /** bcryptjs emits $2b$; PHP password_verify expects $2y$ (same algorithm). */
    private static function normalizeBcryptHash(string $hash): string
    {
        if (str_starts_with($hash, '$2b$')) {
            return '$2y$' . substr($hash, 4);
        }
        return $hash;
    }

    public static function requireSession(): void
    {
        if (!self::isAuthenticated()) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
    }
}
