/**
 * In-process counters for Prometheus /health (no external deps beyond Redis pending key).
 */

const counters = {
  jobsCompleted: 0,
  jobsFailed: 0,
  queueTimeouts: 0,
  enqueueErrors: 0,
};

function recordCompleted() {
  counters.jobsCompleted += 1;
}

function recordFailed() {
  counters.jobsFailed += 1;
}

function recordQueueTimeout() {
  counters.queueTimeouts += 1;
}

function recordEnqueueError() {
  counters.enqueueErrors += 1;
}

function snapshot() {
  return { ...counters };
}

/**
 * @param {Record<string, number>} stats
 * @param {number} workerCount
 */
function renderPrometheus(stats, workerCount) {
  const lines = [
    "# HELP sort_queue_workers Configured worker count",
    "# TYPE sort_queue_workers gauge",
    `sort_queue_workers ${workerCount}`,
    "# HELP sort_queue_pending_jobs Jobs waiting in tenant queues",
    "# TYPE sort_queue_pending_jobs gauge",
    `sort_queue_pending_jobs ${stats.pendingJobs ?? 0}`,
    "# HELP sort_queue_jobs_completed_total Jobs forwarded successfully",
    "# TYPE sort_queue_jobs_completed_total counter",
    `sort_queue_jobs_completed_total ${stats.jobsCompleted}`,
    "# HELP sort_queue_jobs_failed_total Jobs that returned HTTP error or forward failure",
    "# TYPE sort_queue_jobs_failed_total counter",
    `sort_queue_jobs_failed_total ${stats.jobsFailed}`,
    "# HELP sort_queue_timeouts_total HTTP 504 responses (client wait exceeded)",
    "# TYPE sort_queue_timeouts_total counter",
    `sort_queue_timeouts_total ${stats.queueTimeouts}`,
    "# HELP sort_queue_enqueue_errors_total Failed enqueue attempts",
    "# TYPE sort_queue_enqueue_errors_total counter",
    `sort_queue_enqueue_errors_total ${stats.enqueueErrors}`,
  ];
  return `${lines.join("\n")}\n`;
}

module.exports = {
  recordCompleted,
  recordFailed,
  recordQueueTimeout,
  recordEnqueueError,
  snapshot,
  renderPrometheus,
};
