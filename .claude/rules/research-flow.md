---
description: リサーチ時のQMD優先ルーティングとGroq要約委譲ルール
alwaysApply: false
globs:
  - "scripts/summarize-url.mjs"
  - "scripts/knowledge-save.mjs"
---

# リサーチフロー（トークン節約）

## 検索順序（QMD優先）

1. QMD検索（lex + vec）→ ヒットあり → 完了（トークン~2K）
2. ヒットなし → WebSearch → URL取得
3. URL要約は `summarize-url.mjs` に委譲（Groq無料API）
4. 結果を `knowledge-save.mjs` で Notion + Obsidian に保存

## ページ要約の委譲

WebFetchでページ全文をメインコンテキストに読み込まない。代わりに:

```bash
source ~/.zshrc; node scripts/summarize-url.mjs "<url>" 500
```

Groq API（Llama 3.3-70B）で要約。無料・高速・高精度。
メインコンテキストに入るのは要約結果のみ（~500文字）。

## 複数ページの場合

3ページ以上はサブエージェント（Haiku）に委譲:
```
Agent(prompt: "以下のURLをそれぞれsummarize-url.mjsで要約し、結果を統合して500文字で返せ: URL1, URL2, URL3")
```

## やってはいけないこと

- WebFetchで生ページをメインコンテキストに読み込む（トークン浪費）
- QMD検索せずにいきなりWebSearch（既知情報の再検索）
- リサーチ結果を保存せずに終わる（次回また同じ検索が発生）
