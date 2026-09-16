import {
  BALILINGUAL_LINE_ACCOUNT_ID,
  BALILINGUAL_WELCOME_V4_AB_TEST_NAME,
  BALILINGUAL_WELCOME_V4_METADATA_KEY,
} from '../src/services/balilingual-ab-variant-resolver.js';

declare const process: { argv: string[] };

export const BALILINGUAL_WELCOME_V4_AB_TEST_ID = 'ab_balilingual_welcome_v4_2026_06';
export const BALILINGUAL_S_01_V4_SCENARIO_ID = 'S_01_v4';

const nowSql = "strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')";

const step = (
  id: string,
  stepOrder: number,
  delayMinutes: number,
  deliveryHour: number | null,
  messageContent: string,
  variant: 'A_48h' | 'B_5days' | null,
  nextStepOnFalse: number | null,
) => {
  const conditionValue = variant
    ? JSON.stringify({ key: BALILINGUAL_WELCOME_V4_METADATA_KEY, value: variant })
    : null;
  return `
INSERT INTO scenario_steps (
  id, scenario_id, step_order, delay_minutes, delivery_hour, message_type,
  message_content, extra_messages, rich_menu_id, condition_type, condition_value,
  next_step_on_false, created_at
) VALUES (
  '${id}', '${BALILINGUAL_S_01_V4_SCENARIO_ID}', ${stepOrder}, ${delayMinutes}, ${deliveryHour ?? 'NULL'}, 'text',
  ${JSON.stringify(messageContent)}, NULL, NULL,
  ${variant ? "'metadata_equals'" : 'NULL'}, ${conditionValue ? JSON.stringify(conditionValue) : 'NULL'},
  ${nextStepOnFalse ?? 'NULL'}, ${nowSql}
)
ON CONFLICT(id) DO UPDATE SET
  scenario_id = excluded.scenario_id,
  step_order = excluded.step_order,
  delay_minutes = excluded.delay_minutes,
  delivery_hour = excluded.delivery_hour,
  message_type = excluded.message_type,
  message_content = excluded.message_content,
  condition_type = excluded.condition_type,
  condition_value = excluded.condition_value,
  next_step_on_false = excluded.next_step_on_false;`;
};

export const seedBalilingualAbScenarioSql = `
INSERT INTO ab_tests (
  id, line_account_id, name, description, variants, weights, assignment_seed,
  is_active, starts_at, ends_at, created_at, updated_at
) VALUES (
  '${BALILINGUAL_WELCOME_V4_AB_TEST_ID}',
  '${BALILINGUAL_LINE_ACCOUNT_ID}',
  '${BALILINGUAL_WELCOME_V4_AB_TEST_NAME}',
  'Balilingual welcome v4: 48h hot timing vs 5-day staged follow-up',
  '["A_48h","B_5days"]',
  '[50,50]',
  'balilingual-welcome-v4',
  1,
  '2026-05-21T00:00:00+09:00',
  NULL,
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(id) DO UPDATE SET
  line_account_id = excluded.line_account_id,
  name = excluded.name,
  description = excluded.description,
  variants = excluded.variants,
  weights = excluded.weights,
  assignment_seed = excluded.assignment_seed,
  is_active = excluded.is_active,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  updated_at = ${nowSql};

INSERT INTO scenarios (
  id, name, description, trigger_type, trigger_tag_id, is_active, line_account_id, created_at, updated_at
) VALUES (
  '${BALILINGUAL_S_01_V4_SCENARIO_ID}',
  'S_01_v4 Welcome AB',
  'Balilingual welcome v4 scenario with metadata_equals AB branches',
  'manual',
  NULL,
  1,
  '${BALILINGUAL_LINE_ACCOUNT_ID}',
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  trigger_type = excluded.trigger_type,
  trigger_tag_id = excluded.trigger_tag_id,
  is_active = excluded.is_active,
  line_account_id = excluded.line_account_id,
  updated_at = ${nowSql};

${step('S_01_v4_step_001', 1, 0, null, '診断ありがとうございます。見積りと次の相談導線をお送りします。', null, null)}
${step('S_01_v4_A_step_002', 2, 240, null, '金額は確認できましたか？不安な点だけでもそのまま相談できます。', 'A_48h', 7)}
${step('S_01_v4_A_step_003', 3, 1440, 12, '費用・安全・現地サポートのよくある不安をまとめました。', 'A_48h', 7)}
${step('S_01_v4_A_step_004', 4, 2880, 19, 'セブ・ハワイ・オンラインとの違いを、費用と生活面で比較します。', 'A_48h', 7)}
${step('S_01_v4_A_step_005', 5, 4320, 12, '空き枠があるうちに、無料相談で見積りの中身を一緒に確認しましょう。', 'A_48h', 7)}
${step('S_01_v4_B_step_002', 7, 1440, 12, 'まずは見積りの見方だけ、短く確認できるようにしました。', 'B_5days', null)}
${step('S_01_v4_B_step_003', 8, 2880, 12, 'バリ留学でよくある不安と、現地でのサポート範囲を整理しました。', 'B_5days', null)}
${step('S_01_v4_B_step_004', 9, 4320, 12, '他の留学先と迷っている方向けに、費用と生活の違いを比較します。', 'B_5days', null)}
${step('S_01_v4_B_step_005', 10, 7200, 12, '検討が進んできたら、無料相談で日程と予算を具体化できます。', 'B_5days', null)}
`;

export function printSeedSql(): void {
  console.log(seedBalilingualAbScenarioSql.trim());
}

if (process.argv[1]?.endsWith('seed-balilingual-ab-scenario.ts')) {
  printSeedSql();
}
