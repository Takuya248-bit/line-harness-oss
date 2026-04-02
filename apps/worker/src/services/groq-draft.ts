/**
 * Groq API (Llama 3.3-70B) でドラフト生成
 * Haiku代替。完全無料。
 */

interface GroqDraftOptions {
  systemPrompt: string;
  userPrompt: string;
  groqApiKey: string;
}

export async function generateDraftWithGroq(
  options: GroqDraftOptions,
): Promise<string | null> {
  try {
    const res = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.groqApiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: options.userPrompt },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      },
    );

    if (!res.ok) {
      console.error(`Groq API error: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.error('Groq draft error:', err);
    return null;
  }
}
