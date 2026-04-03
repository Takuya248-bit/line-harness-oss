export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqResponse {
  choices: { message: { content: string } }[];
}

export type GroqCallOptions = {
  temperature?: number;
  maxTokens?: number;
  /** Cloudflare Workers: pass env.CEREBRAS_API_KEY. When set, Cerebras is used; otherwise Groq. */
  cerebrasApiKey?: string;
};

function getProvider(
  groqKey: string,
  cerebrasKey?: string,
): { url: string; model: string; headers: Record<string, string> } {
  if (cerebrasKey) {
    return {
      url: "https://api.cerebras.ai/v1/chat/completions",
      model: "qwen-3-235b-a22b-instruct-2507",
      headers: {
        Authorization: `Bearer ${cerebrasKey}`,
        "Content-Type": "application/json",
      },
    };
  }
  return {
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
  };
}

export async function groqChat(
  apiKey: string,
  messages: GroqMessage[],
  options?: GroqCallOptions,
): Promise<string> {
  const provider = getProvider(apiKey, options?.cerebrasApiKey);

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
  options?: GroqCallOptions,
): Promise<T> {
  const messagesWithFormat = [
    ...messages,
    { role: "user" as const, content: "JSONのみを返してください。マークダウンのコードブロックは不要です。" },
  ];
  const raw = await groqChat(apiKey, messagesWithFormat, options);
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned) as T;
}
