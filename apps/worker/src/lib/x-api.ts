/**
 * X (Twitter) API v2 Client for Cloudflare Workers
 *
 * OAuth 1.0a署名をWeb Crypto APIで実装。
 * 外部依存なし、fetch()ベースでWorkers互換。
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface XApiConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export interface XPostResult {
  id: string;
  text: string;
}

interface XApiErrorDetail {
  title?: string;
  detail?: string;
  type?: string;
  status?: number;
}

export class XApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "XApiError";
  }
}

// ---------------------------------------------------------------------------
// RFC 3986 Percent Encoding
// ---------------------------------------------------------------------------

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// ---------------------------------------------------------------------------
// OAuth 1.0a helpers (Web Crypto API)
// ---------------------------------------------------------------------------

async function hmacSha1(key: string, data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function generateNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

async function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): Promise<string> {
  // 1. Sort parameters alphabetically by key, then by value
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");

  // 2. Signature Base String = METHOD&URL&PARAMS
  const signatureBaseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  // 3. Signing Key = consumerSecret&tokenSecret
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;

  // 4. HMAC-SHA1
  const signatureBuffer = await hmacSha1(signingKey, signatureBaseString);

  // 5. Base64
  return arrayBufferToBase64(signatureBuffer);
}

async function generateOAuthHeader(
  method: string,
  url: string,
  config: XApiConfig,
  additionalParams?: Record<string, string>,
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: config.apiKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: generateTimestamp(),
    oauth_token: config.accessToken,
    oauth_version: "1.0",
  };

  // Merge additional params (query string / body params) for signature base
  const allParams: Record<string, string> = {
    ...oauthParams,
    ...additionalParams,
  };

  const signature = await generateOAuthSignature(
    method,
    url,
    allParams,
    config.apiSecret,
    config.accessSecret,
  );

  oauthParams["oauth_signature"] = signature;

  // Build Authorization header value
  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

// ---------------------------------------------------------------------------
// XApiClient
// ---------------------------------------------------------------------------

const V2_BASE = "https://api.twitter.com/2";
const V1_UPLOAD_BASE = "https://upload.twitter.com/1.1";

export class XApiClient {
  constructor(private config: XApiConfig) {}

  // -----------------------------------------------------------------------
  // Tweet CRUD
  // -----------------------------------------------------------------------

  /**
   * ツイートを投稿する
   */
  async createTweet(
    text: string,
    options?: {
      replyToId?: string;
      mediaIds?: string[];
    },
  ): Promise<XPostResult> {
    const url = `${V2_BASE}/tweets`;

    const body: Record<string, unknown> = { text };

    if (options?.replyToId) {
      body.reply = { in_reply_to_tweet_id: options.replyToId };
    }
    if (options?.mediaIds && options.mediaIds.length > 0) {
      body.media = { media_ids: options.mediaIds };
    }

    const authHeader = await generateOAuthHeader("POST", url, this.config);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    await this.handleErrors(res);

    const json = (await res.json()) as { data: { id: string; text: string } };
    return { id: json.data.id, text: json.data.text };
  }

  /**
   * ツイートのメトリクスを取得する (v2 tweet lookup)
   */
  async getTweet(tweetId: string): Promise<{
    id: string;
    public_metrics: {
      like_count: number;
      retweet_count: number;
      reply_count: number;
      impression_count: number;
    };
  }> {
    const baseUrl = `${V2_BASE}/tweets/${tweetId}`;
    const queryParams = { 'tweet.fields': 'public_metrics' };
    const authHeader = await generateOAuthHeader('GET', baseUrl, this.config, queryParams);

    const url = `${baseUrl}?tweet.fields=public_metrics`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
      },
    });

    await this.handleErrors(res);

    const json = (await res.json()) as {
      data: {
        id: string;
        public_metrics: {
          like_count: number;
          retweet_count: number;
          reply_count: number;
          impression_count: number;
        };
      };
    };
    return json.data;
  }

  /**
   * ツイートを削除する
   */
  async deleteTweet(tweetId: string): Promise<void> {
    const url = `${V2_BASE}/tweets/${tweetId}`;
    const authHeader = await generateOAuthHeader("DELETE", url, this.config);

    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: authHeader,
      },
    });

    await this.handleErrors(res);
  }

  // -----------------------------------------------------------------------
  // Media Upload (v1.1)
  // -----------------------------------------------------------------------

  /**
   * 画像をアップロードする (v1.1 media/upload)
   *
   * Freeプランでは使えない可能性あり。
   * 対応MIMEタイプ: image/jpeg, image/png, image/gif, image/webp
   *
   * @returns media_id_string
   */
  async uploadMedia(
    imageData: ArrayBuffer,
    mimeType: string,
  ): Promise<string> {
    const url = `${V1_UPLOAD_BASE}/media/upload.json`;

    const base64Data = arrayBufferToBase64(imageData);

    // media/upload はform-encodedで送信
    const formParams: Record<string, string> = {
      media_data: base64Data,
      media_type: mimeType,
    };

    // OAuth署名にはform bodyのパラメータも含める
    const authHeader = await generateOAuthHeader(
      "POST",
      url,
      this.config,
      formParams,
    );

    const formBody = Object.entries(formParams)
      .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
      .join("&");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    });

    await this.handleErrors(res);

    const json = (await res.json()) as { media_id_string: string };
    return json.media_id_string;
  }

  // -----------------------------------------------------------------------
  // Thread (連投)
  // -----------------------------------------------------------------------

  /**
   * スレッドとして複数ツイートを連続投稿する。
   * 各ツイートは前のツイートへのリプライとして投稿される。
   */
  async createThread(texts: string[]): Promise<XPostResult[]> {
    if (texts.length === 0) {
      throw new Error("Thread must contain at least one tweet");
    }

    const results: XPostResult[] = [];

    for (let i = 0; i < texts.length; i++) {
      const result = await this.createTweet(texts[i], {
        replyToId: i > 0 ? results[i - 1].id : undefined,
      });
      results.push(result);

      // レート制限回避: 連投間に少し待つ（最後のツイート後は不要）
      if (i < texts.length - 1) {
        await sleep(1000);
      }
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  private async handleErrors(res: Response): Promise<void> {
    if (res.ok) return;

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }

    // Rate limit
    if (res.status === 429) {
      const resetAt = res.headers.get("x-rate-limit-reset");
      const retryAfter = resetAt
        ? new Date(parseInt(resetAt, 10) * 1000).toISOString()
        : "unknown";
      throw new XApiError(
        `Rate limited. Resets at ${retryAfter}`,
        429,
        body,
      );
    }

    // Auth error
    if (res.status === 401) {
      throw new XApiError(
        "Authentication failed. Check your API keys and tokens.",
        401,
        body,
      );
    }

    // Forbidden (e.g., Free plan restrictions)
    if (res.status === 403) {
      throw new XApiError(
        "Forbidden. Your API plan may not have access to this endpoint.",
        403,
        body,
      );
    }

    // Generic error
    const detail =
      body && typeof body === "object" && "detail" in (body as Record<string, unknown>)
        ? (body as XApiErrorDetail).detail
        : JSON.stringify(body);

    throw new XApiError(
      `X API error ${res.status}: ${detail}`,
      res.status,
      body,
    );
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
