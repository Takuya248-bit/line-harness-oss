import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

declare const process: {
  argv: string[];
  exitCode?: number;
};

type MessageType = 'text' | 'image' | 'flex' | 'video' | 'audio' | 'sticker' | 'location' | 'template' | 'carousel';
type TriggerType = 'friend_add' | 'tag_added' | 'manual';

type ScenarioStepDefinition = {
  id: string;
  step_order: number;
  delay_minutes: number;
  delivery_hour: number | null;
  message_type: MessageType;
  message_content: string;
  condition_type: string | null;
  condition_value: string | null;
  next_step_on_false: number | null;
  on_reach_tag_id: string | null;
};

type ScenarioDefinition = {
  id: string;
  name: string;
  description: string;
  trigger_type: TriggerType;
  trigger_tag_id: string | null;
  steps: ScenarioStepDefinition[];
};

type ScenarioData = {
  line_account_id: string;
  line_oa: string;
  scenario_set: string;
  is_active: boolean;
  scenarios: ScenarioDefinition[];
};

export const BALILINGUAL_V4_LINE_ACCOUNT_ID = '1e7f64a9-50f5-4356-8fcb-228204e167c8';
export const BALILINGUAL_V4_DATA_PATH = '../data/balilingual-v4-scenarios.json';

const nowSql = "strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')";

function sqlString(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNumber(value: number | null): string {
  return value === null ? 'NULL' : String(value);
}

function normalizeMessageType(messageType: MessageType): Exclude<MessageType, 'carousel'> | 'flex' {
  return messageType === 'carousel' ? 'flex' : messageType;
}

function buildFlexMessageContent(step: ScenarioStepDefinition): string {
  const paragraphs = step.message_content
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean);

  const bodyContents = paragraphs.map((text, index) => ({
    type: 'text',
    text,
    wrap: true,
    size: index === 0 ? 'md' : 'sm',
    weight: index === 0 ? 'bold' : 'regular',
    color: index === 0 ? '#111827' : '#374151',
    margin: index === 0 ? 'none' : 'md',
  }));

  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#06C755',
      paddingAll: '14px',
      contents: [{ type: 'text', text: 'バリリンガル', color: '#FFFFFF', weight: 'bold' }],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: bodyContents,
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#06C755',
          action: { type: 'message', label: '無料相談する', text: '相談したい' },
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'message', label: '質問する', text: '質問したい' },
        },
      ],
    },
  };

  if (step.message_type === 'carousel') {
    return JSON.stringify({ type: 'carousel', contents: [bubble] });
  }

  return JSON.stringify(bubble);
}

function lineMessageContent(step: ScenarioStepDefinition): string {
  if (step.message_type === 'flex' || step.message_type === 'carousel') {
    return buildFlexMessageContent(step);
  }
  return step.message_content;
}

function readScenarioData(): ScenarioData {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const dataPath = resolve(scriptDir, BALILINGUAL_V4_DATA_PATH);
  return JSON.parse(readFileSync(dataPath, 'utf8')) as ScenarioData;
}

function assertValidData(data: ScenarioData): void {
  if (data.line_account_id !== BALILINGUAL_V4_LINE_ACCOUNT_ID) {
    throw new Error(`Unexpected line_account_id: ${data.line_account_id}`);
  }

  for (const scenario of data.scenarios) {
    if (!scenario.name.startsWith('S_')) {
      throw new Error(`Unexpected scenario name: ${scenario.name}`);
    }

    for (const step of scenario.steps) {
      if (!step.message_content.trim()) {
        throw new Error(`Empty message_content: ${scenario.name} step ${step.step_order}`);
      }
      if (step.message_content.includes('TODO') || step.message_content.includes('プレースホルダー')) {
        throw new Error(`Placeholder text is not allowed: ${scenario.name} step ${step.step_order}`);
      }
      if (step.condition_value && step.condition_value.trim().startsWith('{')) {
        JSON.parse(step.condition_value);
      }
    }
  }
}

function scenarioUpsertSql(scenario: ScenarioDefinition, isActive: boolean): string {
  const scenarioSelect = `(SELECT id FROM scenarios WHERE name = ${sqlString(scenario.name)} AND line_account_id = ${sqlString(BALILINGUAL_V4_LINE_ACCOUNT_ID)} LIMIT 1)`;
  return `
UPDATE scenarios
SET
  id = ${sqlString(scenario.id)},
  description = ${sqlString(scenario.description)},
  trigger_type = ${sqlString(scenario.trigger_type)},
  trigger_tag_id = ${sqlString(scenario.trigger_tag_id)},
  is_active = ${isActive ? 1 : 0},
  line_account_id = ${sqlString(BALILINGUAL_V4_LINE_ACCOUNT_ID)},
  updated_at = ${nowSql}
WHERE name = ${sqlString(scenario.name)}
  AND line_account_id = ${sqlString(BALILINGUAL_V4_LINE_ACCOUNT_ID)};

INSERT INTO scenarios (
  id, name, description, trigger_type, trigger_tag_id, is_active, line_account_id, created_at, updated_at
)
SELECT
  ${sqlString(scenario.id)},
  ${sqlString(scenario.name)},
  ${sqlString(scenario.description)},
  ${sqlString(scenario.trigger_type)},
  ${sqlString(scenario.trigger_tag_id)},
  ${isActive ? 1 : 0},
  ${sqlString(BALILINGUAL_V4_LINE_ACCOUNT_ID)},
  ${nowSql},
  ${nowSql}
WHERE ${scenarioSelect} IS NULL;`;
}

