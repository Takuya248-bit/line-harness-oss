/**
 * Discord webhook 通知
 * 問い合わせ受信時にDiscordチャネルに通知する。
 */

interface NotifyOptions {
  username: string;
  message: string;
  module: string;
  confidence: number;
  phase?: string;
}

export async function notifyDiscord(
  webhookUrl: string,
  options: NotifyOptions,
): Promise<void> {
  const moduleEmoji: Record<string, string> = {
    inquiry: '📩',
    research: '🔍',
    content: '📝',
    project: '📋',
    analysis: '📊',
  };

  const emoji = moduleEmoji[options.module] ?? '📨';
  const phaseText = options.phase ? ` | Phase: ${options.phase}` : '';

  const embed = {
    title: `${emoji} ${options.module.toUpperCase()}`,
    description: options.message.length > 200
      ? options.message.slice(0, 200) + '...'
      : options.message,
    color: options.module === 'inquiry' ? 0x3b82f6 : 0x6b7280,
    fields: [
      { name: 'ユーザー', value: options.username, inline: true },
      { name: '確信度', value: `${(options.confidence * 100).toFixed(0)}%`, inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: `Business OS${phaseText}` },
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed],
      }),
    });
    if (!res.ok) {
      console.error(`Discord notify failed: ${res.status}`);
    }
  } catch (err) {
    console.error('Discord notify error:', err);
  }
}
