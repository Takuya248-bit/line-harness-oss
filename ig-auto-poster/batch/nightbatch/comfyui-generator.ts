import type { NightbatchConfig } from "./types.js";

/** POST /prompt → poll /history until outputs or timeout. */
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 300_000;

// Windows 等で UI に表示される実ファイル名と異なる場合は ckpt_name を合わせる。
const CHECKPOINT_NAME = "v1-5-pruned-emaonly.ckpt";

const DEFAULT_NEGATIVE =
  "low quality, blurry, watermark, text, logo, ugly, deformed, bad anatomy";

function normalizeBaseUrl(config: NightbatchConfig): string {
  return config.comfyuiBaseUrl.replace(/\/+$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Minimal txt2img: CheckpointLoader → dual CLIPTextEncode → EmptyLatent 1080×1080
 * → KSampler → VAEDecode → SaveImage (API graph format).
 */
function buildTxt2ImgPrompt(positive: string, negative: string): Record<string, unknown> {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: CHECKPOINT_NAME,
      },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: positive,
        clip: ["1", 1],
      },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: negative,
        clip: ["1", 1],
      },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: 1080,
        height: 1080,
        batch_size: 1,
      },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: Math.floor(Math.random() * (2 ** 31 - 1)),
        steps: 20,
        cfg: 8,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["5", 0],
        vae: ["1", 2],
      },
    },
    "7": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "ig_auto_poster",
        images: ["6", 0],
      },
    },
  };
}

interface ComfyImageRef {
  filename: string;
  subfolder: string;
  type: string;
}

interface HistoryEntry {
  outputs?: Record<string, { images?: ComfyImageRef[] }>;
  status?: { completed?: boolean; status_str?: string };
}

function firstImageFromHistoryEntry(entry: HistoryEntry): ComfyImageRef | null {
  const outputs = entry.outputs;
  if (!outputs) return null;
  for (const nodeOut of Object.values(outputs)) {
    const images = nodeOut.images;
    if (images?.length) return images[0] ?? null;
  }
  return null;
}

function parseHistoryPayload(
  promptId: string,
  json: unknown
): HistoryEntry | null {
  if (!json || typeof json !== "object") return null;
  const top = json as Record<string, unknown>;
  const direct = top[promptId];
  if (direct && typeof direct === "object") return direct as HistoryEntry;
  // Single-entry body: the object itself is the entry
  if ("outputs" in top || "status" in top) return top as HistoryEntry;
  return null;
}

async function postPrompt(
  baseUrl: string,
  promptGraph: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: promptGraph,
      client_id: "ig-auto-poster-nightbatch",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /prompt failed ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = (await res.json()) as { prompt_id?: string; error?: string; node_errors?: unknown };
  if (data.error) {
    throw new Error(`ComfyUI /prompt error: ${data.error} ${JSON.stringify(data.node_errors ?? "")}`);
  }
  if (!data.prompt_id) throw new Error("ComfyUI /prompt: missing prompt_id");
  return data.prompt_id;
}

async function pollHistory(baseUrl: string, promptId: string): Promise<HistoryEntry | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
    if (res.ok) {
      const json: unknown = await res.json();
      const entry = parseHistoryPayload(promptId, json);
      if (entry?.status?.status_str === "error") return null;
      const img = entry ? firstImageFromHistoryEntry(entry) : null;
      if (img) return entry;
      // Running or not yet visible: some builds return {} or entry without outputs
      if (entry?.status?.completed === false) {
        /* keep polling */
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function fetchOutputPng(
  baseUrl: string,
  ref: ComfyImageRef
): Promise<Buffer> {
  const q = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  const res = await fetch(`${baseUrl}/view?${q.toString()}`);
  if (!res.ok) {
    throw new Error(`ComfyUI /view failed ${res.status} for ${ref.filename}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function runTxt2ImgToPng(
  positive: string,
  negative: string,
  config: NightbatchConfig
): Promise<Buffer | null> {
  const baseUrl = normalizeBaseUrl(config);
  const graph = buildTxt2ImgPrompt(positive, negative);
  const promptId = await postPrompt(baseUrl, graph);
  const entry = await pollHistory(baseUrl, promptId);
  if (!entry) return null;
  const ref = firstImageFromHistoryEntry(entry);
  if (!ref) return null;
  return fetchOutputPng(baseUrl, ref);
}

/**
 * ComfyUI txt2img (1080×1080 PNG). Throws if generation or download fails.
 */
export async function generateFeedImage(
  imagePrompt: string,
  config: NightbatchConfig
): Promise<Buffer> {
  const buf = await runTxt2ImgToPng(imagePrompt, DEFAULT_NEGATIVE, config);
  if (!buf) throw new Error("ComfyUI feed image: timeout or no output");
  return buf;
}

/**
 * TODO(reel): Swap txt2img fallback for a real video workflow (e.g. AnimateDiff / video VAE)
 * and return an MP4 buffer; until then this mirrors the feed path (PNG bytes) or null on failure.
 */
export async function generateReelVideo(
  videoPrompt: string,
  config: NightbatchConfig
): Promise<Buffer | null> {
  return runTxt2ImgToPng(videoPrompt, DEFAULT_NEGATIVE, config);
}
