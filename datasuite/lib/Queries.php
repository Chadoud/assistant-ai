<?php

declare(strict_types=1);

namespace DataSuite;

use PDO;

/** Fixed SQL against named views/tables — dynamic windows use allowlisted day counts only. */
final class Queries
{
    /** @var list<string> */
    private const FUNNEL_EVENTS = [
        'app_started',
        'first_drop',
        'job_started',
        'job_completed',
        'job_cancelled',
        'job_failed',
        'sort_blocked',
        'post_run_cta_clicked',
        'feedback_submitted',
        'welcome_completed',
    ];

    /** @var list<string> */
    private const ONBOARDING_EVENTS = [
        'app_started',
        'welcome_step_viewed',
        'welcome_completed',
        'welcome_dismissed',
        'first_drop',
    ];

    /** @var list<string> */
    public const METRIC_KEYS = [
        'active_devices',
        'signed_in_users',
        'total_events',
        'jobs_started',
        'jobs_completed',
        'feedback',
        'crashes',
        'new_accounts',
    ];

    /** @var array<string, string> */
    private const METRIC_LABELS = [
        'active_devices' => 'Active devices',
        'signed_in_users' => 'Signed-in users',
        'total_events' => 'Product events',
        'jobs_started' => 'Sorts started',
        'jobs_completed' => 'Sorts finished',
        'feedback' => 'Feedback',
        'crashes' => 'Crashes',
        'new_accounts' => 'New accounts',
    ];

    public static function isMetricKey(string $key): bool
    {
        return in_array($key, self::METRIC_KEYS, true);
    }

    public static function metricLabel(string $key): string
    {
        return MetricCatalog::metric($key)['label'];
    }

