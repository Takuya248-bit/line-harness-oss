/**
 * Gemini 2.0 Flash API でドラフト生成
 * 料金/FAQ情報 + 会話履歴 + 過去承認ドラフト(few-shot) を注入
 */

export interface GeminiDraftOptions {
  message: string;
  geminiApiKey: string;
  phase?: string;
  history?: string[];
  fewShots?: FewShot[];
  instruction?: string;
  previousDraft?: string;
}

export interface FewShot {
  message: string;
  instruction?: string;
  finalDraft: string;
}

const CONTEXT = `
## バリリンガル事業情報

### 料金（税込・円）
入学金: 30,000円（別途必須）
1人部屋: 1週間119,800円 / 2週間219,800円 / 4週間349,800円 / 8週間629,000円
ペア留学: 1週間98,000円 / 2週間189,800円 / 4週間320,000円
外泊（自己手配）: 1週間85,000円 / 2週間163,000円 / 4週間246,000円
含まれるもの: 授業料・食事(朝/昼)・空港送迎・卒業証書・学習コミュニティ
含まれないもの: 入学金・航空券・ビザ代・現地お小遣い

### コース（全9種）
英語コース / ビジネス英語 / TOEIC対策 / ワーホリ準備 / サーフィン英語 / ヨガ英語 / 副業×英語 / 短期集中 / ファミリー留学

### 授業
1日4コマ（50分）。マンツーマン中心。レベル別クラス分け。

### 滞在
3種の寮あり（全個室）。外泊（自己手配）も可。

### ビザ
日本国籍は30日以内ビザ不要。延長可能。

### 禁止事項（絶対に書かない）
- 「スタッフ常駐」と書かない（寮にスタッフ常駐していない）
- 不確かな料金を書かない
- 入学金30,000円は必ず別途と伝える
`.trim();

const PHASE_TONE: Record<string, string> = {
  '01': '気軽さ重視。質問しやすい雰囲気づくり。CTA: アンケートに答える',
  '02': '具体的な提案。プランに合わせた訴求。CTA: 無料見積りを依頼する',
  '06': '不安解消。体験談・FAQ活用。CTA: 30分の無料オンライン相談を予約する',
  '08': '決断の後押し。具体的な次ステップ。CTA: お申し込みはこちら',
  '03': '寄り添い。ペースを合わせる。CTA: 見積もりをお願いします',
  '10': '渡航準備の案内。期待感醸成。CTA: 渡航前チェックリストを確認',
  '99': '再活性。新情報や季節ネタで接点。CTA: 無料見積りを依頼する',
};

export async function generateGeminiDraft(options: GeminiDraftOptions): Promise<string | null> {
  const tone =
    PHASE_TONE[options.phase ?? ''] ??
    '丁寧語ベース。フランクすぎない。CTA: LINEで気軽に質問する';

  const fewShotSection =
    options.fewShots && options.fewShots.length > 0
      ? `\n## 過去の良い返信例\n` +
        options.fewShots
          .map(
            (fs, i) =>
              `### 例${i + 1}\n質問: ${fs.message}${fs.instruction ? `\n修正指示: ${fs.instruction}` : ''}\n返信: ${fs.finalDraft}`,
          )
          .join('\n\n')
      : '';

  const historySection =
    options.history && options.history.length > 0
      ? `\n## 過去のやり取り（直近）\n${options.history.join('\n')}`
      : '';

  const revisionSection =
    options.instruction && options.previousDraft
      ? `\n## 修正指示\n前回ドラフト: ${options.previousDraft}\n指示: ${options.instruction}\n上記指示に従って返信を書き直してください。`
      : '';

  const systemPrompt = `あなたはバリリンガル（バリ島の語学学校）のCSスタッフです。
LINEで問い合わせが来た際の返信ドラフトを作成してください。

${CONTEXT}
${fewShotSection}

## 返信ルール
- トーン: ${tone}
- 親しみやすいが信頼感あり。「!」はOK、絵文字は最小限
- 押し売りしない。相手の状況を聞き出す→提案
- 質問には即答。曖昧な場合は「確認してお伝えしますね」
- CTAは1つに絞る
- 200文字以内で簡潔に
- 返信文のみを出力。前置きや説明は不要`;

  const userPrompt = `${historySection}${revisionSection}

## お客様のメッセージ
${options.message}

上記に対する返信ドラフトを書いてください。`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(options.geminiApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
        }),
      },
    );

    if (!res.ok) {
      console.error(`Gemini API error: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  } catch (err) {
    console.error('Gemini draft error:', err);
    return null;
  }
}
