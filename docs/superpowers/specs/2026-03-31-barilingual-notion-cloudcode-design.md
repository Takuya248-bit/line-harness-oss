# Barilingual LSTEP Notion-CloudCode Design

## Goal

Use Notion as the single source of truth for LSTEP automation settings, then let Cloud Code read Notion and perform deterministic UI input.

## Databases

### 1) Nodes

One row per flow node (`friend_add`, `s01`, `anket_status`, ...).

| property | type | required | note |
|---|---|---|---|
| node_id | title | yes | unique key |
| display_name | text | yes | human readable title |
| phase | text | yes | current phase name |
| conversion | text | yes | conversion definition |
| condition_on | text | yes | activation condition |
| friend_info_policy | text | yes | `0_` and `on_` field policy |
| tags_add | text | yes | tags to add |
| schedule | text | yes | delivery timing |
| actions | text | yes | actions to execute |
| enabled | checkbox | yes | execution flag |
| source_version | text | yes | e.g. `overview-local.html@2026-03-31` |

### 2) Transitions

One row per edge with priority and behavior.

| property | type | required | note |
|---|---|---|---|
| transition_id | title | yes | unique key |
| from_node_id | relation -> Nodes | yes | source node |
| to_node_id | relation -> Nodes | yes | destination node |
| trigger_type | select | yes | `click`/`time`/`tag`/`staff_action`/`system` |
| trigger_detail | text | yes | concrete trigger condition |
| priority | number | yes | lower number = higher priority |
| stop_current_scenario | checkbox | yes | stop current scenario before jump |
| enabled | checkbox | yes | execution flag |

### 3) Messages

One row per message item (text/cta/system/menu).  
This granularity prevents UI automation from failing on mixed message blocks.

| property | type | required | note |
|---|---|---|---|
| message_id | title | yes | unique key |
| node_id | relation -> Nodes | yes | owning node |
| scenario_id | text | yes | `S_01`, `S_02`, `S_CHAT`, etc |
| course_id | text | no | only for S_02 course variants |
| day_index | number | yes | day offset |
| time_slot | text | yes | e.g. `12:00`, `即時` |
| message_type | select | yes | `text`/`cta`/`system`/`menu` |
| content | text | yes | body text |
| cta_label | text | no | label only for cta |
| cta_action | text | no | routing/action only for cta |
| enabled | checkbox | yes | execution flag |

### 4) Runs

Execution and recovery ledger for Cloud Code.

| property | type | required | note |
|---|---|---|---|
| run_id | title | yes | unique run key |
| target_node_id | relation -> Nodes | yes | processing node |
| status | select | yes | `queued`/`running`/`success`/`failed`/`retry` |
| error_type | text | no | categorized failure |
| error_detail | text | no | raw error |
| last_step | text | yes | last completed field step |
| screenshot_url | url | no | evidence |
| idempotency_key | text | yes | duplicate prevention |
| started_at | date | yes | start timestamp |
| finished_at | date | no | end timestamp |

## Cloud Code Execution Contract

1. Fetch `enabled=true` records from Notion (`Nodes`, `Transitions`, `Messages`).
2. Validate required fields and foreign-key consistency.
3. Sort transitions by `priority` ascending.
4. Execute node settings field-by-field and verify each save.
5. Resume from `Runs.last_step` on retry.
6. Write `Runs` record for every attempt with an `idempotency_key`.

## Invariants

- `friend_add` is the only root node.
- `s06` is the only terminal node.
- Every enabled node has all six LSTEP fields:
  - `conversion`
  - `condition_on`
  - `friend_info_policy`
  - `tags_add`
  - `schedule`
  - `actions`
- `0_` fields are write-once; `on_` fields are update-only.
