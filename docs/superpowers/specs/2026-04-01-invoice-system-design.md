# 見積書・請求書システム設計

## 概要

やよい会計(Misoca)の見積書・請求書機能を、Cloudflare Worker + Notion DBで再実装する。
LINE Harnessのmessages_log（D1）からチャット履歴を取得し、AIが自動で請求内容を抽出する。
インドネシア法人のためインボイス制度・確定申告は不要。通貨は日本円のみ。

## アーキテクチャ

```
ブラウザ(入力欄1つ)
  ↓ 「星慎一郎の請求書作って」
Worker(Hono)
  ↓ friendsテーブルで名前検索 → friend_id特定
  ↓ messages_logから直近会話取得
  ↓ Claude APIで品目・金額を自動抽出
  ↓ プリフィル済みフォーム表示
  ↓ 確認ボタン
  → Notion DB (データ蓄積・履歴管理)
  → jsPDF (PDF生成) → R2 (保存)
  → ダウンロードURL返却
```

## データソース

### 入力（LINE Harness D1 — 読み取りのみ）

- `friends` テーブル: 名前 → friend_id の解決
- `messages_log` テーブル: friend_idで直近N件の会話履歴取得

Worker自体はLINE HarnessのD1にバインドして読み取りのみ行う。
書き込みは一切しない（データ蓄積はNotionに分離）。

### 蓄積（Notion DB）

#### 請求書DB (Invoices)

| プロパティ | 型 | 説明 |
|-----------|-----|------|
| タイトル | Title | 請求番号 (YYYYMMDD-NNN) |
| 種別 | Select | 見積書 / 請求書 |
| ステータス | Select | 下書き / 送付済 / 入金済 |
| 宛名 | Rich Text | 顧客名 |
| friend_id | Rich Text | LINE friend_id（紐付け用、nullable） |
| 発行日 | Date | 発行日 |
| 合計金額 | Number | 円 |
| 品目JSON | Rich Text | [{name, quantity, unit_price, amount}] |
| 備考 | Rich Text | 備考欄テキスト |
| PDF URL | URL | R2ダウンロードリンク |
| 元チャット要約 | Rich Text | AI抽出に使った会話の要約（根拠記録） |
| 作成日時 | Created Time | 自動 |
| 更新日時 | Last Edited Time | 自動 |

設計意図:
- 品目は別DBにせずJSONで保持（Notion APIのリレーション操作が煩雑、品目単体の用途なし）
- friend_idで将来LINE Harnessから直接リンク可能
- 元チャット要約を残すことで「なぜこの金額になったか」を追跡可能

## AI抽出ロジック

### 入力

messages_logから直近30日・最大50件の会話を取得し、以下をClaude APIに渡す:

```
以下のLINEチャット履歴から、請求書に必要な情報を抽出してください。
- コース名（期間含む）
- 料金
- 割引（あれば）
- 特記事項

チャット履歴:
{messages}

JSON形式で返してください:
{items: [{name, quantity, unit_price}], notes: string, summary: string}
```

### フォールバック

- チャット履歴から抽出できない場合 → 「情報が不足しています。品目を入力してください」と手入力フォームを表示
- friend_idが見つからない場合 → 手入力モードに切り替え（LINE Harness非依存で使える）

## Worker設計 (Hono)

### ディレクトリ構成

```
invoice-worker/
  src/
    index.ts            # Honoエントリポイント + UI配信
    routes/
      invoices.ts       # CRUD API
      pdf.ts            # PDF生成・ダウンロード
      ai-extract.ts     # AI抽出エンドポイント
    services/
      notion.ts         # Notion API操作
      pdf-generator.ts  # jsPDFレイアウト
      chat-reader.ts    # D1 messages_log読み取り
      ai-extractor.ts   # Claude API呼び出し
    templates/
      layout.ts         # 会社情報・固定テンプレ
    ui/
      index.html        # 管理UI（SPA）
  wrangler.toml
```

### API

