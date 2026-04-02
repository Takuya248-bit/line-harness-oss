const CF_API_URL = "https://api.cloudflare.com/client/v4";

export async function d1Query<T>(
  accountId: string,
  databaseId: string,
  apiToken: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await fetch(
    `${CF_API_URL}/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  if (!res.ok) throw new Error(`D1 API error: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { result: { results: T[] }[] };
  return data.result[0]?.results ?? [];
}

export async function d1Execute(
  accountId: string,
  databaseId: string,
  apiToken: string,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  const res = await fetch(
    `${CF_API_URL}/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  if (!res.ok) throw new Error(`D1 API error: ${res.status} ${await res.text()}`);
}
