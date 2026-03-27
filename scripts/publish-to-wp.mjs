#!/usr/bin/env node
/**
 * WordPress REST API 記事投稿スクリプト
 * Node.js標準fetchのみ使用（外部依存なし）
 *
 * 使い方:
 *   node scripts/publish-to-wp.mjs --html "article.html" --title "タイトル" --slug "my-post" --excerpt "抜粋文"
 *   node scripts/publish-to-wp.mjs --html "article.html" --title "タイトル" --slug "my-post" --excerpt "抜粋" --eyecatch "eyecatch.png" --status "future" --date "2026-03-28T09:00:00"
 *
 * 環境変数（必須）:
 *   WP_USER          WordPress ユーザー名
 *   WP_APP_PASSWORD  WordPress アプリケーションパスワード
 *
 * 環境変数（任意）:
 *   WP_URL           WordPress サイトURL（デフォルト: https://l-custom.com/blog）
 */

import { readFileSync } from 'fs';
import { basename, resolve } from 'path';

// ==============================
// 環境変数チェック
// ==============================

const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;
const WP_URL = (process.env.WP_URL || 'https://l-custom.com/blog').replace(/\/$/, '');

if (!WP_USER) {
  console.error('エラー: 環境変数 WP_USER が設定されていません');
  process.exit(1);
}
if (!WP_APP_PASSWORD) {
  console.error('エラー: 環境変数 WP_APP_PASSWORD が設定されていません');
  process.exit(1);
}

const API_BASE = `${WP_URL}/wp-json/wp/v2`;
const AUTH_HEADER = 'Basic ' + Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');

// ==============================
// 引数パース
// ==============================

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--html' && argv[i + 1]) {
      args.html = argv[++i];
    } else if (argv[i] === '--title' && argv[i + 1]) {
      args.title = argv[++i];
    } else if (argv[i] === '--slug' && argv[i + 1]) {
      args.slug = argv[++i];
    } else if (argv[i] === '--excerpt' && argv[i + 1]) {
      args.excerpt = argv[++i];
    } else if (argv[i] === '--eyecatch' && argv[i + 1]) {
      args.eyecatch = argv[++i];
    } else if (argv[i] === '--status' && argv[i + 1]) {
      args.status = argv[++i];
    } else if (argv[i] === '--date' && argv[i + 1]) {
      args.date = argv[++i];
    }
  }
  return args;
}

const args = parseArgs(process.argv);

if (!args.html || !args.title || !args.slug || !args.excerpt) {
  console.error('使い方: node scripts/publish-to-wp.mjs --html "file.html" --title "タイトル" --slug "slug" --excerpt "抜粋"');
  console.error('\n必須引数:');
  console.error('  --html      記事HTMLファイルパス');
  console.error('  --title     記事タイトル');
  console.error('  --slug      URLスラッグ');
  console.error('  --excerpt   抜粋文');
  console.error('\nオプション:');
  console.error('  --eyecatch  アイキャッチPNG画像パス');
  console.error('  --status    投稿ステータス（draft|future|publish）デフォルト: draft');
  console.error('  --date      公開日時 ISO8601形式（例: 2026-03-28T09:00:00）');
  process.exit(1);
}

const status = args.status || 'draft';
if (!['draft', 'future', 'publish', 'pending', 'private'].includes(status)) {
  console.error(`エラー: 無効なステータス "${status}"。draft/future/publish/pending/private のいずれかを指定してください`);
  process.exit(1);
}

// ==============================
// API リクエストヘルパー
// ==============================

async function wpFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': AUTH_HEADER,
      ...options.headers,
    },
  });

  if (!res.ok) {
    let body;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    console.error(`WP API エラー [${res.status} ${res.statusText}]`);
    console.error(`URL: ${url}`);
    console.error('レスポンス:', JSON.stringify(body, null, 2));
    process.exit(1);
  }

  return res.json();
}

// ==============================
// メディアアップロード
// ==============================

async function uploadMedia(filePath) {
  const absPath = resolve(filePath);
  const fileData = readFileSync(absPath);
  const fileName = basename(absPath);

  console.error(`メディアアップロード中: ${fileName}`);

  const url = `${API_BASE}/media`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': AUTH_HEADER,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Type': 'image/png',
    },
    body: fileData,
  });

  if (!res.ok) {
    let body;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    console.error(`メディアアップロードエラー [${res.status} ${res.statusText}]`);
    console.error('レスポンス:', JSON.stringify(body, null, 2));
    process.exit(1);
  }

  const media = await res.json();
  console.error(`メディアアップロード完了: ID=${media.id}, URL=${media.source_url}`);
  return media.id;
}

// ==============================
// 記事投稿
// ==============================

async function publishPost() {
  // 記事HTML読み込み
  const htmlPath = resolve(args.html);
  const content = readFileSync(htmlPath, 'utf-8');
  console.error(`記事HTML読み込み: ${htmlPath} (${content.length} bytes)`);

  // アイキャッチアップロード
  let featuredMediaId = 0;
  if (args.eyecatch) {
    featuredMediaId = await uploadMedia(args.eyecatch);
  }

  // 投稿データ組み立て
  const postData = {
    title: args.title,
    content: content,
    slug: args.slug,
    excerpt: args.excerpt,
    status: status,
  };

  if (featuredMediaId) {
    postData.featured_media = featuredMediaId;
  }

  if (args.date) {
    postData.date = args.date;
  }

  console.error(`記事投稿中: "${args.title}" (status=${status})`);

  const post = await wpFetch('/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postData),
  });

  // 結果をJSON形式で標準出力
  const result = {
    id: post.id,
    url: post.link,
    status: post.status,
    slug: post.slug,
    title: post.title.rendered,
    date: post.date,
    featured_media: post.featured_media || null,
  };

  console.log(JSON.stringify(result, null, 2));
  console.error(`投稿完了: ID=${post.id}, URL=${post.link}, status=${post.status}`);
}

// ==============================
// 実行
// ==============================

publishPost().catch((err) => {
  console.error('エラー:', err.message || err);
  process.exit(1);
});
