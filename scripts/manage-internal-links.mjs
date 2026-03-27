#!/usr/bin/env node
/**
 * WordPress 内部リンク管理スクリプト
 * 既存記事の内部リンク分析・提案・挿入を行う
 *
 * コマンド:
 *   node scripts/manage-internal-links.mjs list                                    全公開記事の一覧
 *   node scripts/manage-internal-links.mjs analyze                                 内部リンク状況を分析
 *   node scripts/manage-internal-links.mjs suggest --id <記事ID>                    内部リンク候補を提案
 *   node scripts/manage-internal-links.mjs optimize                                リンク不足記事を特定+候補一覧
 *   node scripts/manage-internal-links.mjs insert --id <ID> --target-id <ID> --anchor "テキスト" --position "after-h2:3"
 *
 * 環境変数（必須）:
 *   WP_USER          WordPress ユーザー名
 *   WP_APP_PASSWORD  WordPress アプリケーションパスワード
 *
 * 環境変数（任意）:
 *   WP_URL           WordPress サイトURL（デフォルト: https://l-custom.com/blog）
 */

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
  const args = { command: argv[2] };
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === '--id' && argv[i + 1]) {
      args.id = parseInt(argv[++i], 10);
    } else if (argv[i] === '--target-id' && argv[i + 1]) {
      args.targetId = parseInt(argv[++i], 10);
    } else if (argv[i] === '--anchor' && argv[i + 1]) {
      args.anchor = argv[++i];
    } else if (argv[i] === '--position' && argv[i + 1]) {
      args.position = argv[++i];
    }
  }
  return args;
}

const args = parseArgs(process.argv);

// ==============================
// WP API ヘルパー
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

  return { data: await res.json(), headers: res.headers };
}

/**
 * 全公開記事を取得（ページネーション対応）
 */
async function fetchAllPosts() {
  const posts = [];
  let page = 1;
  while (true) {
    const { data, headers } = await wpFetch(`/posts?status=publish&per_page=100&page=${page}&_fields=id,title,slug,link,content,categories`);
    posts.push(...data);
    const totalPages = parseInt(headers.get('x-wp-totalpages') || '1', 10);
    if (page >= totalPages) break;
    page++;
  }
  return posts;
}

/**
 * 全カテゴリを取得
 */
async function fetchAllCategories() {
  const cats = [];
  let page = 1;
  while (true) {
    const { data, headers } = await wpFetch(`/categories?per_page=100&page=${page}&_fields=id,name,slug`);
    cats.push(...data);
    const totalPages = parseInt(headers.get('x-wp-totalpages') || '1', 10);
    if (page >= totalPages) break;
    page++;
  }
  return cats;
}

/**
 * 単一記事を取得
 */
async function fetchPost(id) {
  const { data } = await wpFetch(`/posts/${id}?_fields=id,title,slug,link,content,categories`);
  return data;
}

// ==============================
// HTML解析ヘルパー
// ==============================

/**
 * HTMLからテキストを抽出
 */
function stripHtml(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * HTMLから内部リンクを抽出
 * @returns {{ href: string, text: string }[]}
 */
function extractInternalLinks(html, siteUrl) {
  const links = [];
  const domain = new URL(siteUrl).hostname;
  const regex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    const text = stripHtml(match[2]);
    try {
      const url = new URL(href, siteUrl);
      if (url.hostname === domain) {
        links.push({ href: url.pathname, text });
      }
    } catch {
      // 相対URLでパースできない場合はスキップ
      if (href.startsWith('/')) {
        links.push({ href, text });
      }
    }
  }
  return links;
}

/**
 * HTMLからH2/H3見出しを抽出
 * @returns {{ tag: string, text: string, index: number }[]}
 */
function extractHeadings(html) {
  const headings = [];
  const regex = /<(h[23])[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    headings.push({
      tag: match[1].toLowerCase(),
      text: stripHtml(match[2]),
      index: match.index,
    });
  }
  return headings;
}

/**
 * タイトルからキーワードを抽出（ストップワード除去）
 */