function stepUpsertSql(scenario: ScenarioDefinition, step: ScenarioStepDefinition): string {
  const scenarioIdSelect = `(SELECT id FROM scenarios WHERE name = ${sqlString(scenario.name)} AND line_account_id = ${sqlString(BALILINGUAL_V4_LINE_ACCOUNT_ID)} LIMIT 1)`;
  return `
INSERT INTO scenario_steps (
  id, scenario_id, step_order, delay_minutes, delivery_hour, message_type,
  message_content, extra_messages, rich_menu_id, condition_type, condition_value,
  next_step_on_false, created_at
) VALUES (
  ${sqlString(step.id)},
  ${scenarioIdSelect},
  ${step.step_order},
  ${step.delay_minutes},
  ${sqlNumber(step.delivery_hour)},
  ${sqlString(normalizeMessageType(step.message_type))},
  ${sqlString(lineMessageContent(step))},
  NULL,
  NULL,
  ${sqlString(step.condition_type)},
  ${sqlString(step.condition_value)},
  ${sqlNumber(step.next_step_on_false)},
  ${nowSql}
)
ON CONFLICT(id) DO UPDATE SET
  scenario_id = excluded.scenario_id,
  step_order = excluded.step_order,
  delay_minutes = excluded.delay_minutes,
  delivery_hour = excluded.delivery_hour,
  message_type = excluded.message_type,
  message_content = excluded.message_content,
  extra_messages = excluded.extra_messages,
  rich_menu_id = excluded.rich_menu_id,
  condition_type = excluded.condition_type,
  condition_value = excluded.condition_value,
  next_step_on_false = excluded.next_step_on_false;`;
}

export function buildSeedSql(data = readScenarioData()): string {
  assertValidData(data);
  const chunks: string[] = [
    '-- Balilingual v4 scenarios. Target account only: @409ankpf / 1e7f64a9-50f5-4356-8fcb-228204e167c8',
    'BEGIN TRANSACTION;',
  ];

  for (const scenario of data.scenarios) {
    chunks.push(scenarioUpsertSql(scenario, data.is_active));
    for (const step of scenario.steps) {
      chunks.push(stepUpsertSql(scenario, step));
    }
  }

  chunks.push('COMMIT;');
  return chunks.join('\n').trim();
}

export function buildVerificationSql(): string {
  return `
SELECT
  s.name,
  s.is_active,
  s.line_account_id,
  COUNT(ss.id) AS step_count,
  SUM(CASE WHEN ss.message_content IS NULL OR length(trim(ss.message_content)) = 0 THEN 1 ELSE 0 END) AS empty_message_count
FROM scenarios s
LEFT JOIN scenario_steps ss ON ss.scenario_id = s.id
WHERE s.line_account_id = '${BALILINGUAL_V4_LINE_ACCOUNT_ID}'
  AND s.name IN ('S_01_v4', 'S_02_v4_予約後', 'S_03_v4_カルーセル無反応', 'S_04_v4_面談後', 'S_05_v4_長期')
GROUP BY s.id, s.name, s.is_active, s.line_account_id
ORDER BY s.name;
`.trim();
}

export function printUsage(): void {
  console.log(`Usage:
  node --import tsx apps/worker/scripts/seed-balilingual-v4-scenarios.ts --sql
  node --import tsx apps/worker/scripts/seed-balilingual-v4-scenarios.ts --verify-sql

Apply:
  node --import tsx apps/worker/scripts/seed-balilingual-v4-scenarios.ts --sql > /tmp/balilingual-v4-scenarios.sql
  pnpm --filter worker wrangler d1 execute line-crm --remote --file=/tmp/balilingual-v4-scenarios.sql

Verify:
  node --import tsx apps/worker/scripts/seed-balilingual-v4-scenarios.ts --verify-sql > /tmp/balilingual-v4-verify.sql
  pnpm --filter worker wrangler d1 execute line-crm --remote --file=/tmp/balilingual-v4-verify.sql`);
}

const arg = process.argv[2] ?? '--help';

try {
  if (arg === '--sql') {
    console.log(buildSeedSql());
  } else if (arg === '--verify-sql') {
    console.log(buildVerificationSql());
  } else {
    printUsage();
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
