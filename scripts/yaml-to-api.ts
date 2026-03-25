#!/usr/bin/env npx tsx
/**
 * YAML -> LINE Harness API 変換レイヤー
 *
 * lstep-automation/workflows/ の YAML 形式を読み込み、
 * LINE Harness API へのコールに変換して実行する。
 *
 * Usage:
 *   npx tsx scripts/yaml-to-api.ts <workflow.yaml> [--dry-run]
 *
 * Environment:
 *   API_BASE  - API base URL (default: http://localhost:8787)
 *   API_TOKEN - Bearer token (default: test-api-key)
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

// ============================================================
// Types
// ============================================================

interface WorkflowStep {
  name: string;
  action: string;
  params: Record<string, unknown>;
  continue_on_error?: boolean;
}

interface Workflow {
  name: string;
  steps: WorkflowStep[];
}

interface ApiCallResult {
  stepName: string;
  action: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
  response?: unknown;
  success: boolean;
  error?: string;
}

// ============================================================
// Config
// ============================================================

const API_BASE = process.env.API_BASE || 'http://localhost:8787';
const API_TOKEN = process.env.API_TOKEN || 'test-api-key';

// ============================================================
// API Client
// ============================================================

async function apiCall(
  method: string,
  apiPath: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const url = `${API_BASE}${apiPath}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_TOKEN}`,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { rawResponse: text, status: res.status };
  }
}

// ============================================================
// Action Converters
// ============================================================
// 各 lstep-automation アクションを LINE Harness API コールに変換する。
// まずは create_template のみ実装。他のアクションは段階的に追加。

type ActionConverter = (
  params: Record<string, unknown>,
  stepName: string,
) => Promise<ApiCallResult>;

/**
 * create_template
 *
 * lstep-automation 形式:
 *   action: create_template
 *   params:
 *     type: standard | image | text | button
 *     name: "テンプレート名"
 *     folder: "フォルダ名"           # -> category に変換
 *     content: "テキスト内容"        # type=text の場合
 *     file: "/path/to/image.png"    # type=image の場合（未対応、メタデータのみ）
 *     messages:                      # type=standard の場合
 *       - kind: text
 *         content: "..."
 *       - kind: image
 *         url: "..."
 *     buttons:                       # type=button の場合
 *       - label: "ボタン1"
 *       - label: "ボタン2"
 *
 * LINE Harness API:
 *   POST /api/templates
 *   { name, category, messageType, messageContent }
 */
async function convertCreateTemplate(
  params: Record<string, unknown>,
  stepName: string,
): Promise<ApiCallResult> {
  const name = (params.name as string) || stepName;
  const category = (params.folder as string) || 'general';
  const type = (params.type as string) || 'standard';

  let messageType: string;
  let messageContent: string;

  switch (type) {
    case 'text': {
      messageType = 'text';
      messageContent = (params.content as string) || '';
      break;
    }

    case 'image': {
      messageType = 'image';
      // image の場合、URL またはファイルパスをメタデータとして格納
      const filePath = params.file as string | undefined;
      const url = params.url as string | undefined;
      messageContent = JSON.stringify({
        type: 'image',
        originalContentUrl: url || filePath || '',
        previewImageUrl: url || filePath || '',
      });
      break;
    }

    case 'button': {
      messageType = 'flex';
      const buttons = (params.buttons as Array<string | { label: string }>) || [];
      const buttonMessages =
        (params.button_messages as string[]) || buttons.map((b) => (typeof b === 'string' ? b : b.label));
      const flexContent = {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: name,
              weight: 'bold',
              size: 'lg',
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: buttons.map((b, i) => ({
            type: 'button',
            action: {
              type: 'message',
              label: typeof b === 'string' ? b : b.label,
              text: buttonMessages[i] || (typeof b === 'string' ? b : b.label),
            },
            style: i === 0 ? 'primary' : 'secondary',
          })),
        },
      };
      messageContent = JSON.stringify(flexContent);
      break;
    }

    case 'standard':
    default: {
      const messages = (params.messages as Array<{ kind: string; content?: string; url?: string }>) || [];
      if (messages.length === 0) {
        messageType = 'text';
        messageContent = (params.content as string) || '';
      } else if (messages.length === 1) {
        const msg = messages[0];
        if (msg.kind === 'image') {
          messageType = 'image';
          messageContent = JSON.stringify({
            type: 'image',
            originalContentUrl: msg.url || '',
            previewImageUrl: msg.url || '',
          });
        } else {
          messageType = 'text';
          messageContent = msg.content || '';
        }
      } else {
        // 複数メッセージ -> flex carousel としてまとめる
        messageType = 'flex';
        const bubbles = messages.map((msg) => {
          if (msg.kind === 'image') {
            return {
              type: 'bubble',
              hero: {
                type: 'image',
                url: msg.url || '',
                size: 'full',
                aspectRatio: '20:13',
              },
            };
          }
          return {
            type: 'bubble',
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: msg.content || '',
                  wrap: true,
                  size: 'sm',
                },
              ],
            },
          };
        });
        messageContent = JSON.stringify({
          type: 'carousel',
          contents: bubbles,
        });
      }
      break;
    }
  }

  const apiPath = '/api/templates';
  const body = {
    name,
    category,
    messageType,
    messageContent,
  };

  return {
    stepName,
    action: 'create_template',
    method: 'POST',
    path: apiPath,
    body,
    success: true,
  };
}

