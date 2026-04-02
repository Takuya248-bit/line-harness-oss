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
    body: data,
  });
  if (!res.ok) throw new Error(`R2 upload error: ${res.status}`);
  return key;
}
