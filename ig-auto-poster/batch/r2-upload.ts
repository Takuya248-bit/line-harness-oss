export async function uploadToR2(
  accountId: string,
  bucketName: string,
  apiToken: string,
  key: string,
  data: Buffer,
  contentType: string = "image/png",
): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects/${key}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": contentType,
    },
    body: new Uint8Array(data),
  });
  if (!res.ok) throw new Error(`R2 upload error: ${res.status}`);
  return key;
}

export async function deleteR2Prefix(
  accountId: string,
  bucketName: string,
  apiToken: string,
  prefix: string,
): Promise<number> {
  const listUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects?prefix=${encodeURIComponent(prefix)}&limit=100`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!listRes.ok) return 0;

  const listData = await listRes.json() as { result: { key: string }[] };
  if (!listData.result || listData.result.length === 0) return 0;

  let deleted = 0;
  for (const obj of listData.result) {
    const delUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects/${obj.key}`;
    const delRes = await fetch(delUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (delRes.ok) deleted++;
  }
  return deleted;
}