/**
 * create_carousel (lstep-automation 固有)
 * -> LINE Harness の flex テンプレートに変換
 */
async function convertCreateCarousel(
  params: Record<string, unknown>,
  stepName: string,
): Promise<ApiCallResult> {
  const name = (params.name as string) || stepName;
  const category = 'carousel';
  const title = (params.title as string) || '';
  const body = (params.body as string) || '';
  const buttons = (params.buttons as string[]) || [];
  const buttonMessages = (params.button_messages as string[]) || buttons;

  const flexContent = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true },
        { type: 'text', text: body, size: 'sm', color: '#666666', margin: 'md', wrap: true },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: buttons.map((label, i) => ({
        type: 'button',
        action: {
          type: 'message',
          label,
          text: buttonMessages[i] || label,
        },
        style: i === 0 ? 'primary' : 'secondary',
      })),
    },
  };

  return {
    stepName,
    action: 'create_carousel',
    method: 'POST',
    path: '/api/templates',
    body: {
      name,
      category,
      messageType: 'flex',
      messageContent: JSON.stringify(flexContent),
    },
    success: true,
  };
}

// ---- アクション未実装時のフォールバック ----
async function convertUnsupported(
  params: Record<string, unknown>,
  stepName: string,
  action: string,
): Promise<ApiCallResult> {
  return {
    stepName,
    action,
    method: 'SKIP',
    path: '',
    body: params,
    success: false,
    error: `Action "${action}" is not yet implemented. Skipping.`,
  };
}

// ============================================================
// Action Registry
// ============================================================

const ACTION_CONVERTERS: Record<string, ActionConverter> = {
  create_template: convertCreateTemplate,
  create_carousel: convertCreateCarousel,
};

// ============================================================
// Main
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const yamlPath = args.find((a) => !a.startsWith('--'));

  if (!yamlPath) {
    console.error('Usage: npx tsx scripts/yaml-to-api.ts <workflow.yaml> [--dry-run]');
    process.exit(1);
  }

  const resolvedPath = path.resolve(yamlPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const workflow = yaml.load(content) as Workflow;

  console.log(`============================================`);
  console.log(` YAML -> LINE Harness API`);
  console.log(` Workflow: ${workflow.name}`);
  console.log(` Steps:    ${workflow.steps?.length || 0}`);
  console.log(` Mode:     ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(` API:      ${API_BASE}`);
  console.log(`============================================`);
  console.log('');

  const results: ApiCallResult[] = [];

  for (const step of workflow.steps || []) {
    console.log(`>>> ${step.name} (${step.action})`);

    const converter = ACTION_CONVERTERS[step.action];
    let result: ApiCallResult;

    if (converter) {
      result = await converter(step.params || {}, step.name);
    } else {
      result = await convertUnsupported(step.params || {}, step.name, step.action);
    }

    if (dryRun) {
      console.log(`  [DRY RUN] ${result.method} ${result.path}`);
      console.log(`  Body: ${JSON.stringify(result.body, null, 2).substring(0, 200)}...`);
    } else if (result.method !== 'SKIP') {
      try {
        const response = await apiCall(result.method, result.path, result.body);
        result.response = response;
        const respObj = response as Record<string, unknown>;
        if (respObj?.success === false) {
          result.success = false;
          result.error = (respObj.error as string) || 'API returned success: false';
        }
        console.log(`  -> ${result.success ? 'OK' : 'FAIL'}: ${JSON.stringify(response)}`);
      } catch (err) {
        result.success = false;
        result.error = String(err);
        console.log(`  -> ERROR: ${err}`);
      }
    } else {
      console.log(`  -> SKIPPED: ${result.error}`);
    }

    results.push(result);

    if (!result.success && !step.continue_on_error) {
      console.error(`\nStep "${step.name}" failed and continue_on_error is not set. Stopping.`);
      break;
    }
  }

  // ---- Summary ----
  console.log('');
  console.log('============================================');
  console.log(' Summary');
  console.log('============================================');
  const ok = results.filter((r) => r.success).length;
  const fail = results.filter((r) => !r.success).length;
  const skip = results.filter((r) => r.method === 'SKIP').length;
  console.log(` Total: ${results.length} | OK: ${ok} | Fail: ${fail} | Skipped: ${skip}`);

  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
