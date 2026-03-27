import {
  getFriendScenariosDueForDelivery,
  getScenarioSteps,
  advanceFriendScenario,
  completeFriendScenario,
  getFriendById,
  jstNow,
} from '@line-crm/db';
import type { LineClient } from '@line-crm/line-sdk';
import type { Message } from '@line-crm/line-sdk';
import { jitterDeliveryTime, addJitter, sleep } from './stealth.js';

/**
 * Replace template variables in message content.
 *
 * Supported variables:
 * - {{name}}                → friend's display name
 * - {{uid}}                 → friend's user UUID
 * - {{friend_id}}           → friend's internal ID
 * - {{auth_url:CHANNEL_ID}} → full /auth/line URL with uid for cross-account linking
 */
export function expandVariables(
  content: string,
  friend: { id: string; display_name: string | null; user_id: string | null; ref_code?: string | null },
  apiOrigin?: string,
): string {
  let result = content;
  result = result.replace(/\{\{name\}\}/g, friend.display_name || '');
  result = result.replace(/\{\{uid\}\}/g, friend.user_id || '');
  result = result.replace(/\{\{friend_id\}\}/g, friend.id);
  result = result.replace(/\{\{ref\}\}/g, friend.ref_code || '');
  // Conditional block: {{#if_ref}}...{{/if_ref}} — only shown if ref_code exists
  if (friend.ref_code) {
    result = result.replace(/\{\{#if_ref\}\}([\s\S]*?)\{\{\/if_ref\}\}/g, '$1');
  } else {
    result = result.replace(/\{\{#if_ref\}\}[\s\S]*?\{\{\/if_ref\}\}/g, '');
  }
  if (apiOrigin) {
    result = result.replace(/\{\{auth_url:([^}]+)\}\}/g, (_match, channelId) => {
      const params = new URLSearchParams({ account: channelId, ref: 'cross-link' });
      if (friend.user_id) params.set('uid', friend.user_id);
      return `${apiOrigin}/auth/line?${params.toString()}`;
    });
  }

  // Countdown variable: {{countdown:YYYY-MM-DDTHH:mm}} → "あと3日" etc.
  result = result.replace(/\{\{countdown:([^}]+)\}\}/g, (_match, dateStr: string) => {
    return formatCountdown(dateStr, false);
  });

  // Detailed countdown: {{countdown_detail:YYYY-MM-DDTHH:mm}} → "あと3日と5時間" etc.
  result = result.replace(/\{\{countdown_detail:([^}]+)\}\}/g, (_match, dateStr: string) => {
    return formatCountdown(dateStr, true);
  });

  return result;
}

/**
 * Format countdown text from now (JST) to the target datetime.
 * @param dateStr - target datetime in "YYYY-MM-DDTHH:mm" format (JST)
 * @param detail - if true, show "あとN日とM時間" style
 */
function formatCountdown(dateStr: string, detail: boolean): string {
  // Parse target as JST: append +09:00 if no timezone info
  const targetStr = dateStr.includes('+') || dateStr.includes('Z') ? dateStr : `${dateStr}:00+09:00`;
  const target = new Date(targetStr);
  if (isNaN(target.getTime())) return dateStr; // invalid date → return as-is

  // Current time in JST
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) return '終了しました';

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (!detail) {
    // Simple format
    if (totalDays >= 1) return `あと${totalDays}日`;
    if (totalHours >= 1) return `あと${totalHours}時間`;
    return `あと${totalMinutes}分`;
  }

  // Detailed format
  const days = totalDays;
  const remainingHours = Math.floor((diffMs - days * 24 * 60 * 60 * 1000) / (1000 * 60 * 60));
  const remainingMinutes = Math.floor(
    (diffMs - days * 24 * 60 * 60 * 1000 - remainingHours * 60 * 60 * 1000) / (1000 * 60),
  );

  if (days >= 1 && remainingHours > 0) return `あと${days}日と${remainingHours}時間`;
  if (days >= 1) return `あと${days}日`;
  if (remainingHours >= 1 && remainingMinutes > 0) return `あと${remainingHours}時間と${remainingMinutes}分`;
  if (remainingHours >= 1) return `あと${remainingHours}時間`;
  return `あと${remainingMinutes}分`;
}

/** Default delivery window: 9:00-23:00 JST. If outside, push to next 9:00 AM. */
const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 23;

function enforceDeliveryWindow(date: Date, preferredHour?: number): Date {
  // date is already shifted to JST epoch (+9h)
  const hours = date.getUTCHours();
  const startHour = preferredHour ?? DEFAULT_START_HOUR;
  const endHour = DEFAULT_END_HOUR;

  if (hours >= startHour && hours < endHour) return date;

  // Outside window: push to next preferred start hour
  const result = new Date(date);
  if (hours >= endHour) {
    result.setUTCDate(result.getUTCDate() + 1);
  }
  result.setUTCHours(startHour, 0, 0, 0);
  return result;
}

/**
 * Apply delivery_hour to a date calculated from delay_minutes.
 * If delivery_hour is set, the "date" portion from delay_minutes is kept
 * but the time is overridden to delivery_hour:00 JST.
 * The date parameter is already in JST epoch (+9h applied).
 */
function applyDeliveryHour(date: Date, deliveryHour: number | null | undefined): Date {
  if (deliveryHour === null || deliveryHour === undefined) return date;
  const result = new Date(date);
  result.setUTCHours(deliveryHour, 0, 0, 0);
  return result;
}

export async function processStepDeliveries(
  db: D1Database,
  lineClient: LineClient,
  workerUrl?: string,
): Promise<void> {
  // Skip delivery outside 9:00-23:00 JST window
  const jstHour = new Date(Date.now() + 9 * 60 * 60_000).getUTCHours();
  if (jstHour < DEFAULT_START_HOUR || jstHour >= DEFAULT_END_HOUR) return;

  const now = jstNow();
  const dueFriendScenarios = await getFriendScenariosDueForDelivery(db, now);

  for (let i = 0; i < dueFriendScenarios.length; i++) {
    const fs = dueFriendScenarios[i];
    try {
      // Stealth: add small random delay between deliveries to avoid burst patterns
      if (i > 0) {
        await sleep(addJitter(50, 200));
      }
      await processSingleDelivery(db, lineClient, fs, workerUrl);
    } catch (err) {
      console.error(`Error processing friend_scenario ${fs.id}:`, err);
      // Continue with next one
    }
  }
}

async function processSingleDelivery(
  db: D1Database,
  lineClient: LineClient,
  fs: {
    id: string;
    friend_id: string;
    scenario_id: string;
    current_step_order: number;
    status: string;
    next_delivery_at: string | null;
  },
  workerUrl?: string,
): Promise<void> {
  // Get friend first to read preferred delivery hour from metadata
  const friend = await getFriendById(db, fs.friend_id);
  if (!friend || !friend.is_following) {
    await completeFriendScenario(db, fs.id);
    return;
  }

  // 配信停止タグチェック: タグ「配信停止」が付いている友だちはシナリオをスキップ
  const stopTag = await db
    .prepare(
      `SELECT 1 FROM friend_tags ft JOIN tags t ON ft.tag_id = t.id WHERE ft.friend_id = ? AND t.name = '配信停止'`,
    )
    .bind(fs.friend_id)
    .first();
  if (stopTag) {
    await completeFriendScenario(db, fs.id);
    return;
  }
  const metadata = JSON.parse((friend as { metadata?: string }).metadata || '{}') as Record<string, unknown>;
  const preferredHour = typeof metadata.preferred_hour === 'number' ? metadata.preferred_hour : undefined;

  // Get all steps for this scenario
  const steps = await getScenarioSteps(db, fs.scenario_id);
  if (steps.length === 0) {
    await completeFriendScenario(db, fs.id);
    return;
  }

  // Steps are sorted by step_order but may not be contiguous (e.g., 1, 3, 5 after deletions).
  // Find the next step whose step_order > current_step_order.
  const currentStep = steps.find((s) => s.step_order > fs.current_step_order);

  if (!currentStep) {
    await completeFriendScenario(db, fs.id);
    return;
  }

  // Check step condition before sending
  if (currentStep.condition_type) {
    const conditionMet = await evaluateCondition(db, fs.friend_id, currentStep);
    if (!conditionMet) {
      if (currentStep.next_step_on_false !== null && currentStep.next_step_on_false !== undefined) {
        const jumpStep = steps.find((s) => s.step_order === currentStep.next_step_on_false);
        if (jumpStep) {
          const nextDate = new Date(Date.now() + 9 * 60 * 60_000);
          nextDate.setMinutes(nextDate.getMinutes() + jumpStep.delay_minutes);
          const hourApplied = applyDeliveryHour(nextDate, jumpStep.delivery_hour);
          const windowedDate = jumpStep.delivery_hour != null ? hourApplied : enforceDeliveryWindow(hourApplied, preferredHour);
          const jitteredDate = jitterDeliveryTime(windowedDate);
          await advanceFriendScenario(db, fs.id, currentStep.step_order, jitteredDate.toISOString().slice(0, -1) + '+09:00');
          return;
        }
      }
      const nextIndex = steps.indexOf(currentStep) + 1;
      if (nextIndex < steps.length) {
        const nextStep = steps[nextIndex];
        const nextDate = new Date(Date.now() + 9 * 60 * 60_000);
        nextDate.setMinutes(nextDate.getMinutes() + nextStep.delay_minutes);
        const hourApplied = applyDeliveryHour(nextDate, nextStep.delivery_hour);
        const windowedDate = nextStep.delivery_hour != null ? hourApplied : enforceDeliveryWindow(hourApplied, preferredHour);
        const jitteredDate = jitterDeliveryTime(windowedDate);
        await advanceFriendScenario(db, fs.id, currentStep.step_order, jitteredDate.toISOString().slice(0, -1) + '+09:00');
      } else {
        await completeFriendScenario(db, fs.id);
      }
      return;
    }
  }

  // Expand template variables ({{name}}, {{uid}}, {{auth_url:CHANNEL_ID}}, etc.)
  const expandedContent = expandVariables(currentStep.message_content, friend, workerUrl);
  // Auto-wrap URLs with tracking links (text with URLs → Flex with button)
  let trackedType: string = currentStep.message_type;
  let trackedContent = expandedContent;
  if (workerUrl) {
    const { autoTrackContent } = await import('./auto-track.js');
    const tracked = await autoTrackContent(db, currentStep.message_type, expandedContent, workerUrl);
    trackedType = tracked.messageType;
    trackedContent = tracked.content;
  }
  // Build main message
  const messages: Message[] = [buildMessage(trackedType, trackedContent)];

  // Append extra_messages if present
  if (currentStep.extra_messages) {
    try {
      const extras = JSON.parse(currentStep.extra_messages) as Array<{ type: string; content: string }>;
      for (const extra of extras) {
        const expandedExtra = expandVariables(extra.content, friend, workerUrl);
        messages.push(buildMessage(extra.type, expandedExtra));
      }
    } catch {
      console.error(`Invalid extra_messages JSON for step ${currentStep.id}`);
    }
  }

  // LINE API allows max 5 messages per push
  await lineClient.pushMessage(friend.line_user_id, messages.slice(0, 5));

  // Switch rich menu if specified
  if (currentStep.rich_menu_id) {
    try {
      await lineClient.linkRichMenuToUser(friend.line_user_id, currentStep.rich_menu_id);
    } catch (err) {
      console.error(`Failed to link rich menu ${currentStep.rich_menu_id} to user ${friend.line_user_id}:`, err);
    }
  }

  // Log outgoing message
  const logId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
       VALUES (?, ?, 'outgoing', ?, ?, NULL, ?, ?)`,
    )
    .bind(logId, friend.id, currentStep.message_type, currentStep.message_content, currentStep.id, jstNow())
    .run();

  // Determine next step (find the step after currentStep in the sorted list)
  const currentIndex = steps.indexOf(currentStep);
  const nextStep = currentIndex + 1 < steps.length ? steps[currentIndex + 1] : null;

  if (nextStep) {
    // Schedule next delivery with stealth jitter + delivery window enforcement
    const nextDeliveryDate = new Date(Date.now() + 9 * 60 * 60_000);
    nextDeliveryDate.setMinutes(nextDeliveryDate.getMinutes() + nextStep.delay_minutes);
    const hourApplied = applyDeliveryHour(nextDeliveryDate, nextStep.delivery_hour);
    // When delivery_hour is explicitly set, skip the general delivery window enforcement
    const windowedDate = nextStep.delivery_hour != null ? hourApplied : enforceDeliveryWindow(hourApplied, preferredHour);
    const jitteredDate = jitterDeliveryTime(windowedDate);
    await advanceFriendScenario(db, fs.id, currentStep.step_order, jitteredDate.toISOString().slice(0, -1) + '+09:00');
  } else {
    // This was the last step
    await completeFriendScenario(db, fs.id);
  }
}

async function evaluateCondition(
  db: D1Database,
  friendId: string,
  step: { condition_type: string | null; condition_value: string | null },
): Promise<boolean> {
  if (!step.condition_type || !step.condition_value) return true;

  switch (step.condition_type) {
    case 'tag_exists': {
      const tag = await db
        .prepare('SELECT 1 FROM friend_tags WHERE friend_id = ? AND tag_id = ?')
        .bind(friendId, step.condition_value)
        .first();
      return !!tag;
    }
    case 'tag_not_exists': {
      const tag = await db
        .prepare('SELECT 1 FROM friend_tags WHERE friend_id = ? AND tag_id = ?')
        .bind(friendId, step.condition_value)
        .first();
      return !tag;
    }
    case 'metadata_equals': {
      const { key, value } = JSON.parse(step.condition_value) as { key: string; value: unknown };
      const friend = await db
        .prepare('SELECT metadata FROM friends WHERE id = ?')
        .bind(friendId)
        .first<{ metadata: string }>();
      const metadata = JSON.parse(friend?.metadata || '{}') as Record<string, unknown>;
      return metadata[key] === value;
    }
    case 'metadata_not_equals': {
      const { key, value } = JSON.parse(step.condition_value) as { key: string; value: unknown };
      const friend = await db
        .prepare('SELECT metadata FROM friends WHERE id = ?')
        .bind(friendId)
        .first<{ metadata: string }>();
      const metadata = JSON.parse(friend?.metadata || '{}') as Record<string, unknown>;
      return metadata[key] !== value;
    }
    default:
      return true;
  }
}

/** Recursively find the first text element in a Flex Message for altText */
function extractFlexAltText(obj: unknown, depth = 0): string | null {
  if (depth > 10 || !obj || typeof obj !== 'object') return null;
  const node = obj as Record<string, unknown>;
  if (node.type === 'text' && typeof node.text === 'string') {
    return node.text.slice(0, 100);
  }
  if (Array.isArray(node.contents)) {
    for (const child of node.contents) {
      const found = extractFlexAltText(child, depth + 1);
      if (found) return found;
    }
  }
  for (const key of ['header', 'body', 'footer']) {
    if (node[key]) {
      const found = extractFlexAltText(node[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Remove empty text nodes from Flex JSON (caused by conditional blocks) */
function cleanEmptyNodes(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return;
  const node = obj as Record<string, unknown>;
  for (const key of ['header', 'body', 'footer']) {
    if (node[key]) cleanEmptyNodes(node[key]);
  }
  if (Array.isArray(node.contents)) {
    node.contents = (node.contents as unknown[]).filter((c) => {
      if (c && typeof c === 'object' && (c as Record<string, unknown>).type === 'text') {
        const text = (c as Record<string, unknown>).text;
        return typeof text === 'string' && text.trim().length > 0;
      }
      return true;
    });
    for (const c of node.contents as unknown[]) cleanEmptyNodes(c);
  }
}

export function buildMessage(messageType: string, messageContent: string): Message {
  if (messageType === 'text') {
    return { type: 'text', text: messageContent };
  }

  if (messageType === 'image') {
    // messageContent is expected to be JSON: { originalContentUrl, previewImageUrl }
    try {
      const parsed = JSON.parse(messageContent) as {
        originalContentUrl: string;
        previewImageUrl: string;
      };
      return {
        type: 'image',
        originalContentUrl: parsed.originalContentUrl,
        previewImageUrl: parsed.previewImageUrl,
      };
    } catch {
      // Fallback: treat as text if parsing fails
      return { type: 'text', text: messageContent };
    }
  }

  if (messageType === 'flex') {
    try {
      const contents = JSON.parse(messageContent);
      // Remove empty text nodes (from {{#if_ref}} conditional blocks)
      cleanEmptyNodes(contents);
      // Extract first text element for altText (shown in notifications)
      const altText = extractFlexAltText(contents) || 'お知らせ';
      return { type: 'flex', altText, contents };
    } catch {
      return { type: 'text', text: messageContent };
    }
  }

  if (messageType === 'video') {
    try {
      const parsed = JSON.parse(messageContent) as {
        originalContentUrl: string;
        previewImageUrl: string;
      };
      return {
        type: 'video',
        originalContentUrl: parsed.originalContentUrl,
        previewImageUrl: parsed.previewImageUrl,
      };
    } catch {
      return { type: 'text', text: messageContent };
    }
  }

  if (messageType === 'audio') {
    try {
      const parsed = JSON.parse(messageContent) as {
        originalContentUrl: string;
        duration: number;
      };
      return {
        type: 'audio',
        originalContentUrl: parsed.originalContentUrl,
        duration: parsed.duration,
      };
    } catch {
      return { type: 'text', text: messageContent };
    }
  }

  if (messageType === 'sticker') {
    try {
      const parsed = JSON.parse(messageContent) as {
        packageId: string;
        stickerId: string;
      };
      return {
        type: 'sticker',
        packageId: parsed.packageId,
        stickerId: parsed.stickerId,
      };
    } catch {
      return { type: 'text', text: messageContent };
    }
  }

  if (messageType === 'location') {
    try {
      const parsed = JSON.parse(messageContent) as {
        title: string;
        address: string;
        latitude: number;
        longitude: number;
      };
      return {
        type: 'location',
        title: parsed.title,
        address: parsed.address,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
      };
    } catch {
      return { type: 'text', text: messageContent };
    }
  }

  if (messageType === 'template') {
    try {
      const parsed = JSON.parse(messageContent) as {
        altText?: string;
        template: Record<string, unknown>;
      };
      return {
        type: 'template',
        altText: parsed.altText || 'お知らせ',
        template: parsed.template,
      };
    } catch {
      return { type: 'text', text: messageContent };
    }
  }

  // Fallback
  return { type: 'text', text: messageContent };
}
