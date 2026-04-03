export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqResponse {
  choices: { message: { content: string } }[];
}

// LLM provider: GEMINI_API_KEY があれば Gemini 2.0 Flash、なければ Groq
function getProvider(apiKey: string): { url: string; model: string; headers: Record<string, string> } {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      model: "gemini-2.0-flash",
      headers: {
        Authorization: `Bearer ${geminiKey}`,
        "Content-Type": "application/json",
      },
    };
  }
  return {
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  };
}

export async function groqChat(
  apiKey: string,
  messages: GroqMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const provider = getProvider(apiKey);

  const res = await fetch(provider.url, {
    method: "POST",
    headers: provider.headers,
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1024,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error ${res.status}: ${text}`);
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
