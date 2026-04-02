# バリリンガル LINE シナリオ文案リライト（クラウド LLM 用）

## 添付データ

1. **`message-rewrite-bundle.json`**（推奨）  
   `node scripts/export-message-rewrite-bundle.mjs` で生成。各レコードに `message_id`（主キー）、`node_phase`、`scenario_id`、`day_index`、`message_type`、`content` などが入る。

2. **代替: `messages.csv` のみ**  
   Notion から同カラムで CSV エクスポートしたものでも可。ただし `node_phase` が無いので、可能なら `nodes.csv` と突合したバンドルを使う。

3. **任意: ブランドガイド・禁止事項**（別ファイル）  
   トーン、絵文字方針、数値の根拠、医療・効果保証の禁止など。

---

## あなた（モデル）のタスク

- `message_id` は **1文字も変えない**。
- リライト対象は主に **`content`**。`message_type` が `cta` のときは **`content` と `cta_label` を同一の1行ボタン文言**にそろえる（現行 seed と同じルール）。
- `system` 相当の運用メモ（条件分岐・タグ・シナリオ切替の説明）は、**事実を変えず**に読みやすく整えるか、触らないかは添付の方針に従う。
- プレースホルダ（`[名前]`、`◯` など）は **削除しない**。
- LINE 向け: **太字記法は使わない**（環境によっては表示されない）。

---

## 出力形式（必須）

次の **JSON だけ** を返す。前後に説明文や Markdown フェンスを付けない。

### 形式 A（推奨）

```json
{
  "schema_version": 1,
  "rewrites": [
    {
      "message_id": "S_01_D00_1_M01",
      "content": "リライト後の本文…",
      "cta_label": "",
      "cta_action": "",
      "variant_note": "",
      "rewrite_notes": "任意。変更理由1行",
      "changed_fields": ["content"]
    }
  ]
}
```

### 形式 B（配列のみでも可）

```json
[
  {
    "message_id": "S_01_D00_1_M01",
    "content": "…"
  }
]
```

### フィールドルール

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `message_id` | はい | 入力と完全一致 |
| `content` | 基本はすべて | 本文または CTA 1行 |
| `cta_label` | cta 時 | `content` と同じにする |
| `cta_action` | いいえ | URL や postback 識別子。変更不要なら省略可 |
| `variant_note` | いいえ | AB 用メモ。触らないなら省略 |
| `rewrite_notes` | いいえ | 人間レビュー用 |
| `changed_fields` | いいえ | 例: `["content","cta_label"]` |

**全件**について `rewrites` に含める（変更がない行は `content` を入力と同一にコピーしてもよい。差分のみ返す運用にする場合は、ユーザー指示で明示）。

---

## 反映手順（ローカル）

```bash
node scripts/apply-barilingual-message-rewrites.mjs \
  config/barilingual-lstep-notion/seed/messages.csv \
  cloud-output.json \
  config/barilingual-lstep-notion/seed/messages.patched.csv
```

検証後、`messages.patched.csv` を `messages.csv` にリネームするか、Notion にインポートする。

```bash
node scripts/apply-barilingual-message-rewrites.mjs --dry-run \
  config/barilingual-lstep-notion/seed/messages.csv cloud-output.json
```

`Unknown message_id` があれば終了コード 2。

---

## チャンク分割するとき

- 1 リクエストあたり **1 シナリオ**（`scenario_id` 単位）または **20〜40 メッセージ**程度に分割。
- 各チャンクの出力 JSON を配列結合するか、`rewrites` をマージしてから `apply` に渡す。