function extractKeywords(title) {
  const stopWords = new Set([
    'の', 'は', 'が', 'を', 'に', 'で', 'と', 'も', 'や', 'から', 'まで', 'より',
    'する', 'した', 'して', 'ます', 'です', 'ある', 'いる', 'なる', 'れる',
    'こと', 'もの', 'ため', 'よう', 'とは', 'など', 'について', 'における',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'and', 'or', 'not', 'but', 'as', 'be',
    '【', '】', '｜', '|', '！', '？', '!', '?', '。', '、', '・',
    '完全', 'ガイド', '解説', '方法', '比較', '徹底', 'おすすめ', '選',
    '版', '年', '最新',
  ]);

  // 記号を除去して分割
  const cleaned = title
    .replace(/【[^】]*】/g, ' ')
    .replace(/[｜|！？!?。、・「」『』（）\(\)\[\]]/g, ' ')
    .replace(/\d{4}年?/g, ' ')
    .trim();

  // 2文字以上のキーワードを抽出
  const words = cleaned.split(/[\s　]+/).filter(w => w.length >= 2 && !stopWords.has(w));

  // 複合語を追加（隣接2語の組み合わせ）
  const keywords = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    keywords.push(words[i] + words[i + 1]);
  }

  return [...new Set(keywords)];
}

// ==============================
// コマンド: list
// ==============================

async function cmdList() {
  console.error('全公開記事を取得中...');
  const posts = await fetchAllPosts();

  const result = posts.map(p => ({
    id: p.id,
    title: stripHtml(p.title.rendered),
    slug: p.slug,
    url: p.link,
    categories: p.categories,
  }));

  console.log(JSON.stringify(result, null, 2));
  console.error(`合計: ${posts.length} 件の公開記事`);
}

// ==============================
// コマンド: analyze
// ==============================

async function cmdAnalyze() {
  console.error('全公開記事を取得中...');
  const posts = await fetchAllPosts();
  const siteUrl = WP_URL;

  // 各記事のURL→IDマッピング
  const slugToPost = {};
  for (const p of posts) {
    const url = new URL(p.link);
    slugToPost[url.pathname] = p;
    // 末尾スラッシュありなしの両方
    slugToPost[url.pathname.replace(/\/$/, '')] = p;
  }

  // 各記事の発リンク・被リンクを計算
  const stats = posts.map(p => {
    const content = p.content.rendered || '';
    const outLinks = extractInternalLinks(content, siteUrl);

    // 自分自身へのリンクは除外
    const selfUrl = new URL(p.link);
    const filteredOutLinks = outLinks.filter(l => {
      const normalized = l.href.replace(/\/$/, '');
      const selfNormalized = selfUrl.pathname.replace(/\/$/, '');
      return normalized !== selfNormalized;
    });

    return {
      id: p.id,
      title: stripHtml(p.title.rendered),
      slug: p.slug,
      outgoingLinks: filteredOutLinks,
      outgoingCount: filteredOutLinks.length,
      incomingCount: 0,
      incomingFrom: [],
    };
  });

  // 被リンクを計算
  const statsById = {};
  for (const s of stats) {
    statsById[s.id] = s;
  }

  for (const s of stats) {
    for (const link of s.outgoingLinks) {
      const normalized = link.href.replace(/\/$/, '');
      const targetPost = slugToPost[normalized];
      if (targetPost && statsById[targetPost.id]) {
        statsById[targetPost.id].incomingCount++;
        statsById[targetPost.id].incomingFrom.push({
          id: s.id,
          title: s.title,
          anchor: link.text,
        });
      }
    }
  }

  // 結果表示
  console.log('');
  console.log('=== 内部リンク分析結果 ===');
  console.log('');

  // 一覧表示
  for (const s of stats) {
    const status = s.outgoingCount === 0 && s.incomingCount === 0 ? ' [孤立]' :
                   s.outgoingCount < 2 ? ' [発リンク不足]' : '';
    console.log(`ID:${s.id} 「${s.title}」`);
    console.log(`  発リンク: ${s.outgoingCount} 件 / 被リンク: ${s.incomingCount} 件${status}`);
    if (s.outgoingLinks.length > 0) {
      for (const l of s.outgoingLinks) {
        console.log(`    → ${l.href} (${l.text || '(テキストなし)'})`);
      }
    }
    if (s.incomingFrom.length > 0) {
      for (const inc of s.incomingFrom) {
        console.log(`    ← ID:${inc.id} 「${inc.title}」 (${inc.anchor || '(テキストなし)'})`);
      }
    }
    console.log('');
  }

  // サマリー
  const isolated = stats.filter(s => s.outgoingCount === 0 && s.incomingCount === 0);
  const noOutgoing = stats.filter(s => s.outgoingCount === 0 && s.incomingCount > 0);
  const lowOutgoing = stats.filter(s => s.outgoingCount > 0 && s.outgoingCount < 2);

  console.log('=== サマリー ===');
  console.log(`総記事数: ${stats.length}`);
  console.log(`孤立記事（リンクなし）: ${isolated.length} 件`);
  if (isolated.length > 0) {
    for (const s of isolated) console.log(`  - ID:${s.id} 「${s.title}」`);
  }
  console.log(`発リンクゼロ: ${noOutgoing.length} 件`);
  console.log(`発リンク不足（1本のみ）: ${lowOutgoing.length} 件`);
  console.log(`平均発リンク数: ${(stats.reduce((a, s) => a + s.outgoingCount, 0) / stats.length).toFixed(1)}`);
  console.log(`平均被リンク数: ${(stats.reduce((a, s) => a + s.incomingCount, 0) / stats.length).toFixed(1)}`);
}

