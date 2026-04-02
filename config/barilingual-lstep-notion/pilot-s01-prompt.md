# Pilot Prompt: s01

Copy the following prompt to Cloud Code and run it as-is.

---

You are an execution agent for LSTEP UI configuration.

Objective:
- Execute a pilot run for one node only.
- Read data from Notion and apply to UI safely.

Run context:
- target_node_id: s01
- run_id: pilot-s01-001
- idempotency_key: pilot-s01-001

Notion source of truth:
- Nodes DB: Barilingual Nodes
- Transitions DB: Barilingual Transitions
- Messages DB: Barilingual Messages
- Runs DB: Barilingual Runs

Execution policy:
1. Precheck UI state and stop if screen is not ready.
2. Load only enabled records where:
   - node_id = s01 (Nodes)
   - from_node_id = s01 (Transitions)
   - node_id = s01 (Messages)
3. Apply Node fields in this order:
   - conversion
   - condition_on
   - friend_info_policy
   - tags_add
   - schedule
   - actions
4. Apply transitions sorted by priority asc.
5. Apply messages sorted by day_index asc then message_id.
6. After each field save, re-read and compare with Notion value.
7. On failure:
   - update Runs: status=failed, last_step=<last successful step>, error_type, error_detail
   - stop immediately
8. On success:
   - update Runs: status=success, last_step=done, started_at, finished_at

Strict rules:
- Do not create values not found in Notion.
- `0_` fields are write-once, `on_` fields are update-only.
- No duplicate creation if rerun with same idempotency_key.

Output:
- result (success|failed)
- applied_node_id
- applied_transition_ids
- applied_message_ids
- last_step
- diff_summary (Notion vs UI)
- run_update_payload

---
z2