    /**
     * @return list<array{event_name: string, label: string, events: int}>
     */
    public function eventBreakdown(int $days): array
    {
        $sql = 'SELECT event_name, COUNT(*) AS events
                FROM telemetry_events
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)' . TelemetryFilter::SQL . '
                GROUP BY event_name
                ORDER BY events DESC';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([$days]);
        $rows = $stmt->fetchAll();
        $out = [];
        foreach ($rows as $row) {
            $name = (string) $row['event_name'];
            $out[] = [
                'event_name' => $name,
                'label' => MetricCatalog::eventLabel($name),
                'events' => (int) $row['events'],
            ];
        }
        return $out;
    }

    /**
     * Daily values for overview drill-down charts.
     *
     * @return list<array{day: string, value: int}>
     */
    public function metricDailySeries(string $key, int $days): array
    {
        if (!self::isMetricKey($key)) {
            return [];
        }

        return match ($key) {
            'active_devices' => $this->filteredDeviceDaily($days, 'devices'),
            'signed_in_users' => $this->filteredDeviceDaily($days, 'signed_in_users'),
            'total_events' => $this->filteredEventVolumeDaily($days),
            'jobs_started' => $this->dailyEventSeries('job_started', $days),
            'jobs_completed' => $this->dailyEventSeries('job_completed', $days),
            'feedback' => $this->dailyFeedbackSeries($days),
            'crashes' => $this->dailyCrashSeries($days),
            'new_accounts' => $this->dailyNewAccountsSeries($days),
            default => [],
        };
    }

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @return array<string, int>
     */
    public function execSummary(int $days): array
    {
        return $this->periodMetrics($days, 0);
    }

    /**
     * @return array<string, int>
     */
    public function execSummaryPrevious(int $days): array
    {
        return $this->periodMetrics($days, $days);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function funnelConversion(int $days): ?array
    {
        $filter = TelemetryFilter::SQL;
        $sql = <<<SQL
SELECT
  SUM(CASE WHEN event_name = 'app_started' THEN 1 ELSE 0 END) AS starts,
  SUM(CASE WHEN event_name = 'welcome_completed' THEN 1 ELSE 0 END) AS welcome_completed,
  SUM(CASE WHEN event_name = 'first_drop' THEN 1 ELSE 0 END) AS first_drops,
  SUM(CASE WHEN event_name = 'job_started' THEN 1 ELSE 0 END) AS jobs_started,
  SUM(CASE WHEN event_name = 'job_completed' THEN 1 ELSE 0 END) AS jobs_completed,
  SUM(CASE
    WHEN event_name = 'job_cancelled' THEN 1
    WHEN event_name = 'job_failed'
      AND JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.follow_up')) = 'cancelled' THEN 1
    ELSE 0
  END) AS jobs_cancelled,
  SUM(CASE
    WHEN event_name = 'job_failed'
      AND (JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.follow_up')) IS NULL
        OR JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.follow_up')) <> 'cancelled') THEN 1
    ELSE 0
  END) AS jobs_failed,
  SUM(CASE WHEN event_name = 'sort_blocked' THEN 1 ELSE 0 END) AS sort_blocked,
  SUM(CASE WHEN event_name = 'post_run_cta_clicked' THEN 1 ELSE 0 END) AS post_run_cta,
  SUM(CASE WHEN event_name = 'feedback_submitted' THEN 1 ELSE 0 END) AS feedback_events
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
  {$filter}
  AND event_name IN (
    'app_started', 'welcome_completed', 'first_drop', 'job_started',
    'job_completed', 'job_cancelled', 'job_failed', 'sort_blocked',
    'post_run_cta_clicked', 'feedback_submitted'
  )
SQL;
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([$days]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return list<array{event_name: string, events: int}> */
    public function sortFunnel(int $days): array
    {
        return $this->eventsByName($days, self::FUNNEL_EVENTS);
    }

    /** @return list<array{event_name: string, events: int}> */
    public function onboardingFunnel(int $days): array
    {
        return $this->eventsByName($days, self::ONBOARDING_EVENTS);
    }

    /** @return list<array<string, mixed>> */
    public function crashDaily(int $days = 14): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT day, source, app_version, crashes, unique_signatures
             FROM v_crash_daily
             WHERE day >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
             ORDER BY day DESC, crashes DESC'
        );
        $stmt->execute([$days]);
        return $stmt->fetchAll();
    }

    /** @return list<array<string, mixed>> */
    public function topCrashSignatures(int $days = 30): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT signature, app_version, source, crashes, last_seen
             FROM v_top_crash_signatures_30d
             WHERE last_seen >= DATE_SUB(NOW(), INTERVAL ? DAY)
             ORDER BY crashes DESC
             LIMIT 25'
        );
        $stmt->execute([$days]);
        return $stmt->fetchAll();
    }

    /** @return list<array<string, mixed>> */
    public function releaseHealth(int $days = 14): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT app_version, crashes, unique_signatures, first_crash, last_crash
             FROM v_release_health_14d
             WHERE last_crash >= DATE_SUB(NOW(), INTERVAL ? DAY)
             ORDER BY crashes DESC'
        );
        $stmt->execute([$days]);
        return $stmt->fetchAll();
    }

    /** @return list<array<string, mixed>> */
    public function releaseCrashRates(int $days = 14): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT
               r.app_version,
               r.crashes,
               COALESCE(s.starts, 0) AS starts,
               CASE
                 WHEN COALESCE(s.starts, 0) > 0
                 THEN ROUND(r.crashes / s.starts * 100, 2)
                 ELSE NULL
               END AS crashes_per_100_starts
             FROM v_release_health_14d r
             LEFT JOIN v_release_starts_14d s ON s.app_version = r.app_version
             WHERE r.last_crash >= DATE_SUB(NOW(), INTERVAL ? DAY)
             ORDER BY r.crashes DESC'
        );
        $stmt->execute([$days]);
        return $stmt->fetchAll();
    }

    /** @return list<array<string, mixed>> */
    public function feedbackInbox(int $days, int $limit = 50): array
    {
        $filter = TelemetryFilter::FEEDBACK_SQL;
        $stmt = $this->pdo->prepare(
            "SELECT id, created_at, category, locale, app_version, account_id,
                    LEFT(message, 240) AS message_preview, message
             FROM product_feedback
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
               {$filter}
             ORDER BY created_at DESC
             LIMIT ?"
        );
        $stmt->bindValue(1, $days, PDO::PARAM_INT);
        $stmt->bindValue(2, $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    /** @return list<array<string, mixed>> */
    public function feedbackWeekly(): array
    {
        $stmt = $this->pdo->query(
            'SELECT year_week, week_start, category, submissions
             FROM v_feedback_weekly_12w
             ORDER BY week_start DESC, submissions DESC'
        );
        return $stmt->fetchAll();
    }

    /** @return list<array<string, mixed>> */
    public function feedbackWeeklyTotals(): array
    {
        $stmt = $this->pdo->query(
            'SELECT week_start, submissions
             FROM v_feedback_submissions_weekly
             ORDER BY week_start ASC'
        );
        return $stmt->fetchAll();
    }

    /** @return list<array<string, mixed>> */
    public function dailyActiveDevices(int $days): array
    {
        $filter = TelemetryFilter::SQL;
        $stmt = $this->pdo->prepare(
            "SELECT DATE(created_at) AS day,
                    COUNT(DISTINCT instance_id) AS devices,
                    COUNT(DISTINCT account_id) AS signed_in_users
             FROM telemetry_events
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
               {$filter}
             GROUP BY DATE(created_at)
             ORDER BY day ASC"
        );
        $stmt->execute([$days]);
        return $stmt->fetchAll();
    }

    /** @return list<array<string, mixed>> */
    public function signedInVsAnonymous(int $days): array
    {
        $filter = TelemetryFilter::SQL;
        $stmt = $this->pdo->prepare(
            "SELECT DATE(created_at) AS day,
                    SUM(account_id IS NOT NULL) AS signed_in_events,
                    SUM(account_id IS NULL) AS anonymous_events
             FROM telemetry_events
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
               {$filter}
             GROUP BY DATE(created_at)
             ORDER BY day ASC"
        );
        $stmt->execute([$days]);
        return $stmt->fetchAll();
    }

    /** @return list<array{day: string, value: int}> */
    public function sparklineDevices(int $days): array
    {
        return $this->filteredDeviceDaily($days, 'devices');
    }

    /** @return list<array{day: string, value: int}> */
    public function sparklineEvents(int $days): array
    {
        return $this->filteredEventVolumeDaily($days);
    }

    /**
     * @param list<string> $eventNames
     * @return list<array{event_name: string, events: int}>
     */
    private function eventsByName(int $days, array $eventNames): array
    {
        $filter = TelemetryFilter::SQL;
        $placeholders = implode(', ', array_fill(0, count($eventNames), '?'));
        $sql = "SELECT event_name, COUNT(*) AS events
                FROM telemetry_events
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                  {$filter}
                  AND event_name IN ({$placeholders})
                GROUP BY event_name";
        $stmt = $this->pdo->prepare($sql);
        $params = array_merge([$days], $eventNames);
        $stmt->execute($params);
        /** @var list<array{event_name: string, events: int}> */
        return $stmt->fetchAll();
    }

    /**
     * @return array<string, int>
     */
    private function periodMetrics(int $days, int $offsetDays): array
    {
        $tf = TelemetryFilter::SQL;
        $ff = TelemetryFilter::FEEDBACK_SQL;
        $cf = CrashFilter::SQL;
        $sql = <<<SQL
SELECT
  (SELECT COUNT(DISTINCT instance_id)
   FROM telemetry_events
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? + ? DAY)
     AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY){$tf}) AS active_devices,
  (SELECT COUNT(DISTINCT account_id)
   FROM telemetry_events
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? + ? DAY)
     AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
     AND account_id IS NOT NULL{$tf}) AS signed_in_users,
  (SELECT COUNT(*)
   FROM telemetry_events
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? + ? DAY)
     AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY){$tf}) AS total_events,
  (SELECT COUNT(*)
   FROM product_feedback
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? + ? DAY)
     AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY){$ff}) AS feedback,
  (SELECT COUNT(*)
   FROM crash_reports
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? + ? DAY)
     AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY){$cf}) AS crashes,
  (SELECT COUNT(*)
   FROM accounts
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? + ? DAY)
     AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
     AND email COLLATE utf8mb4_unicode_ci NOT LIKE '%@example.com'
     AND email COLLATE utf8mb4_unicode_ci != 'a@b.com') AS new_accounts,
  (SELECT COUNT(*)
   FROM telemetry_events
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? + ? DAY)
     AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
     AND event_name = 'job_started'{$tf}) AS jobs_started,
  (SELECT COUNT(*)
   FROM telemetry_events
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? + ? DAY)
     AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
     AND event_name = 'job_completed'{$tf}) AS jobs_completed,
  (SELECT COUNT(*)
   FROM telemetry_events
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? + ? DAY)
     AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
     AND event_name = 'job_failed'{$tf}) AS jobs_failed
