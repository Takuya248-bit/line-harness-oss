import type { Env, CaseStudy } from './types';

// Map keywords to likely industries
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  beauty: ['美容室', '美容院', 'サロン', 'ネイル', 'エステ', 'ヘアサロン', '美容'],
  restaurant: ['飲食店', 'レストラン', 'カフェ', '居酒屋', '料理', 'グルメ', '飲食'],
  school: ['教室', 'スクール', '学校', '塾', '習い事', '語学', 'レッスン', '講座'],
  ec: ['EC', '通販', 'ネットショップ', 'オンラインショップ', 'Shopify', '物販'],
  creator: ['クリエイター', 'インフルエンサー', 'コンテンツ', '発信', 'SNS', '個人ブランド'],
  clinic: ['クリニック', '歯科', '整体', '治療院', '医院', '整骨院'],
  gym: ['ジム', 'フィットネス', 'パーソナル', 'トレーニング', 'ヨガ', 'ピラティス'],
};

export function estimateIndustry(keyword: string): string | null {
  for (const [industry, terms] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (terms.some((term) => keyword.includes(term))) {
      return industry;
    }
  }
  return null;
}

export async function fetchCaseStudies(
  env: Env,
  keyword: string
): Promise<CaseStudy[]> {
  const industry = estimateIndustry(keyword);

  if (industry) {
    // Try industry match first
    const { results } = await env.DB.prepare(
      'SELECT * FROM case_studies WHERE industry = ? ORDER BY created_at DESC LIMIT 2'
    )
      .bind(industry)
      .all<CaseStudy>();

    if (results.length > 0) return results;
  }

  // Fallback: return one random case study
  const { results } = await env.DB.prepare(
    'SELECT * FROM case_studies ORDER BY RANDOM() LIMIT 1'
  ).all<CaseStudy>();

  return results;
}

export function buildCaseStudyPrompt(caseStudies: CaseStudy[]): string {
  if (caseStudies.length === 0) return '';

  const blocks = caseStudies.map((cs) => {
    let block = `[事例] ${cs.business_name}（${cs.industry}）
課題: ${cs.challenge}
施策: ${cs.solution}
成果: ${cs.result}`;
    if (cs.quote) {
      block += `\nお客様の声: ${cs.quote}`;
    }
    return block;
  });

  return `

以下の実際の導入事例を記事内に自然に組み込んでください:

${blocks.join('\n\n')}

事例は記事の中盤〜後半に配置し、読者の検討段階で信頼性を補強する形で使ってください。
事例の数値はそのまま正確に引用し、改変しないでください。
事業者名・個人名は絶対に出さず、業種+地域+匿名（A様、B様等）で記載してください。`;
}

export function buildSplitCaseStudyPrompts(caseStudies: CaseStudy[]): [string, string] {
  // First prompt: challenge + solution focus (injected at ~40%)
  const challengeBlocks = caseStudies.map((cs) => {
    return `[事例] ${cs.business_name}（${cs.industry}）
課題: ${cs.challenge}
施策: ${cs.solution}`;
  });

  const promptA = `

以下の導入事例の「課題と施策」を記事内に自然に組み込んでください:

${challengeBlocks.join('\n\n')}

読者が「自分も同じ課題を抱えている」と共感できる形で記述してください。
事業者名・個人名は絶対に出さず、業種+地域+匿名（A様、B様等）で記載してください。`;

  // Second prompt: results + metrics focus (injected at ~70%)
  const resultBlocks = caseStudies.map((cs) => {
    let block = `[事例成果] ${cs.business_name}（${cs.industry}）
成果: ${cs.result}`;
    if (cs.quote) {
      block += `\nお客様の声: ${cs.quote}`;
    }
    return block;
  });

  const promptB = `

以下の導入事例の「成果と数値」を記事内に自然に組み込んでください:

${resultBlocks.join('\n\n')}

具体的な数値を正確に引用し、読者の検討段階で信頼性を補強する形で使ってください。
事業者名・個人名は絶対に出さず、業種+地域+匿名（A様、B様等）で記載してください。`;

  return [promptA, promptB];
}

export async function insertCaseStudy(
  env: Env,
  data: {
    business_name: string;
    industry: string;
    challenge: string;
    solution: string;
    result: string;
    quote?: string;
    metrics_json?: string;
    is_anonymized?: boolean;
  }
): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO case_studies (business_name, industry, challenge, solution, result, quote, metrics_json, is_anonymized, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      data.business_name,
      data.industry,
      data.challenge,
      data.solution,
      data.result,
      data.quote ?? null,
      data.metrics_json ?? null,
      data.is_anonymized !== undefined ? (data.is_anonymized ? 1 : 0) : 1
    )
    .run();

  return result.meta.last_row_id as number;
}
