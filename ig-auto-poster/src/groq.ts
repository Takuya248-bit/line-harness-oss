export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqResponse {
  choices: { message: { content: string } }[];
}

export async function groqChat(
  apiKey: string,
  messages: GroqMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1024,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as GroqResponse;
  return data.choices[0]?.message?.content ?? "";
}

export async function groqJson<T>(
  apiKey: string,
  messages: GroqMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<T> {
  const messagesWithFormat = [
    ...messages,
    { role: "user" as const, content: "JSONのみを返してください。マークダウンのコードブロックは不要です。" },
  ];
  const raw = await groqChat(apiKey, messagesWithFormat, options);
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned) as T;
}