SQL;
        $bind = [];
        for ($i = 0; $i < 9; $i++) {
            $bind[] = $days;
            $bind[] = $offsetDays;
            $bind[] = $offsetDays;
        }
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($bind);
        $row = $stmt->fetch();
        if ($row === false) {
            return [];
        }
        /** @var array<string, int> */
        return array_map(static fn ($v) => (int) $v, $row);
    }

    /**
     * @return list<array{day: string, value: int}>
     */
    private function dailySeriesFromView(string $view, string $column, int $days): array
    {
        $allowed = [
            'v_daily_active_devices' => ['devices', 'signed_in_users'],
            'v_event_volume_daily' => ['events'],
        ];
        if (!isset($allowed[$view]) || !in_array($column, $allowed[$view], true)) {
            return [];
        }
        $stmt = $this->pdo->prepare(
            "SELECT day, {$column} AS value
             FROM {$view}
             WHERE day >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
             ORDER BY day ASC"
        );
        $stmt->execute([$days]);
        /** @var list<array{day: string, value: int}> */
        return $stmt->fetchAll();
    }

    /**
     * @return list<array{day: string, value: int}>
     */
    private function dailyEventSeries(string $eventName, int $days): array
    {
        $filter = TelemetryFilter::SQL;
        $stmt = $this->pdo->prepare(
            "SELECT DATE(created_at) AS day, COUNT(*) AS value
             FROM telemetry_events
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
               AND event_name = ?
               {$filter}
             GROUP BY DATE(created_at)
             ORDER BY day ASC"
        );
        $stmt->execute([$days, $eventName]);
        /** @var list<array{day: string, value: int}> */
        return $stmt->fetchAll();
    }

    /**
     * @return list<array{day: string, value: int}>
     */
    private function filteredDeviceDaily(int $days, string $column): array
    {
        if (!in_array($column, ['devices', 'signed_in_users'], true)) {
            return [];
        }
        $filter = TelemetryFilter::SQL;
        $expr = $column === 'devices'
            ? 'COUNT(DISTINCT instance_id)'
            : 'COUNT(DISTINCT account_id)';
        $stmt = $this->pdo->prepare(
            "SELECT DATE(created_at) AS day, {$expr} AS value
             FROM telemetry_events
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
               {$filter}
             GROUP BY DATE(created_at)
             ORDER BY day ASC"
        );
        $stmt->execute([$days]);
        /** @var list<array{day: string, value: int}> */
        return $stmt->fetchAll();
    }

    /**
     * @return list<array{day: string, value: int}>
     */
    private function filteredEventVolumeDaily(int $days): array
    {
        $filter = TelemetryFilter::SQL;
        $stmt = $this->pdo->prepare(
            "SELECT DATE(created_at) AS day, COUNT(*) AS value
             FROM telemetry_events
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
               {$filter}
             GROUP BY DATE(created_at)
             ORDER BY day ASC"
        );
        $stmt->execute([$days]);
        /** @var list<array{day: string, value: int}> */
        return $stmt->fetchAll();
    }

    /**
     * @return list<array{day: string, value: int}>
     */
    private function dailyFeedbackSeries(int $days): array
    {
        $filter = TelemetryFilter::FEEDBACK_SQL;
        $stmt = $this->pdo->prepare(
            "SELECT DATE(created_at) AS day, COUNT(*) AS value
             FROM product_feedback
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
               {$filter}
             GROUP BY DATE(created_at)
             ORDER BY day ASC"
        );
        $stmt->execute([$days]);
        /** @var list<array{day: string, value: int}> */
        return $stmt->fetchAll();
    }

    /**
     * @return list<array{day: string, value: int}>
     */
    private function dailyCrashSeries(int $days): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT day, SUM(crashes) AS value
             FROM v_crash_daily
             WHERE day >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
             GROUP BY day
             ORDER BY day ASC'
        );
        $stmt->execute([$days]);
        /** @var list<array{day: string, value: int}> */
        return $stmt->fetchAll();
    }

    /**
     * Excludes automated verify / GA smoke registrations.
     *
     * @return list<array{day: string, value: int}>
     */
    private function dailyNewAccountsSeries(int $days): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT DATE(created_at) AS day, COUNT(*) AS value
             FROM accounts
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
               AND email COLLATE utf8mb4_unicode_ci NOT LIKE '%@example.com'
               AND email COLLATE utf8mb4_unicode_ci != 'ga-verify@exosites.ch'
             GROUP BY DATE(created_at)
             ORDER BY day ASC"
        );
        $stmt->execute([$days]);
        /** @var list<array{day: string, value: int}> */
        return $stmt->fetchAll();
    }

    /**
     * @return list<array{day: string, value: int}>
     */
    private function sparklineFromView(string $view, string $column, int $days): array
    {
        return $this->dailySeriesFromView($view, $column, $days);
    }

    /**
     * @return array{active: int, silent: int, likely_churned: int, new_installs: int, total: int}
     */
    public function activitySummary(): array
    {
        $stmt = $this->pdo->query(
            'SELECT
                SUM(status COLLATE utf8mb4_unicode_ci = \'active\') AS active,
                SUM(status COLLATE utf8mb4_unicode_ci = \'silent\') AS silent,
                SUM(status COLLATE utf8mb4_unicode_ci = \'likely_churned\') AS likely_churned,
                SUM(is_new = 1) AS new_installs,
                COUNT(*) AS total
             FROM v_device_activity'
        );
        $row = $stmt->fetch() ?: [];

        $deleted7d = 0;
        try {
            $delStmt = $this->pdo->query(
                'SELECT COUNT(*) AS n FROM accounts_deleted_at
                 WHERE deleted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
            );
            $deleted7d = (int) ($delStmt->fetch()['n'] ?? 0);
        } catch (\Throwable) {
            /* migration 010 not applied */
        }

        return [
            'active' => (int) ($row['active'] ?? 0),
            'silent' => (int) ($row['silent'] ?? 0),
            'likely_churned' => (int) ($row['likely_churned'] ?? 0),
            'new_installs' => (int) ($row['new_installs'] ?? 0),
            'total' => (int) ($row['total'] ?? 0),
            'accounts_deleted_7d' => $deleted7d,
        ];
    }

    /**
     * @return array{active: int, silent: int, likely_churned: int, total: int}
     */
    public function accountActivitySummary(): array
    {
        try {
            $stmt = $this->pdo->query(
                'SELECT
                    SUM(status COLLATE utf8mb4_unicode_ci = \'active\') AS active,
                    SUM(status COLLATE utf8mb4_unicode_ci = \'silent\') AS silent,
                    SUM(status COLLATE utf8mb4_unicode_ci = \'likely_churned\') AS likely_churned,
                    COUNT(*) AS total
                 FROM v_account_activity'
            );
            $row = $stmt->fetch() ?: [];
        } catch (\PDOException $e) {
            error_log('[datasuite] accountActivitySummary: ' . $e->getMessage());
            return ['active' => 0, 'silent' => 0, 'likely_churned' => 0, 'total' => 0];
        }

        return [
            'active' => (int) ($row['active'] ?? 0),
            'silent' => (int) ($row['silent'] ?? 0),
            'likely_churned' => (int) ($row['likely_churned'] ?? 0),
            'total' => (int) ($row['total'] ?? 0),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function deviceActivity(?string $status = null, int $limit = 200): array
    {
        $limit = max(1, min(500, $limit));
        $sql = 'SELECT instance_id, first_seen, last_seen, active_days, event_count,
                       last_app_version, last_platform, last_account_id, status, is_new
                FROM v_device_activity';
        $params = [];
        if ($status !== null && ActivityStatus::isFilterable($status)) {
            if ($status === 'new') {
                $sql .= ' WHERE is_new = 1';
            } else {
                $sql .= ' WHERE status COLLATE utf8mb4_unicode_ci = ?';
                $params[] = $status;
            }
        }
        $sql .= ' ORDER BY last_seen DESC LIMIT ' . $limit;
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'instance_id' => (string) ($row['instance_id'] ?? ''),
                'first_seen' => (string) ($row['first_seen'] ?? ''),
                'last_seen' => (string) ($row['last_seen'] ?? ''),
                'active_days' => (int) ($row['active_days'] ?? 0),
                'event_count' => (int) ($row['event_count'] ?? 0),
                'last_app_version' => (string) ($row['last_app_version'] ?? ''),
                'last_platform' => (string) ($row['last_platform'] ?? ''),
                'signed_in' => ($row['last_account_id'] ?? null) !== null,
                'status' => (string) ($row['status'] ?? ''),
                'status_label' => ActivityStatus::label((string) ($row['status'] ?? '')),
                'is_new' => (int) ($row['is_new'] ?? 0) === 1,
            ];
        }

        return $out;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function accountActivity(?string $status = null, int $limit = 100): array
    {
        $limit = max(1, min(200, $limit));
        $sql = 'SELECT account_id, email, first_name, last_name, first_seen, last_seen, device_count, event_count, status
                FROM v_account_activity';
        $params = [];
        if ($status !== null && ActivityStatus::isFilterable($status) && $status !== 'new') {
            $sql .= ' WHERE status COLLATE utf8mb4_unicode_ci = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY last_seen DESC LIMIT ' . $limit;
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $out = [];
        foreach ($rows as $row) {
            $email = (string) ($row['email'] ?? '');
            $displayName = PrivacyMask::displayName(
                isset($row['first_name']) ? (string) $row['first_name'] : null,
                isset($row['last_name']) ? (string) $row['last_name'] : null,
            );
            $out[] = [
                'account_id' => (string) ($row['account_id'] ?? ''),
                'email_masked' => PrivacyMask::email($email),
                'display_name' => $displayName,
                'first_seen' => (string) ($row['first_seen'] ?? ''),
                'last_seen' => (string) ($row['last_seen'] ?? ''),
                'device_count' => (int) ($row['device_count'] ?? 0),
                'event_count' => (int) ($row['event_count'] ?? 0),
                'status' => (string) ($row['status'] ?? ''),
                'status_label' => ActivityStatus::label((string) ($row['status'] ?? '')),
            ];
        }

        return $out;
    }

    /**
     * @return list<array{cohort_week: string, weeks_since: int, retained: int, cohort_size: int, rate_pct: float|null}>
     */
    public function retentionCohorts(int $weeks = 12): array
    {
        $weeks = max(1, min(12, $weeks));
        try {
            $stmt = $this->pdo->prepare(
                'SELECT cohort_week, weeks_since, retained_installs
                 FROM v_retention_weekly
                 WHERE weeks_since <= ?
                 ORDER BY cohort_week ASC, weeks_since ASC'
            );
            $stmt->execute([$weeks]);
            $rows = $stmt->fetchAll();
        } catch (\PDOException $e) {
            error_log('[datasuite] retentionCohorts: ' . $e->getMessage());
            return [];
        }
        $cohortSizes = [];
        foreach ($rows as $row) {
            if ((int) ($row['weeks_since'] ?? -1) === 0) {
                $cohortSizes[(string) $row['cohort_week']] = (int) ($row['retained_installs'] ?? 0);
            }
        }
        $out = [];
        foreach ($rows as $row) {
            $cohortWeek = (string) ($row['cohort_week'] ?? '');
            $weeksSince = (int) ($row['weeks_since'] ?? 0);
            $retained = (int) ($row['retained_installs'] ?? 0);
            $size = $cohortSizes[$cohortWeek] ?? 0;
            $rate = null;
            if ($size >= 5) {
                $rate = round(($retained / $size) * 100, 1);
            }
            $out[] = [
                'cohort_week' => $cohortWeek,
                'weeks_since' => $weeksSince,
                'retained' => $retained,
                'cohort_size' => $size,
                'rate_pct' => $rate,
            ];
        }

        return $out;
    }

    /**
     * @return array{instance_id: string, daily: list<array{day: string, events: int}>, events: list<array{event_name: string, label: string, events: int}>}
     */
    public function deviceActivityDetail(string $instanceId, int $days): array
    {
        $instanceId = trim($instanceId);
        if ($instanceId === '' || strlen($instanceId) > 128) {
            return ['instance_id' => '', 'daily' => [], 'events' => []];
        }
        $filter = TelemetryFilter::SQL;
        $dailyStmt = $this->pdo->prepare(
            "SELECT DATE(created_at) AS day, COUNT(*) AS events
             FROM telemetry_events
             WHERE instance_id = ?
               AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
               {$filter}
             GROUP BY DATE(created_at)
             ORDER BY day ASC"
        );
        $dailyStmt->execute([$instanceId, $days]);
        $daily = $dailyStmt->fetchAll();

        $eventStmt = $this->pdo->prepare(
            "SELECT event_name, COUNT(*) AS events
             FROM telemetry_events
             WHERE instance_id = ?
               AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
               {$filter}
             GROUP BY event_name
             ORDER BY events DESC"
        );
        $eventStmt->execute([$instanceId, $days]);
        $eventRows = $eventStmt->fetchAll();
        $events = [];
        foreach ($eventRows as $row) {
            $name = (string) ($row['event_name'] ?? '');
            $events[] = [
                'event_name' => $name,
                'label' => MetricCatalog::eventLabel($name),
                'events' => (int) ($row['events'] ?? 0),
            ];
        }

        return [
            'instance_id' => $instanceId,
            'daily' => $daily,
            'events' => $events,
            'sessions' => $this->sessionsForInstance($instanceId, $days),
            'crashes' => $this->crashesForInstance($instanceId, $days),
            'features' => $this->featureUsageForInstance($instanceId, $days),
        ];
    }

    /** @return list<array<string, mixed>> */
    public function sessionsForInstance(string $instanceId, int $days): array
    {
        try {
            $stmt = $this->pdo->prepare(
                'SELECT session_id, started_at, ended_at, app_version, platform, crashed, crash_id
                 FROM app_sessions
                 WHERE instance_id = ?
                   AND started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                 ORDER BY started_at DESC
                 LIMIT 30'
            );
            $stmt->execute([$instanceId, $days]);
            return $stmt->fetchAll();
        } catch (\PDOException) {
            return [];
        }
    }

    /** @return list<array<string, mixed>> */
    public function crashesForInstance(string $instanceId, int $days): array
    {
        $filter = CrashFilter::SQL;
        $stmt = $this->pdo->prepare(
            "SELECT id, created_at, source, active_feature, intent_bucket, tool_name,
                    LEFT(error_message, 120) AS preview, session_id
             FROM crash_reports
             WHERE instance_id = ?
               AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
               {$filter}
             ORDER BY created_at DESC
             LIMIT 20"
        );
        $stmt->execute([$instanceId, $days]);
        return $stmt->fetchAll();
    }

    /** @return list<array{feature: string, label: string, events: int}> */
    public function featureUsageForInstance(string $instanceId, int $days): array
    {
        $filter = TelemetryFilter::SQL;
        $stmt = $this->pdo->prepare(
            "SELECT JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.feature')) AS feature, COUNT(*) AS events
             FROM telemetry_events
             WHERE instance_id = ?
               AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
               AND event_name IN ('feature_entered', 'feature_exited')
               {$filter}
             GROUP BY JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.feature'))
             HAVING feature IS NOT NULL AND feature <> ''
             ORDER BY events DESC"
        );
        $stmt->execute([$instanceId, $days]);
        $rows = $stmt->fetchAll();
        $out = [];
        foreach ($rows as $row) {
            $feature = (string) ($row['feature'] ?? '');
            $out[] = [
                'feature' => $feature,
                'label' => ProductBrief::featureLabel($feature),
                'events' => (int) ($row['events'] ?? 0),
            ];
        }
        return $out;
    }

    private const TRIAGE_STATUSES = ['new', 'triaged', 'fixed', 'wontfix'];

    /**
     * @return array{ok: true, row: array<string, mixed>}|array{error: string}
     */
    public function updateCrashTriage(
        string $signature,
        string $status,
        ?string $notes = null,
        ?string $fixedInVersion = null,
    ): array {
        $signature = trim($signature);
        if ($signature === '' || strlen($signature) > 64) {
            return ['error' => 'invalid signature'];
        }
        if (!in_array($status, self::TRIAGE_STATUSES, true)) {
            return ['error' => 'invalid status'];
        }
        if ($status === 'fixed' && ($fixedInVersion === null || trim($fixedInVersion) === '')) {
            return ['error' => 'fixed_in_version required when status is fixed'];
        }

        $notesVal = $notes !== null && trim($notes) !== '' ? trim($notes) : null;
        $fixedVal = $fixedInVersion !== null && trim($fixedInVersion) !== '' ? trim($fixedInVersion) : null;
        if ($status !== 'fixed') {
            $fixedVal = null;
        }

        $stmt = $this->pdo->prepare(
            'UPDATE crash_triage
             SET status = ?, notes = ?, fixed_in_version = ?, updated_at = CURRENT_TIMESTAMP(6)
             WHERE crash_signature = ?'
        );
        $stmt->execute([$status, $notesVal, $fixedVal, $signature]);
        if ($stmt->rowCount() === 0) {
            return ['error' => 'not found'];
        }

        $fetch = $this->pdo->prepare(
            'SELECT crash_signature, status, notes, fixed_in_version, updated_at
             FROM crash_triage WHERE crash_signature = ? LIMIT 1'
        );
        $fetch->execute([$signature]);
        $row = $fetch->fetch();
        if (!$row) {
            return ['error' => 'not found'];
        }

        return ['ok' => true, 'row' => $row];
    }

    /** @return list<array<string, mixed>> */
    public function crashTriageInbox(int $limit = 30): array
    {
        $limit = max(1, min(100, $limit));
        try {
            $stmt = $this->pdo->query(
                'SELECT t.crash_signature, t.status, t.notes, t.fixed_in_version, t.updated_at,
                        COUNT(c.id) AS crashes_30d, MAX(c.created_at) AS last_crash
                 FROM crash_triage t
                 LEFT JOIN crash_reports c
                   ON c.crash_signature = t.crash_signature
                  AND c.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)' . CrashFilter::forAlias('c') . '
                 GROUP BY t.crash_signature, t.status, t.notes, t.fixed_in_version, t.updated_at
                 ORDER BY last_crash DESC, t.updated_at DESC
                 LIMIT ' . $limit
            );
            return $stmt->fetchAll();
        } catch (\PDOException) {
            return [];
        }
    }

    /** @return array<string, mixed>|null */
    public function accountProfile(string $accountId, int $days): ?array
    {
        $accountId = trim($accountId);
        if ($accountId === '') {
            return null;
        }
        $stmt = $this->pdo->prepare(
            'SELECT account_id, email, first_name, last_name, first_seen, last_seen, device_count, event_count, status
             FROM v_account_activity WHERE account_id = ? LIMIT 1'
        );
        $stmt->execute([$accountId]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        $row['display_name'] = PrivacyMask::displayName(
            isset($row['first_name']) ? (string) $row['first_name'] : null,
            isset($row['last_name']) ? (string) $row['last_name'] : null,
        );
        $row['email_masked'] = PrivacyMask::email((string) ($row['email'] ?? ''));
        unset($row['email'], $row['first_name'], $row['last_name']);

        try {
            $health = $this->pdo->prepare(
                'SELECT devices, sessions, crashed_sessions, last_session_at
                 FROM v_account_health_30d WHERE account_id = ? LIMIT 1'
            );
            $health->execute([$accountId]);
            $row['health'] = $health->fetch() ?: null;
        } catch (\PDOException) {
            $row['health'] = null;
        }

        $crashFilter = CrashFilter::SQL;
        $crashStmt = $this->pdo->prepare(
            "SELECT id, created_at, active_feature, intent_bucket, LEFT(error_message, 100) AS preview
             FROM crash_reports
             WHERE account_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
               {$crashFilter}
             ORDER BY created_at DESC LIMIT 15"
        );
        $crashStmt->execute([$accountId, $days]);
        $row['crashes'] = $crashStmt->fetchAll();

        return $row;
    }

    /** @return list<array<string, mixed>> */
    public function crashInbox(int $days = 30, int $limit = 50): array
    {
        $limit = max(1, min(100, $limit));
        try {
            $stmt = $this->pdo->prepare(
                'SELECT id, created_at, app_version, platform, source, source_detail,
                        active_feature, active_tab, intent_bucket, tool_name, session_id,
                        instance_id, account_id, crash_signature, signature_preview, has_breadcrumbs
                 FROM v_crash_inbox_30d
                 WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                 ORDER BY created_at DESC
                 LIMIT ' . $limit
            );
            $stmt->execute([$days]);
            return $stmt->fetchAll();
        } catch (\PDOException) {
            $filter = CrashFilter::SQL;
            $stmt = $this->pdo->prepare(
                "SELECT id, created_at, app_version, platform, source,
                        NULL AS source_detail, NULL AS active_feature, NULL AS active_tab,
                        NULL AS intent_bucket, NULL AS tool_name, NULL AS session_id,
                        NULL AS instance_id, NULL AS account_id, NULL AS crash_signature,
                        LEFT(error_message, 120) AS signature_preview, 0 AS has_breadcrumbs
                 FROM crash_reports
                 WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                   {$filter}
                 ORDER BY created_at DESC
                 LIMIT " . $limit
            );
            $stmt->execute([$days]);
            return $stmt->fetchAll();
        }
    }

    /** @return array<string, mixed>|null */
    public function crashById(int $id): ?array
    {
        if ($id <= 0) {
            return null;
        }
        $stmt = $this->pdo->prepare(
            'SELECT c.*, a.email AS account_email
             FROM crash_reports c
             LEFT JOIN accounts a
               ON a.id COLLATE utf8mb4_unicode_ci = c.account_id COLLATE utf8mb4_unicode_ci
             WHERE c.id = ?
             LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        if (!empty($row['account_email'])) {
            $row['account_email'] = PrivacyMask::email((string) $row['account_email']);
        }
        return $row;
    }

    /** @return list<array<string, mixed>> */
    public function telemetryForSession(string $sessionId, int $limit = 30): array
    {
        $sessionId = trim($sessionId);
        if ($sessionId === '') {
            return [];
        }
        $limit = max(1, min(100, $limit));
        try {
            $stmt = $this->pdo->prepare(
                'SELECT created_at, event_name, event_props, app_version, platform
                 FROM telemetry_events
                 WHERE session_id = ?
                 ORDER BY created_at DESC
                 LIMIT ' . $limit
            );
            $stmt->execute([$sessionId]);
            return $stmt->fetchAll();
        } catch (\PDOException) {
            return [];
        }
    }

    /** @return list<array<string, mixed>> */
    public function featureEngagement(int $days = 30): array
    {
        try {
            $stmt = $this->pdo->query('SELECT * FROM v_feature_engagement_30d ORDER BY entries DESC');
            return $stmt->fetchAll();
        } catch (\PDOException) {
            return $this->featureEngagementFallback($days);
        }
    }

    /** @return list<array<string, mixed>> */
    private function featureEngagementFallback(int $days): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT
               JSON_UNQUOTE(JSON_EXTRACT(event_props, "$.feature")) AS feature,
               SUM(CASE WHEN event_name = "feature_entered" THEN 1 ELSE 0 END) AS entries,
               SUM(CASE WHEN event_name = "feature_exited" THEN 1 ELSE 0 END) AS exits,
               0 AS bucket_0_5s, 0 AS bucket_5_30s, 0 AS bucket_30s_2m, 0 AS bucket_2_10m, 0 AS bucket_10m_plus
             FROM telemetry_events
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)' . TelemetryFilter::SQL . '
               AND event_name IN ("feature_entered", "feature_exited")
             GROUP BY JSON_UNQUOTE(JSON_EXTRACT(event_props, "$.feature"))
             HAVING feature IS NOT NULL AND feature <> ""
             ORDER BY entries DESC'
        );
        $stmt->execute([$days]);
        return $stmt->fetchAll();
    }

    /** @return array<string, int> */
    public function assistantOps(int $days = 30): array
    {
        try {
            $stmt = $this->pdo->query('SELECT * FROM v_assistant_ops_30d LIMIT 1');
            $row = $stmt->fetch();
            return $row ? array_map('intval', $row) : $this->emptyAssistantOps();
        } catch (\PDOException) {
            return $this->assistantOpsFallback($days);
        }
    }

    /** @return array<string, int> */
    private function emptyAssistantOps(): array
    {
        return [
            'turns_started' => 0,
            'turns_completed' => 0,
            'turns_failed' => 0,
            'provider_errors' => 0,
            'tools_invoked' => 0,
        ];
    }

    /** @return array<string, int> */
    private function assistantOpsFallback(int $days): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT
               SUM(CASE WHEN event_name = "assistant_turn_started" THEN 1 ELSE 0 END) AS turns_started,
               SUM(CASE WHEN event_name = "assistant_turn_completed" THEN 1 ELSE 0 END) AS turns_completed,
               SUM(CASE WHEN event_name = "assistant_turn_failed" THEN 1 ELSE 0 END) AS turns_failed,
               SUM(CASE WHEN event_name = "provider_error" THEN 1 ELSE 0 END) AS provider_errors,
               SUM(CASE WHEN event_name = "assistant_tool_invoked" THEN 1 ELSE 0 END) AS tools_invoked
             FROM telemetry_events
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)' . TelemetryFilter::SQL
        );
        $stmt->execute([$days]);
        $row = $stmt->fetch();
        return $row ? array_map('intval', $row) : $this->emptyAssistantOps();
    }

    /** @return list<array<string, mixed>> */
    public function assistantTools(int $limit = 10): array
    {
        $limit = max(1, min(25, $limit));
        try {
            $stmt = $this->pdo->query('SELECT tool_name, invocations FROM v_assistant_tools_30d LIMIT ' . $limit);
            return $stmt->fetchAll();
        } catch (\PDOException) {
            $stmt = $this->pdo->prepare(
                'SELECT JSON_UNQUOTE(JSON_EXTRACT(event_props, "$.tool_name")) AS tool_name, COUNT(*) AS invocations
                 FROM telemetry_events
                 WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)' . TelemetryFilter::SQL . '
                   AND event_name = "assistant_tool_invoked"
                 GROUP BY JSON_UNQUOTE(JSON_EXTRACT(event_props, "$.tool_name"))
                 HAVING tool_name IS NOT NULL AND tool_name <> ""
                 ORDER BY invocations DESC
                 LIMIT ' . $limit
            );
            $stmt->execute();
            return $stmt->fetchAll();
        }
    }

    /** @return list<array<string, mixed>> */
    public function crashByFeature(int $days = 30): array
    {
        try {
            $stmt = $this->pdo->query('SELECT feature, crashes, affected_sessions, last_seen FROM v_crash_by_feature_30d');
            return $stmt->fetchAll();
        } catch (\PDOException) {
            $filter = CrashFilter::SQL;
            $stmt = $this->pdo->prepare(
                "SELECT COALESCE(active_feature, 'unknown') AS feature, COUNT(*) AS crashes,
                        COUNT(DISTINCT session_id) AS affected_sessions, MAX(created_at) AS last_seen
                 FROM crash_reports
                 WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                   {$filter}
                 GROUP BY COALESCE(active_feature, 'unknown')
                 ORDER BY crashes DESC"
            );
            $stmt->execute([$days]);
            return $stmt->fetchAll();
        }
    }

    /** @return list<array<string, mixed>> */
    public function integrationHealth(): array
    {
        try {
            $stmt = $this->pdo->query('SELECT provider, connects_ok, connects_failed FROM v_integration_health_30d');
            return $stmt->fetchAll();
        } catch (\PDOException) {
            return [];
        }
    }

    /** @return list<array<string, mixed>> */
    public function messagingHealth(): array
    {
        try {
            $stmt = $this->pdo->query('SELECT platform, started, completed, failed FROM v_messaging_health_30d');
            return $stmt->fetchAll();
        } catch (\PDOException) {
            return [];
        }
    }

    /** @return list<array{category: string, count: int}> */
    public function feedbackByCategory(int $days = 30): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT category, COUNT(*) AS count
             FROM product_feedback
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)' . TelemetryFilter::FEEDBACK_SQL . '
             GROUP BY category
             ORDER BY count DESC'
        );
        $stmt->execute([$days]);
        return $stmt->fetchAll();
    }

    /**
     * Aggregated sort outcome quality from enriched job_completed events.
     *
     * @return array{
     *   jobs_completed: int,
     *   clean_jobs: int,
     *   uncertain_jobs: int,
     *   failure_jobs: int,
     *   high_uncertain_jobs: int,
     *   clean_rate_pct: float|null,
     *   messy_rate_pct: float|null
     * }
     */
    public function sortHealthSummary(int $days = 30): array
    {
        $days = max(1, min(90, $days));
        $empty = [
            'jobs_completed' => 0,
            'clean_jobs' => 0,
            'uncertain_jobs' => 0,
            'failure_jobs' => 0,
            'high_uncertain_jobs' => 0,
            'clean_rate_pct' => null,
            'messy_rate_pct' => null,
        ];
        try {
            $stmt = $this->pdo->prepare(
                'SELECT
                    COALESCE(SUM(jobs_completed), 0) AS jobs_completed,
                    COALESCE(SUM(clean_jobs), 0) AS clean_jobs,
                    COALESCE(SUM(uncertain_jobs), 0) AS uncertain_jobs,
                    COALESCE(SUM(failure_jobs), 0) AS failure_jobs,
                    COALESCE(SUM(high_uncertain_jobs), 0) AS high_uncertain_jobs
                 FROM v_sort_health_30d
                 WHERE day >= DATE_SUB(CURDATE(), INTERVAL ? DAY)'
            );
            $stmt->execute([$days]);
            $row = $stmt->fetch();
            if ($row === false) {
                return $empty;
            }
            $completed = (int) ($row['jobs_completed'] ?? 0);
            $clean = (int) ($row['clean_jobs'] ?? 0);
            $uncertain = (int) ($row['uncertain_jobs'] ?? 0);
            $failures = (int) ($row['failure_jobs'] ?? 0);
            $highUncertain = (int) ($row['high_uncertain_jobs'] ?? 0);
            $cleanRate = $completed > 0 ? round(($clean / $completed) * 100, 1) : null;
            $messy = $uncertain + $failures;
            $messyRate = $completed > 0 ? round(($messy / $completed) * 100, 1) : null;

            return [
                'jobs_completed' => $completed,
                'clean_jobs' => $clean,
                'uncertain_jobs' => $uncertain,
                'failure_jobs' => $failures,
                'high_uncertain_jobs' => $highUncertain,
                'clean_rate_pct' => $cleanRate,
                'messy_rate_pct' => $messyRate,
            ];
        } catch (\PDOException $e) {
            error_log('[datasuite] sortHealthSummary: ' . $e->getMessage());
            return $empty;
        }
    }

    /**
     * @return list<array{reason: string, label: string, blocks: int, unique_installs: int}>
     */
    public function sortBlockers(int $days = 30): array
    {
        $days = max(1, min(90, $days));
        try {
            $stmt = $this->pdo->prepare(
                'SELECT reason, blocks, unique_installs
                 FROM v_sort_blockers_30d
                 WHERE reason IS NOT NULL
                 ORDER BY blocks DESC
                 LIMIT 20'
            );
            $stmt->execute();
            $rows = $stmt->fetchAll();
        } catch (\PDOException $e) {
            error_log('[datasuite] sortBlockers: ' . $e->getMessage());
            return [];
        }
        $out = [];
        foreach ($rows as $row) {
            $reason = (string) ($row['reason'] ?? '');
            if ($reason === '') {
                continue;
            }
            $out[] = [
                'reason' => $reason,
                'label' => ProductBrief::sortBlockerLabel($reason),
                'blocks' => (int) ($row['blocks'] ?? 0),
                'unique_installs' => (int) ($row['unique_installs'] ?? 0),
            ];
        }

        return $out;
    }

    /**
     * @return array{
     *   review_opened: int,
     *   bulk_applied: int,
     *   reassigns: int,
     *   dismissed: int,
     *   apply_rate_pct: float|null
     * }
     */
    public function reviewFunnelSummary(int $days = 30): array
    {
        $empty = [
            'review_opened' => 0,
            'bulk_applied' => 0,
            'reassigns' => 0,
            'dismissed' => 0,
            'apply_rate_pct' => null,
        ];
        try {
            $stmt = $this->pdo->query('SELECT * FROM v_review_funnel_30d LIMIT 1');
            $row = $stmt->fetch();
            if ($row === false) {
                return $empty;
            }

            return [
                'review_opened' => (int) ($row['review_opened'] ?? 0),
                'bulk_applied' => (int) ($row['bulk_applied'] ?? 0),
                'reassigns' => (int) ($row['reassigns'] ?? 0),
                'dismissed' => (int) ($row['dismissed'] ?? 0),
                'apply_rate_pct' => isset($row['apply_rate_pct']) ? (float) $row['apply_rate_pct'] : null,
            ];
        } catch (\PDOException $e) {
            error_log('[datasuite] reviewFunnelSummary: ' . $e->getMessage());
            return $empty;
        }
    }

    /**
     * @return list<array{milestone: string, label: string, first_hits: int, unique_installs: int}>
     */
    public function setupMilestones(int $days = 30): array
    {
        try {
            $stmt = $this->pdo->query(
                'SELECT milestone, first_hits, unique_installs
                 FROM v_setup_milestones_30d
                 ORDER BY first_hits DESC
                 LIMIT 20'
            );
            $rows = $stmt->fetchAll();
        } catch (\PDOException $e) {
            error_log('[datasuite] setupMilestones: ' . $e->getMessage());
            return [];
        }
        $out = [];
        foreach ($rows as $row) {
            $milestone = (string) ($row['milestone'] ?? '');
            if ($milestone === '') {
                continue;
            }
            $out[] = [
                'milestone' => $milestone,
                'label' => ProductBrief::setupMilestoneLabel($milestone),
                'first_hits' => (int) ($row['first_hits'] ?? 0),
                'unique_installs' => (int) ($row['unique_installs'] ?? 0),
            ];
        }

        return $out;
    }

    /**
     * @return list<array{intent_bucket: string, label: string, turns: int, unique_installs: int}>
     */
    public function assistantIntent(int $days = 30): array
    {
        try {
            $stmt = $this->pdo->query(
                'SELECT intent_bucket, turns, unique_installs
                 FROM v_assistant_intent_30d
                 ORDER BY turns DESC
                 LIMIT 20'
            );
            $rows = $stmt->fetchAll();
        } catch (\PDOException $e) {
            error_log('[datasuite] assistantIntent: ' . $e->getMessage());
            return [];
        }
        $out = [];
        foreach ($rows as $row) {
            $bucket = (string) ($row['intent_bucket'] ?? '');
            if ($bucket === '') {
                continue;
            }
            $out[] = [
                'intent_bucket' => $bucket,
                'label' => ProductBrief::intentBucketLabel($bucket),
                'turns' => (int) ($row['turns'] ?? 0),
                'unique_installs' => (int) ($row['unique_installs'] ?? 0),
            ];
        }

        return $out;
    }
}