| メソッド | パス | 説明 |
|----------|------|------|
| GET | / | 管理UI (HTML) |
| POST | /api/extract | 名前 or テキスト → AI抽出 → プリフィルデータ返却 |
| GET | /api/invoices | 一覧取得（Notion query） |
| POST | /api/invoices | 新規作成（Notionに保存） |
| GET | /api/invoices/:id | 詳細取得 |
| PUT | /api/invoices/:id | 更新 |
| DELETE | /api/invoices/:id | 削除（下書きのみ） |
| GET | /api/invoices/:id/pdf | PDF生成・ダウンロード |
| POST | /api/invoices/:id/duplicate | 複製（見積→請求変換） |

### 環境変数・バインディング

- NOTION_API_KEY: Notion Integrationトークン
- NOTION_DB_ID: 請求書DBのID
- ANTHROPIC_API_KEY: Claude API
- D1バインディング: DB（LINE HarnessのD1、読み取り専用）
- R2バインディング: INVOICE_BUCKET

## PDF生成 (jsPDF)

- ライブラリ: jsPDF
- 日本語フォント: NotoSansJP (Regular + Bold) base64埋め込み
- 生成タイミング: 保存時に自動生成、更新時に再生成
- 保存先: R2 `invoices/` プレフィクス
- ダウンロードURL: R2署名付きURL（24時間有効）

### PDFレイアウト（Misoca準拠）

```
右上: 発行日、請求番号
中央: タイトル（請求書 / 見積書）
左: 宛名 + 「下記のとおりご請求申し上げます。」+ ご請求金額(合計)
右: 会社情報 + ロゴ
テーブル: 品番・品名 | 数量 | 単価 | 金額（10行枠）
テーブル下: 小計・合計
備考欄: 料金に含まれるもの / 含まれないもの
フッター: 振込先情報
```

## 固定情報

`templates/layout.ts` にハードコード（変更頻度が低いため設定UIは不要）。

- 会社名: PT. Perjalanan Penuh Kenagan / バリリンガル
- 代表: 木村拓也
- 住所: Perum Jadi Pesona, J / Pulau Moyo Blok VII
- メール: info@balilingual.com
- 振込先: 住信SBIネット銀行 支店コード101 普通預金8704889 キムラタクヤ
- ロゴ: base64埋め込み
- 備考デフォルト: 料金に含まれるもの/含まれないものリスト

## 管理UI（Worker上の単一HTML）

Tailwind CDN + vanilla JS。フレームワーク不要。

### メイン画面

入力欄1つ + ボタン2つ:
- テキスト入力: 「星慎一郎の請求書作って」「見積書 田中太郎」等
- [請求書作成] [見積書作成] ボタン

### AI抽出結果画面

プリフィルされたフォーム:
- 宛名（編集可）
- 品目テーブル（行追加・削除・編集可）
- 備考（デフォルトテンプレ入り、編集可）
- 合計金額（自動計算）
- [保存してPDF生成] ボタン

### 一覧画面

- 見積/請求タブ切替
- ステータスバッジ（下書き/送付済/入金済）
- PDFダウンロードリンク
- 複製ボタン（見積→請求変換）
- ステータス変更

## 記録の追跡性

- Notion DBに全件蓄積（削除は論理削除）
- 元チャット要約を保存（AI抽出の根拠）
- friend_idでLINEユーザーと紐付け
- PDF URLで発行済み書類にいつでもアクセス
- Notion側のCreated Time / Last Edited Timeで監査証跡

## コスト: 0円

| リソース | 無料枠 | 想定使用量 |
|----------|--------|-----------|
| Workers | 10万req/日 | 月数十件 |
| R2 | 10GB | PDF数百枚で数MB |
| Notion API | 無料 | 月数十コール |
| Claude API | 従量課金 | 月数十回の抽出で$1未満 |

注: Claude APIのみ従量課金だが、1回の抽出はinput/output合わせて数千トークン。月数十件で$1未満。

## 将来の拡張（スコープ外）

- LINE Harness管理画面からの直接呼び出し
- LINE Flex Messageでの送付
- 自動リマインダー（未入金フォロー）
- Lstep → LINE Harness移行後のmessages_log自動連携強化