// ==============================
// コマンド: suggest
// ==============================

async function cmdSuggest() {
  if (!args.id) {
    console.error('エラー: --id <記事ID> を指定してください');
    process.exit(1);
  }

  console.error(`記事 ID:${args.id} を取得中...`);
  const sourcePost = await fetchPost(args.id);
  const sourceContent = sourcePost.content.rendered || '';
  const sourceTitle = stripHtml(sourcePost.title.rendered);
  const sourceText = stripHtml(sourceContent);
  const sourceHeadings = extractHeadings(sourceContent);
  const sourceCategories = new Set(sourcePost.categories || []);
  const siteUrl = WP_URL;

  // 既存の内部リンク先を取得
  const existingLinks = extractInternalLinks(sourceContent, siteUrl);
  const existingPaths = new Set(existingLinks.map(l => l.href.replace(/\/$/, '')));

  console.error('全公開記事を取得中...');
  const allPosts = await fetchAllPosts();

  const suggestions = [];

  for (const target of allPosts) {
    if (target.id === args.id) continue; // 自分自身はスキップ

    const targetTitle = stripHtml(target.title.rendered);
    const targetUrl = new URL(target.link);
    const targetPath = targetUrl.pathname.replace(/\/$/, '');

    // 既にリンク済みは除外
    if (existingPaths.has(targetPath)) continue;

    const keywords = extractKeywords(targetTitle);
    let score = 0;
    const matchReasons = [];

    // キーワードが見出しに出現するか
    for (const kw of keywords) {
      for (const h of sourceHeadings) {
        if (h.text.includes(kw)) {
          score += 3;
          matchReasons.push(`見出し「${h.text}」にKW「${kw}」が一致`);
          break; // 同じKWで複数見出しマッチは1回だけカウント
        }
      }
    }

    // キーワードが本文に出現するか
    for (const kw of keywords) {
      if (sourceText.includes(kw)) {
        score += 1;
        matchReasons.push(`本文にKW「${kw}」が出現`);
      }
    }

    // 同じカテゴリか
    const targetCategories = new Set(target.categories || []);
    const sharedCategories = [...sourceCategories].filter(c => targetCategories.has(c));
    if (sharedCategories.length > 0) {
      score += 2;
      matchReasons.push(`同カテゴリ (${sharedCategories.join(', ')})`);
    }

    if (score > 0) {
      suggestions.push({
        targetId: target.id,
        targetTitle,
        targetUrl: target.link,
        targetSlug: target.slug,
        score,
        reasons: matchReasons,
      });
    }
  }

  // スコア順にソート
  suggestions.sort((a, b) => b.score - a.score);

  console.log('');
  console.log(`=== 内部リンク候補: ID:${args.id} 「${sourceTitle}」 ===`);
  console.log('');

  if (suggestions.length === 0) {
    console.log('候補なし（全記事が既にリンク済み or 関連記事なし）');
    return;
  }

  for (const s of suggestions) {
    console.log(`[スコア: ${s.score}] ID:${s.targetId} 「${s.targetTitle}」`);
    console.log(`  URL: ${s.targetUrl}`);
    for (const r of s.reasons) {
      console.log(`  - ${r}`);
    }
    console.log('');
  }

  console.log(`合計: ${suggestions.length} 件の候補`);

  // 挿入コマンド例を表示
  if (suggestions.length > 0) {
    const top = suggestions[0];
    console.log('');
    console.log('--- 挿入コマンド例 ---');
    console.log(`node scripts/manage-internal-links.mjs insert --id ${args.id} --target-id ${top.targetId} --anchor "${top.targetTitle}" --position "after-h2:1"`);
  }
}

