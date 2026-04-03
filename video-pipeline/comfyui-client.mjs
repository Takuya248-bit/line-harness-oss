#!/usr/bin/env node
/**
 * ComfyUI APIクライアント (Mac → Windows)
 *
 * 使い方:
 *   node comfyui-client.mjs status                     # 接続確認
 *   node comfyui-client.mjs upload <file>               # 画像アップロード
 *   node comfyui-client.mjs run <workflow.json>          # ワークフロー実行
 *   node comfyui-client.mjs download <filename> <dest>   # 結果ダウンロード
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// 設定ファイルから読み込み、なければ環境変数 → デフォルト
const CONFIG_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), 'config.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch {}

const COMFYUI_HOST = config.comfyui_host || process.env.COMFYUI_HOST || '192.168.1.100';
const COMFYUI_PORT = config.comfyui_port || process.env.COMFYUI_PORT || '8188';
const BASE_URL = `http://${COMFYUI_HOST}:${COMFYUI_PORT}`;

// --- API関数 ---

async function checkStatus() {
  const res = await fetch(`${BASE_URL}/system_stats`);
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  const data = await res.json();
  console.log('ComfyUI接続OK');
  console.log(`  GPU: ${data.devices?.[0]?.name || 'unknown'}`);
  console.log(`  VRAM: ${Math.round((data.devices?.[0]?.vram_total || 0) / 1024 / 1024)}MB`);
  console.log(`  VRAM空き: ${Math.round((data.devices?.[0]?.vram_free || 0) / 1024 / 1024)}MB`);
  console.log(`  Queue: ${JSON.stringify(data.queue || {})}`);
  return data;
}

async function uploadImage(filePath) {
  const file = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const formData = new FormData();
  formData.append('image', new Blob([file]), filename);
  formData.append('overwrite', 'true');

  const res = await fetch(`${BASE_URL}/upload/image`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const data = await res.json();
  console.log(`アップロード完了: ${data.name}`);
  return data;
}

async function queuePrompt(workflow) {
  const clientId = randomUUID();
  const body = { prompt: workflow, client_id: clientId };
  const res = await fetch(`${BASE_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Queue failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  console.log(`ワークフロー投入: prompt_id=${data.prompt_id}`);
  return { promptId: data.prompt_id, clientId };
}

async function waitForCompletion(promptId, timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${BASE_URL}/history/${promptId}`);
    const data = await res.json();
    if (data[promptId]?.status?.completed) {
      console.log('処理完了');
      return data[promptId];
    }
    if (data[promptId]?.status?.status_str === 'error') {
      throw new Error(`処理エラー: ${JSON.stringify(data[promptId].status)}`);
    }
    await new Promise(r => setTimeout(r, 2000));
    process.stdout.write('.');
  }
  throw new Error('タイムアウト');
}

async function getOutputImages(promptId) {
  const res = await fetch(`${BASE_URL}/history/${promptId}`);
  const data = await res.json();
  const outputs = data[promptId]?.outputs || {};
  const images = [];
  for (const nodeId of Object.keys(outputs)) {
    for (const img of (outputs[nodeId].images || [])) {
      images.push(img);
    }
  }
  return images;
}

async function downloadFile(filename, destPath, subfolder = '') {
  const params = new URLSearchParams({ filename, subfolder, type: 'output' });
  const res = await fetch(`${BASE_URL}/view?${params}`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  console.log(`ダウンロード完了: ${destPath} (${buffer.length} bytes)`);
}

async function runWorkflow(workflowPath) {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
  const { promptId } = await queuePrompt(workflow);
  const result = await waitForCompletion(promptId);
  const images = await getOutputImages(promptId);
  console.log(`出力ファイル: ${images.map(i => i.filename).join(', ')}`);

  // 自動ダウンロード
  const outDir = path.join(path.dirname(workflowPath), 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  for (const img of images) {
    await downloadFile(img.filename, path.join(outDir, img.filename), img.subfolder || '');
  }
  return images;
}

// --- CLI ---
const [,, cmd, ...args] = process.argv;

try {
  switch (cmd) {
    case 'status':
      await checkStatus();
      break;
    case 'upload':
      if (!args[0]) { console.error('Usage: upload <file>'); process.exit(1); }
      await uploadImage(args[0]);
      break;
    case 'run':
      if (!args[0]) { console.error('Usage: run <workflow.json>'); process.exit(1); }
      await runWorkflow(args[0]);
      break;
    case 'download':
      if (!args[0] || !args[1]) { console.error('Usage: download <filename> <dest>'); process.exit(1); }
      await downloadFile(args[0], args[1], args[2] || '');
      break;
    default:
      console.log(`ComfyUI Client - ${BASE_URL}`);
      console.log('Commands: status, upload, run, download');
      console.log('Config: video-pipeline/config.json の comfyui_host を設定');
  }
} catch (e) {
  console.error(`エラー: ${e.message}`);
  process.exit(1);
}
