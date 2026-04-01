import type { InvoiceItem } from './notion.js';
import type { ChatMessage } from './chat-reader.js';

export interface ExtractResult {
  items: InvoiceItem[];
  notes: string;
  summary: string;
}

const DEFAULT_NOTES = `【料金に含まれているもの】
・授業料
・3食の食事
※外泊プランの場合お食事は含まれません。
・宿舎
・空港送迎
・卒業後コミュニティ
・学習面談
・カリキュラム作成
・ツアー・イベント紹介

※以下は料金に含まれておりません。
・航空券
・VISA
・現地での生活費
・海外保険料`;

function normalizeItems(raw: unknown): InvoiceItem[] {
  if (!Array.isArray(raw)) return [];
  const out: InvoiceItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = String(r.name ?? '').trim();
    if (!name) continue;
    let quantity = Number(r.quantity);
    if (!Number.isFinite(quantity)) quantity = 1;
    let unitPrice = Number(String(r.unit_price).replace(/[,，]/g, ''));
    if (!Number.isFinite(unitPrice)) unitPrice = 0;
    let amount = Number(String(r.amount).replace(/[,，]/g, ''));
    if (!Number.isFinite(amount)) amount = quantity * unitPrice;
    out.push({ name, quantity, unit_price: unitPrice, amount });
  }
  return out;
}

export async function extractFromChat(
  apiKey: string,
  messages: ChatMessage[],
  recipientName: string,
): Promise<ExtractResult> {
  const chatText = messages
    .map((m) => `${m.direction === 'incoming' ? recipientName : 'スタッフ'}: ${m.content}`)
    .join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `以下のLINEチャット履歴から、請求書に必要な情報を抽出してJSON形式で返してください。

抽出ルール:
- コース名は正式名称（期間含む）で記載
- 割引がある場合は別行でマイナス金額として記載（例: 入学金 30,000 と 入学金無料 -30,000）
- 金額が明示されていない場合は数値0とし、品名に「（金額不明）」を付記
- summaryは会話の要約（何のコースをどういう条件で契約したか）を50文字以内で

チャット履歴:
${chatText}

以下のJSON形式のみで返してください（説明不要）:
{"items":[{"name":"品目名","quantity":1,"unit_price":金額,"amount":金額}],"notes":"","summary":"要約"}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API error: ${res.status}`);
  }

  const body: any = await res.json();
  const text = body.content[0].text as string;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI応答からJSONを抽出できませんでした');
  }

  const parsed = JSON.parse(jsonMatch[0]) as { items?: unknown; notes?: string; summary?: string };

  const result: ExtractResult = {
    items: normalizeItems(parsed.items),
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  };

  if (!result.notes || result.notes.trim() === '') {
    result.notes = DEFAULT_NOTES;
  }

  return result;
}

export { DEFAULT_NOTES };