// ==============================
// コマンド: optimize
// ==============================

async function cmdOptimize() {
  console.error('全公開記事を取得中...');
  const posts = await fetchAllPosts();
  const siteUrl = WP_URL;

  // 各記事の内部リンク数を計算
  const postData = posts.map(p => {
    const content = p.content.rendered || '';
    const outLinks = extractInternalLinks(content, siteUrl);
    const selfUrl = new URL(p.link);
    const filtered = outLinks.filter(l => {
      return l.href.replace(/\/$/, '') !== selfUrl.pathname.replace(/\/$/, '');
    });
    return {
      id: p.id,
      title: stripHtml(p.title.rendered),
      slug: p.slug,
      url: p.link,
      categories: p.categories || [],
      content,
      outgoingCount: filtered.length,
      existingPaths: new Set(filtered.map(l => l.href.replace(/\/$/, ''))),
    };
  });

  // リンク不足記事（2本未満）を特定
  const deficient = postData.filter(p => p.outgoingCount < 2);

  if (deficient.length === 0) {
    console.log('全記事が2本以上の内部リンクを持っています。最適化不要です。');
    return;
  }

  console.log('');
  console.log('=== 内部リンク最適化提案 ===');
  console.log(`リンク不足記事（発リンク2本未満）: ${deficient.length} / ${posts.length} 件`);
  console.log('');

  for (const source of deficient) {
    console.log(`--- ID:${source.id} 「${source.title}」 (現在 ${source.outgoingCount} 本) ---`);

    const sourceText = stripHtml(source.content);
    const sourceHeadings = extractHeadings(source.content);
    const sourceCategories = new Set(source.categories);

    const suggestions = [];

    for (const target of postData) {
      if (target.id === source.id) continue;

      const targetUrl = new URL(target.url);
      const targetPath = targetUrl.pathname.replace(/\/$/, '');
      if (source.existingPaths.has(targetPath)) continue;

      const keywords = extractKeywords(target.title);
      let score = 0;

      for (const kw of keywords) {
        for (const h of sourceHeadings) {
          if (h.text.includes(kw)) { score += 3; break; }
        }
        if (sourceText.includes(kw)) score += 1;
      }

      const targetCategories = new Set(target.categories);
      if ([...sourceCategories].some(c => targetCategories.has(c))) score += 2;

      if (score > 0) {
        suggestions.push({ targetId: target.id, targetTitle: target.title, score });
      }
    }

    suggestions.sort((a, b) => b.score - a.score);
    const topSuggestions = suggestions.slice(0, 5);

    if (topSuggestions.length === 0) {
      console.log('  候補なし');
    } else {
      const needed = 2 - source.outgoingCount;
      console.log(`  追加推奨: ${needed} 本以上`);
      for (const s of topSuggestions) {
        console.log(`  [スコア:${s.score}] ID:${s.targetId} 「${s.targetTitle}」`);
      }
    }
    console.log('');
  }
}

// ==============================
// コマンド: insert
// ==============================

