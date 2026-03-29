Cloudflare Workersへのデプロイを実行する。

手順:
1. まず /check（型チェック）を実行して問題がないことを確認
2. `cd apps/worker && npx wrangler deploy` を実行
3. デプロイ結果を確認し、URLとステータスを報告
4. エラーがあれば原因を分析して修正を提案

注意:
- wrangler.tomlにdatabase_idが含まれていないことを確認する
- デプロイ前に未コミットの変更がないかgit statusで確認する
