<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/init.php';

use DataSuite\Auth;
use DataSuite\Queries;
use DataSuite\Period;

function datasuite_require_auth(): void
{
    Auth::requireSession();
}

/**
 * @param callable(Queries, int): array<string, mixed> $handler
 */
function datasuite_api(callable $handler): void
{
    datasuite_require_auth();
    $days = Period::fromRequest();
    try {
        $payload = $handler(datasuite_queries(), $days);
        $payload['period_days'] = $days;
        $payload['updated_at'] = gmdate('c');
        json_response($payload);
    } catch (Throwable $e) {
        error_log('[datasuite] ' . $e->getMessage());
        json_response(['error' => 'Query failed'], 500);
    }
}