async function cmdInsert() {
  if (!args.id || !args.targetId || !args.anchor || !args.position) {
    console.error('使い方: node scripts/manage-internal-links.mjs insert --id <記事ID> --target-id <リンク先記事ID> --anchor "アンカーテキスト" --position "after-h2:3"');
    console.error('');
    console.error('position形式:');
    console.error('  after-h2:N   N番目のH2見出し直後に挿入');
    console.error('  after-h3:N   N番目のH3見出し直後に挿入');
    console.error('  top          記事冒頭に挿入');
    console.error('  bottom       記事末尾に挿入');
    process.exit(1);
  }

  console.error(`記事 ID:${args.id} を取得中...`);
  const sourcePost = await fetchPost(args.id);
  const sourceTitle = stripHtml(sourcePost.title.rendered);

  console.error(`リンク先 ID:${args.targetId} を取得中...`);
  const targetPost = await fetchPost(args.targetId);
  const targetTitle = stripHtml(targetPost.title.rendered);
  const targetUrl = targetPost.link;

  let content = sourcePost.content.rendered || '';

  // リンクHTML生成
  const linkHtml = `\n<p>関連記事: <a href="${targetUrl}">${args.anchor}</a></p>\n`;

  // 挿入位置を決定
  const position = args.position;

  if (position === 'top') {
    content = linkHtml + content;
  } else if (position === 'bottom') {
    content = content + linkHtml;
  } else if (position.startsWith('after-h2:') || position.startsWith('after-h3:')) {
    const [tagPart, nStr] = position.split(':');
    const targetTag = tagPart.replace('after-', '');
    const n = parseInt(nStr, 10);

    if (isNaN(n) || n < 1) {
      console.error(`エラー: 無効なposition指定 "${position}"。N は1以上の整数を指定してください`);
      process.exit(1);
    }

    // N番目の指定見出しを検索
    const regex = new RegExp(`<${targetTag}[^>]*>[\\s\\S]*?<\\/${targetTag}>`, 'gi');
    let match;
    let count = 0;
    let insertIndex = -1;

    while ((match = regex.exec(content)) !== null) {
      count++;
      if (count === n) {
        // 見出しタグの終了位置の直後
        insertIndex = match.index + match[0].length;

        // 見出し直後の最初の段落（</p>）の後に挿入
        const afterHeading = content.substring(insertIndex);
        const firstParagraphEnd = afterHeading.indexOf('</p>');
        if (firstParagraphEnd !== -1) {
          insertIndex += firstParagraphEnd + 4; // </p>の長さ分
        }
        break;
      }
    }

    if (insertIndex === -1) {
      console.error(`エラー: ${targetTag}見出しが${n}個ありません（見つかった数: ${count}）`);
      process.exit(1);
    }

    content = content.substring(0, insertIndex) + linkHtml + content.substring(insertIndex);
  } else {
    console.error(`エラー: 無効なposition指定 "${position}"。after-h2:N / after-h3:N / top / bottom のいずれかを指定してください`);
    process.exit(1);
  }

  // 確認表示
  console.error('');
  console.error(`挿入内容:`);
  console.error(`  元記事: ID:${args.id} 「${sourceTitle}」`);
  console.error(`  リンク先: ID:${args.targetId} 「${targetTitle}」`);
  console.error(`  アンカー: ${args.anchor}`);
  console.error(`  位置: ${args.position}`);
  console.error(`  リンクHTML: ${linkHtml.trim()}`);
  console.error('');

  // WP更新
  console.error('記事を更新中...');
  const { data: updated } = await wpFetch(`/posts/${args.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  const result = {
    id: updated.id,
    title: stripHtml(updated.title.rendered),
    url: updated.link,
    insertedLink: {
      targetId: args.targetId,
      targetTitle,
      targetUrl,
      anchor: args.anchor,
      position: args.position,
    },
  };

  console.log(JSON.stringify(result, null, 2));
  console.error(`更新完了: ID:${updated.id} にリンクを挿入しました`);
}

// ==============================
// メイン
// ==============================

async function main() {
  switch (args.command) {
    case 'list':
      await cmdList();
      break;
    case 'analyze':
      await cmdAnalyze();
      break;
    case 'suggest':
      await cmdSuggest();
      break;
    case 'optimize':
      await cmdOptimize();
      break;
    case 'insert':
      await cmdInsert();
      break;
    default:
      console.error('使い方: node scripts/manage-internal-links.mjs <command>');
      console.error('');
      console.error('コマンド:');
      console.error('  list       全公開記事の一覧をJSON出力');
      console.error('  analyze    全記事の内部リンク状況を分析');
      console.error('  suggest    指定記事への内部リンク候補を提案 (--id <記事ID>)');
      console.error('  optimize   リンク不足記事を特定し候補を一覧表示');
      console.error('  insert     指定記事に内部リンクを挿入 (--id --target-id --anchor --position)');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('エラー:', err.message || err);
  process.exit(1);
});
