/**
 * 初期データ投入スクリプト
 * 実行: npx wrangler d1 execute ig-auto-poster-db --local --file=scripts/seed-knowledge.sql
 * 本番: npx wrangler d1 execute ig-auto-poster-db --file=scripts/seed-knowledge.sql
 */

// === カテゴリ体系 ===
// bali_area: バリ島エリア情報（subcategory: canggu, ubud, seminyak, kuta, kerobokan）
// study_faq: バリ留学FAQ（subcategory: beginner_ok, one_week, dorm_life, making_friends）
// barilingual: バリリンガル固有（subcategory: mantooman, dorm, teachers, student_types, common_worries）
// english_learning: 英語学習（subcategory: beginner_mistakes, speaking, aizuchi, paraphrase, natural_english）
// evidence: 実例・エピソード（subcategory: first_3days, one_week_change, real_scene, outside_class）
