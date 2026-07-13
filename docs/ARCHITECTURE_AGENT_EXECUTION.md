# Autonomous execution: two stacks, one tool layer

The app has **two** autonomous "plan then act" execution stacks. They look similar
but exist for different surfaces and are intentionally kept separate. Both ultimately
run tools through the same dispatch layer (`tool_registry.dispatch_sync`); they differ
only in *how they plan, stream, and self-check*.

This note exists so a developer who finds both does not assume one is dead code.

## 1. `/agent/task` — the visualizer task runner (orchestrator-backed)

- **Entry point:** `routes/agent_routes.py` → `agent/task_queue.py`.
- **Engine:** `orchestrator.orchestrate` via `agent/orchestrator_runner.py` (same
  planner→executor→critic loop as `plan_and_execute`). Set
  `ASSISTANT_ORCHESTRATOR_TASK_QUEUE=0` to fall back to the legacy
  `agent/planner.py` + `agent/executor.py` path.
- **Streaming:** a per-task `asyncio.Queue` emits a fixed SSE event protocol
  (`task_start`, `planning`, `plan_ready`, `step_start`, `step_done`,
  `subtask_start`, `subtask_done`, `task_complete`, `provider_relay`, …).
- **Consumer:** the **Tesseract visualizer** in the renderer lays out cubes and
  labels directly from `plan_ready` + step/subtask events.
- **Note:** orchestrator plans are flat steps (no nested subtasks in
  `plan_ready`); subtask cube layout is a legacy-only feature.

## 2. `plan_and_execute` — the orchestrator tool (canonical going forward)

- **Entry point:** `actions/agent_task.py::plan_and_execute`, exposed as a **tool**
  in `tool_registry` and called from the chat / voice tool-calling loop.
- **Engine:** `orchestrator.orchestrate` — a fuller planner → executor → **critic**
  loop with a `Blackboard`, `Budget`, `AutonomyPolicy` (risk gating), `audit`,
  `memory`, and `skills`.
- **Streaming:** mirrors progress to the visualizer opportunistically via
  `agent/plan_mirror.py` when a `_visualizer_task_id` is supplied, but its primary
  output is a single `{ok, summary, steps, log}` result the model reads back.
- **Why it's canonical:** it has the safety machinery (policy/risk classification,
  budget caps, audit trail, self-recursion block) and provider failover the bare
  planner→executor path lacks. New autonomous capabilities should go here.

## Shared layer

Both stacks dispatch tools through `tool_registry.dispatch_sync`, and both route
their reasoning/planning through the **Conductor** (`orchestrator.conductor`) for
provider failover. So the *tool catalog* and *provider health/relay* behavior are
identical across the two; only the planning/critic/streaming differs.

## Migration intent

Phase 6 is complete: `/agent/task` runs `orchestrator.orchestrate` and
`task_queue` translates orchestrator progress into the visualizer SSE protocol.
The legacy `agent/planner` + `agent/executor` path remains behind
`ASSISTANT_ORCHESTRATOR_TASK_QUEUE=0` for rollback. **Prefer
`plan_and_execute` (the orchestrator) for tool-calling surfaces**; treat
`/agent/task` as the visualizer-bound SSE surface only.
