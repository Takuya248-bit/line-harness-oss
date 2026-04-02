/**
 * Discord Bot API 通知（ボタン付き）
 */

interface NotifyOptions {
  username: string;
  message: string;
  module: string;
  confidence: number;
  phase?: string;
  draft?: string;
  inquiryId?: string;
  draftSource?: string;
}

export async function notifyDiscord(
  botToken: string,
  channelId: string,
  options: NotifyOptions,
): Promise<string | null> {
  const moduleEmoji: Record<string, string> = {
    inquiry: '📩',
    research: '🔍',
    content: '📝',
    project: '📋',
    analysis: '📊',
  };

  const emoji = moduleEmoji[options.module] ?? '📨';
  const phaseText = options.phase ? ` | Phase: ${options.phase}` : '';
  const sourceLabel = options.draftSource ? ` [${options.draftSource}]` : '';

  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: 'ユーザー', value: options.username, inline: true },
    { name: '確信度', value: `${(options.confidence * 100).toFixed(0)}%`, inline: true },
  ];

  if (options.draftSource) {
    fields.push({ name: '生成方式', value: options.draftSource, inline: true });
  }

  if (options.draft) {
    fields.push({
      name: '💬 返信ドラフト',
      value: options.draft.length > 1000 ? options.draft.slice(0, 1000) + '...' : options.draft,
      inline: false,
    });
  }

  const embed = {
    title: `${emoji} ${options.module.toUpperCase()}${sourceLabel}`,
    description: options.message.length > 200 ? options.message.slice(0, 200) + '...' : options.message,
    color: options.module === 'inquiry' ? 0x3b82f6 : 0x6b7280,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: `Business OS${phaseText}` },
  };

  const components = options.inquiryId
    ? [{
        type: 1,
        components: [
          { type: 2, style: 3, label: '承認して送信', custom_id: `approve_${options.inquiryId}`, emoji: { name: '✅' } },
          { type: 2, style: 1, label: '修正して送信', custom_id: `edit_${options.inquiryId}`, emoji: { name: '✏️' } },
          { type: 2, style: 2, label: '再生成', custom_id: `regen_${options.inquiryId}`, emoji: { name: '🔄' } },
        ],
      }]
    : [];

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${botToken}`,
      },
      body: JSON.stringify({ embeds: [embed], components }),
    });

    if (!res.ok) {
      console.error(`Discord notify failed: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { id: string };
    return data.id;
  } catch (err) {
    console.error('Discord notify error:', err);
    return null;
  }
}
