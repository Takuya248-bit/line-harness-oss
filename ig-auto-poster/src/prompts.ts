import type { ContentItem } from "./content-data";

// --- Prompt Templates (from gemini-instagram-prompt-templates.md) ---

const COVER_TEMPLATE = `1080x1350pxの縦長Instagram投稿画像を生成してください。

デザイン:
- 背景: 白ベースで、下部にターコイズブルー(#00BCD4)から白へのグラデーション
- 左上と右下にヤシの木のシルエット（薄いグレー、装飾的に）
- 中央上部に小さく「保存必須」の吹き出し（サンセットオレンジ背景、白文字、角丸）

テキスト配置:
- 画面中央やや上に大きく: 「{{TITLE}}」（ネイビー(#1A237E)、ゴシック体極太、3行以内に収める）
- その下に小さく: 「{{SUBTITLE}}」（グレー文字、ゴシック体）
- 画面下部に: 「→ スワイプで全部見る」（ターコイズブルー文字、矢印アイコン付き）
- 右下に「Barilingual」ロゴテキスト（小さく、グレー）

全体の印象: クリーンで見やすい、思わず保存したくなるデザイン。
日本語テキストは画像内に直接レンダリングしてください。`;

const CONTENT_PAGE_TEMPLATE = `1080x1350pxの縦長Instagram投稿画像を生成してください。

デザイン:
- 背景: 白ベース
- 左上にページ番号「{{NUMBER}}/{{TOTAL}}」（ターコイズブルーの丸い背景、白文字）
- 上部に薄い水平線で区切り

テキスト配置:
- 画面上部1/3: 「{{PHRASE_EN}}」（ネイビー(#1A237E)、サンセリフ体Bold、大きめ）
- その下: 「{{PHRASE_JP}}」（グレー、ゴシック体、中サイズ）
- 中央に薄い区切り線
- 画面下部1/3に使い方の例文:
  - 「例: {{EXAMPLE_EN}}」（ネイビー、中サイズ）
  - 「{{EXAMPLE_JP}}」（グレー、小サイズ）
- 下部にプルメリアの花を1〜2輪、装飾として薄く配置
- 右下に「Barilingual」小さく

全体の印象: 教科書のように整然としたレイアウト。1枚で1フレーズが完結。
日本語テキストは画像内に直接レンダリングしてください。`;

const CTA_TEMPLATE = `1080x1350pxの縦長Instagram投稿画像を生成してください。

デザイン:
- 背景: ターコイズブルー(#00BCD4)のグラデーション（上が濃く、下が明るく）
- 白いヤシの木シルエットを左右に装飾的に配置
- 全体的にバリ島のビーチ感

テキスト配置:
- 画面上部: 「もっと学びたい方へ」（白文字、ゴシック体太字、大きめ）
- 中央に白い角丸ボックス:
  - ボックス内: 「LINE登録で\\n{{LEAD_MAGNET}}」（ネイビー文字、ゴシック体太字）
- ボックス下: 「プロフィールのリンクから →」（白文字、中サイズ）
- 最下部: 「@barilingual」（白文字、小さく）

全体の印象: 行動を促すが押しつけがましくない。バリ島の爽やかさを感じるCTA。
日本語テキストは画像内に直接レンダリングしてください。`;

function replacePlaceholders(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

/**
 * Build 7 prompts for a carousel post:
 * 1: Cover, 2-6: Content pages, 7: CTA
 */
export function buildPrompts(content: ContentItem): string[] {
  const prompts: string[] = [];

  // 1. Cover
  prompts.push(
    replacePlaceholders(COVER_TEMPLATE, {
      TITLE: content.title,
      SUBTITLE: content.subtitle,
    }),
  );

  // 2-6. Content pages (5 phrases)
  const total = content.phrases.length.toString();
  for (let i = 0; i < content.phrases.length; i++) {
    const phrase = content.phrases[i];
    prompts.push(
      replacePlaceholders(CONTENT_PAGE_TEMPLATE, {
        NUMBER: (i + 1).toString(),
        TOTAL: total,
        PHRASE_EN: phrase.en,
        PHRASE_JP: phrase.jp,
        EXAMPLE_EN: phrase.exampleEn,
        EXAMPLE_JP: phrase.exampleJp,
      }),
    );
  }

  // 7. CTA
  prompts.push(
    replacePlaceholders(CTA_TEMPLATE, {
      LEAD_MAGNET: content.leadMagnet,
    }),
  );

  return prompts;
}
