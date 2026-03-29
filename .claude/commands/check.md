TypeScriptの型チェックを全ワーカー・Webアプリに対して実行する。

手順:
1. `cd apps/worker && npx tsc --noEmit` を実行
2. `cd apps/web && npx tsc --noEmit` を実行
3. エラーがあれば一覧で表示し、修正提案を行う
4. エラーがなければ「型チェック OK」と報告
