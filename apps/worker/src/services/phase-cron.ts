/**
 * フェーズ自動遷移 Cron サービス
 *
 * 友だちのphase_*タグのassigned_at（停滞日数）を検知し、
 * 条件に一致したらフェーズを自動遷移させる。
 *
 * 遷移ルール:
 * - phase_未相談: 7日経過 → 再活性化（シナリオ再開 or リマインド）
 * - phase_相談済: 14日経過 → 見積誘導
 * - phase_見積送付済: 7日経過 → フォロー
 * - phase_入金待ち: 14日経過 → 個別連絡フラグ（通知のみ、自動遷移なし）
 * - 最終反応30日以上 → phase_休眠
 */

import { addTagToFriend, jstNow } from '@line-crm/db';

/** フェーズ遷移ルール定義 */
interface PhaseTransitionRule {
  /** 現在のフェーズタグ名 */
  fromPhase: string;
  /** 停滞日数の閾値 */
  staleDays: number;
  /** 遷移先のフェーズタグ名（nullの場合はフェーズ遷移なし、アクションのみ） */
  toPhase: string | null;
  /** 遷移時に付与する追加タグ名（通知フラグ等） */
  actionTag?: string;
}

const TRANSITION_RULES: PhaseTransitionRule[] = [
  {
    fromPhase: 'phase_未相談',
    staleDays: 7,
    toPhase: null, // フェーズは変えない、再活性化タグを付与
    actionTag: 'reactivation_remind',
  },
  {
    fromPhase: 'phase_相談済',
    staleDays: 14,
    toPhase: null, // フェーズは変えない、見積誘導タグを付与
    actionTag: 'nudge_estimate',
  },
  {
    fromPhase: 'phase_見積送付済',
    staleDays: 7,
    toPhase: null, // フェーズは変えない、フォロータグを付与
    actionTag: 'followup_estimate',
  },
  {
    fromPhase: 'phase_入金待ち',
    staleDays: 14,
    toPhase: null, // 自動遷移なし、個別連絡フラグのみ
    actionTag: 'flag_manual_contact',
  },
];

/** 休眠遷移の閾値（日数） */
const DORMANT_DAYS = 30;

interface TransitionResult {
  friendId: string;
  fromPhase: string;
  toPhase: string | null;
  actionTag: string | null;
}

/**
 * フェーズ自動遷移を実行する
 *
 * @param db D1Database
 * @param lineAccountId 対象のLINEアカウントID（マルチアカウント対応）
 */
export async function processPhaseTransitions(
  db: D1Database,
  lineAccountId: string,
): Promise<TransitionResult[]> {
  const results: TransitionResult[] = [];

  // キャッシュをクリア（Workers isolate間で共有されるため）
  tagIdCache.clear();

  // ---- 1. ルールベースの停滞遷移 ----
  for (const rule of TRANSITION_RULES) {
    const staleDate = getDateDaysAgo(rule.staleDays);

    // phase_*タグが付いた友だちのうち、assigned_atがN日以上前のものを取得
    // 既にアクションタグが付いている友だちは除外（重複実行防止）
    const query = rule.actionTag
      ? `SELECT ft.friend_id
         FROM friend_tags ft
         JOIN tags t ON t.id = ft.tag_id
         JOIN friends f ON f.id = ft.friend_id
         LEFT JOIN friend_tags ft_action ON ft_action.friend_id = ft.friend_id
           AND ft_action.tag_id = (SELECT id FROM tags WHERE name = ?)
         WHERE t.name = ?
           AND ft.assigned_at <= ?
           AND f.line_account_id = ?
           AND f.is_following = 1
           AND ft_action.friend_id IS NULL`
      : `SELECT ft.friend_id
         FROM friend_tags ft
         JOIN tags t ON t.id = ft.tag_id
         JOIN friends f ON f.id = ft.friend_id
         WHERE t.name = ?
           AND ft.assigned_at <= ?
           AND f.line_account_id = ?
           AND f.is_following = 1`;

    const binds = rule.actionTag
      ? [rule.actionTag, rule.fromPhase, staleDate, lineAccountId]
      : [rule.fromPhase, staleDate, lineAccountId];

    const rows = await db
      .prepare(query)
      .bind(...binds)
      .all<{ friend_id: string }>();

    for (const row of rows.results) {
      try {
        // フェーズ遷移（toPhaseがある場合）
        if (rule.toPhase) {
          const toTagId = await ensureTag(db, rule.toPhase);
          await addTagToFriend(db, row.friend_id, toTagId);
        }

        // アクションタグの付与（シナリオ発火のトリガーになる）
        if (rule.actionTag) {
          const actionTagId = await ensureTag(db, rule.actionTag);
          await addTagToFriend(db, row.friend_id, actionTagId);
        }

        results.push({
          friendId: row.friend_id,
          fromPhase: rule.fromPhase,
          toPhase: rule.toPhase,
          actionTag: rule.actionTag ?? null,
        });
      } catch (err) {
        console.error(
          `Phase transition failed for friend ${row.friend_id}: ${rule.fromPhase} → ${rule.toPhase ?? 'action only'}`,
          err,
        );
      }
    }
  }

  // ---- 2. 休眠遷移（最終反応30日以上） ----
  const dormantDate = getDateDaysAgo(DORMANT_DAYS);
  const dormantQuery = `
    SELECT ft.friend_id, t.name as current_phase
    FROM friend_tags ft
    JOIN tags t ON t.id = ft.tag_id
    JOIN friends f ON f.id = ft.friend_id
    WHERE t.name LIKE 'phase_%'
      AND t.name != 'phase_休眠'
      AND t.name != 'phase_入金済'
      AND f.line_account_id = ?
      AND f.is_following = 1
      AND f.updated_at <= ?`;

  const dormantRows = await db
    .prepare(dormantQuery)
    .bind(lineAccountId, dormantDate)
    .all<{ friend_id: string; current_phase: string }>();

  for (const row of dormantRows.results) {
    try {
      const dormantTagId = await ensureTag(db, 'phase_休眠');
      await addTagToFriend(db, row.friend_id, dormantTagId);

      results.push({
        friendId: row.friend_id,
        fromPhase: row.current_phase,
        toPhase: 'phase_休眠',
        actionTag: null,
      });
    } catch (err) {
      console.error(
        `Dormant transition failed for friend ${row.friend_id}: ${row.current_phase} → phase_休眠`,
        err,
      );
    }
  }

  if (results.length > 0) {
    console.log(
      `[phase-cron] Processed ${results.length} phase transitions for account ${lineAccountId}`,
    );
  }

  return results;
}

// ---- ヘルパー関数 ----

/** N日前のISO日時文字列を取得（JST） */
function getDateDaysAgo(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() - days);
  // jstNow()と同じフォーマットで返す
  const JST_OFFSET_MS = 9 * 60 * 60_000;
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, -1) + '+09:00';
}

/** タグ名からIDを取得。存在しなければ作成する */
const tagIdCache = new Map<string, string>();

async function ensureTag(db: D1Database, tagName: string): Promise<string> {
  // キャッシュ確認（同一Cron実行内のみ有効）
  const cached = tagIdCache.get(tagName);
  if (cached) return cached;

  const row = await db
    .prepare('SELECT id FROM tags WHERE name = ?')
    .bind(tagName)
    .first<{ id: string }>();

  if (row) {
    tagIdCache.set(tagName, row.id);
    return row.id;
  }

  // タグが存在しない場合は作成
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, tagName, '#6B7280', now)
    .run();

  tagIdCache.set(tagName, id);
  return id;
}
