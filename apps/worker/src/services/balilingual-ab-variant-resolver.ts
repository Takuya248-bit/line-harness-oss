import { assignFriendToVariant, type AbTestRow } from './ab-test.js';

export const BALILINGUAL_LINE_ACCOUNT_ID = '1e7f64a9-50f5-4356-8fcb-228204e167c8';
export const BALILINGUAL_WELCOME_V4_AB_TEST_NAME = 'balilingual_welcome_v4_2026_06';
export const BALILINGUAL_WELCOME_V4_METADATA_KEY = 'ab_welcome_v4_2026_06';
export const BALILINGUAL_WELCOME_V4_VARIANTS = ['A_48h', 'B_5days'] as const;

type BalilingualWelcomeVariant = (typeof BALILINGUAL_WELCOME_V4_VARIANTS)[number];

interface FriendVariantTarget {
  id: string;
  line_account_id: string | null;
  metadata: string | null;
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isBalilingualWelcomeVariant(value: string): value is BalilingualWelcomeVariant {
  return BALILINGUAL_WELCOME_V4_VARIANTS.includes(value as BalilingualWelcomeVariant);
}

async function getActiveAccountAbTest(
  db: D1Database,
  abTestName: string,
): Promise<AbTestRow | null> {
  const now = new Date().toISOString();
  return await db
    .prepare(
      `SELECT *
       FROM ab_tests
       WHERE name = ?
         AND line_account_id = ?
         AND is_active = 1
         AND (starts_at IS NULL OR starts_at <= ?)
         AND (ends_at IS NULL OR ends_at >= ?)
       LIMIT 1`,
    )
    .bind(abTestName, BALILINGUAL_LINE_ACCOUNT_ID, now, now)
    .first<AbTestRow>();
}

async function saveVariantToFriendMetadata(
  db: D1Database,
  friend: FriendVariantTarget,
  variant: string,
): Promise<void> {
  const metadata = parseMetadata(friend.metadata);
  if (metadata[BALILINGUAL_WELCOME_V4_METADATA_KEY] === variant) return;

  metadata[BALILINGUAL_WELCOME_V4_METADATA_KEY] = variant;

  await db
    .prepare(
      `UPDATE friends
       SET metadata = ?, updated_at = ?
       WHERE id = ? AND line_account_id = ?`,
    )
    .bind(JSON.stringify(metadata), new Date().toISOString(), friend.id, BALILINGUAL_LINE_ACCOUNT_ID)
    .run();
}

/**
 * Resolve the Balilingual welcome v4 A/B variant for one friend.
 *
 * Account isolation is intentionally strict: only @409ankpf friends are eligible.
 * Other LINE accounts return null before any assignment write can happen.
 */
export async function resolveAbVariant(
  db: D1Database,
  friendId: string,
  abTestName: string,
): Promise<string | null> {
  const friend = await db
    .prepare(
      `SELECT id, line_account_id, metadata
       FROM friends
       WHERE id = ? AND line_account_id = ?
       LIMIT 1`,
    )
    .bind(friendId, BALILINGUAL_LINE_ACCOUNT_ID)
    .first<FriendVariantTarget>();

  if (!friend) return null;

  const abTest = await getActiveAccountAbTest(db, abTestName);
  if (!abTest) return null;

  const variant = await assignFriendToVariant(db, abTest, friendId);
  if (!isBalilingualWelcomeVariant(variant)) return null;

  await saveVariantToFriendMetadata(db, friend, variant);
  return variant;
}
