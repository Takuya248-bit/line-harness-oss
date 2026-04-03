# シークレット管理ルール

## 参照
APIキーが必要なとき: `~/.secrets/index.md` で変数名を確認 → `$VAR_NAME` で参照。値を直書きしない。

## 新規キー追加（自動）
新しいAPIキーを取得・発見したら即座に登録:
```bash
~/.secrets/add.sh <category> <VAR_NAME> "<value>" "<service>" "<purpose>"
```
category: ai / line / social / notion / cloudflare（なければ新規作成）

## 散在キーの発見時
プロジェクトの `.env` やコード内にハードコードされたキーを発見したら:
1. `~/.secrets/` に登録
2. 元の場所を `${VAR_NAME}` 参照に置き換え
3. progress.md に記録

## 禁止事項
- コード・設定ファイルへのキー直書き
- コミットにキー値を含める
- progress.md / decisions.md にキー値を書く
