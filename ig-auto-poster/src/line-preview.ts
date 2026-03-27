const LINE_API_BASE = "https://api.line.me/v2/bot";

interface LineMessage {
  type: string;
  originalContentUrl?: string;
  previewImageUrl?: string;
  text?: string;
  quickReply?: {
    items: Array<{
      type: "action";
      action: { type: string; label: string; data?: string; text?: string };
    }>;
  };
}

function buildPreviewMessages(
  imageUrls: string[],
  contentId: number,
  templateType: string,
  title: string,
): LineMessage[][] {
  const messages: LineMessage[][] = [];
  const batch: LineMessage[] = [];

  for (const url of imageUrls) {
    batch.push({
      type: "image",
      originalContentUrl: url,
      previewImageUrl: url,
    });
  }

  const firstBatch = batch.slice(0, 5);
  const secondBatch = batch.slice(5);

  if (secondBatch.length > 0) {
    messages.push(firstBatch);
    const infoMessage: LineMessage = {
      type: "text",
      text: `新しい投稿プレビュー\nテーマ: ${title.replaceAll("\\n", " ")}\nテンプレート: ${templateType}\nスライド数: ${imageUrls.length}枚`,
      quickReply: {
        items: [
          { type: "action", action: { type: "postback", label: "投稿する", data: `action=approve&id=${contentId}` } },
          { type: "action", action: { type: "postback", label: "やり直し", data: `action=regenerate&id=${contentId}` } },
          { type: "action", action: { type: "postback", label: "スキップ", data: `action=skip&id=${contentId}` } },
        ],
      },
    };
    secondBatch.push(infoMessage);
    messages.push(secondBatch);
  } else {
    const infoMessage: LineMessage = {
      type: "text",
      text: `新しい投稿プレビュー\nテーマ: ${title.replaceAll("\\n", " ")}\nテンプレート: ${templateType}\nスライド数: ${imageUrls.length}枚`,
      quickReply: {
        items: [
          { type: "action", action: { type: "postback", label: "投稿する", data: `action=approve&id=${contentId}` } },
          { type: "action", action: { type: "postback", label: "やり直し", data: `action=regenerate&id=${contentId}` } },
          { type: "action", action: { type: "postback", label: "スキップ", data: `action=skip&id=${contentId}` } },
        ],
      },
    };
    firstBatch.push(infoMessage);
    messages.push(firstBatch);
  }

  return messages;
}

async function pushMessages(
  userId: string,
  messages: LineMessage[],
  channelAccessToken: string,
): Promise<void> {
  const res = await fetch(`${LINE_API_BASE}/message/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({ to: userId, messages }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }
}

export async function sendPreview(
  imageUrls: string[],
  contentId: number,
  templateType: string,
  title: string,
  userId: string,
  channelAccessToken: string,
): Promise<void> {
  const messageBatches = buildPreviewMessages(imageUrls, contentId, templateType, title);
  for (const batch of messageBatches) {
    await pushMessages(userId, batch, channelAccessToken);
  }
}

export async function sendNotification(
  text: string,
  userId: string,
  channelAccessToken: string,
): Promise<void> {
  await pushMessages(userId, [{ type: "text", text }], channelAccessToken);
}

export function parsePostback(data: string): { action: string; id: number } | null {
  const params = new URLSearchParams(data);
  const action = params.get("action");
  const id = params.get("id");
  if (!action || !id) return null;
  return { action, id: parseInt(id, 10) };
}
