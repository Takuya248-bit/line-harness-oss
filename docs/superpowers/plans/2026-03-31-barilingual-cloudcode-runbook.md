# Barilingual Notion-CloudCode Runbook

## 1. Pilot (single node)

Pilot target: `s01` (or `anket_status` if s01 already configured)

### Pre-flight

1. Import all CSV files in `config/barilingual-lstep-notion/seed`.
2. Create one `Runs` row:
   - `run_id=pilot-s01-001`
   - `target_node_id=s01`
   - `status=queued`
   - `last_step=init`
   - `idempotency_key=pilot-s01-001`
3. Confirm target node exists in Notion and `enabled=true`.

### Execute

1. Send `config/barilingual-lstep-notion/cloudcode-prompt-template.md` to Cloud Code.
2. Fill placeholders:
   - `target_node_id=s01`
   - `run_id=pilot-s01-001`
   - `idempotency_key=pilot-s01-001`
3. Run until either `success` or `failed`.

### Verify

1. `Runs.status=success`
2. `Runs.last_step=done`
3. LSTEP UI values match Notion values for:
   - conversion
   - condition_on
   - friend_info_policy
   - tags_add
   - schedule
   - actions
4. Re-run with same `idempotency_key` and confirm no duplicate creation.

### Recovery test

1. Intentionally interrupt mid-step.
2. Set `Runs.status=retry`.
3. Resume and confirm it continues from `Runs.last_step`.

## 2. Batch rollout (all nodes)

### Order

1. `friend_add`
2. `s01`
3. `anket_status`
4. branch nodes (`estimate`, `chat`, `video`, `mayoi`, `s_auto`)
5. scenario nodes (`s02`, `s03`, `schat`, `s04`, `s05`)
6. decision nodes (`step6_cv`, `step6_ncv`, `cv_hub`)
7. terminal node (`s06`)

### Rules

1. Create one run per node (`run_id=batch-<node_id>-<seq>`).
2. Use unique `idempotency_key` per run.
3. Stop batch if any run fails; resolve then continue.

### Final consistency checks

1. Every `Nodes.enabled=true` row has `status=success` in latest run.
2. Transition graph:
   - only root: `friend_add`
   - only terminal: `s06`
   - no unreachable node
3. Message coverage:
   - all `Messages.enabled=true` rows are applied once
4. No duplicate transition/message records in UI.

## 3. Operator checklist

- Keep Notion as the only source of truth.
- Any UI hotfix must be backfilled to Notion immediately.
- Never execute Cloud Code against `enabled=false` rows.
