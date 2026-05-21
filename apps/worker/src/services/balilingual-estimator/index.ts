import { BALILINGUAL_PRICING_TABLE, getRow, maxWeeks, type PlanId, type PricingTable } from './pricing';

export type { PlanId, PricingTable } from './pricing';
export { BALILINGUAL_PRICING_TABLE, getRow, maxWeeks } from './pricing';
export { answersToEstimateInput, type ConvertResult, type DiagnosisAnswers } from './diagnosis';


export interface EstimateInput {
  weeks: number;
  plan: PlanId;
  /**
   * 親子留学の場合の人数. plan='single' でも parent_child=true なら N倍掛けで集計する.
   * pair の場合は1名分の見積りを出すので無視 (同行者は別途案内).
   * 未指定なら 1.
   */
  pax?: number;
  /** 親子留学かどうか. true なら pax を掛け算して合計を出す. */
  isParentChild?: boolean;
  /** 入学金を含めるか. 新規友だちは含める, 既存利用者は除外. */
  includeAdmissionFee?: boolean;
}

export interface EstimateLineItem {
  label: string;
  amount: number;
  note?: string;
}

export interface Estimate {
  weeks: number;
  plan: PlanId;
  planLabel: string;
  /** 集計に使った人数. pair は常に1 (1人分集計), 親子留学は input.pax. */
  pax: number;
  isParentChild: boolean;
  lines: EstimateLineItem[];
  subtotal: number;
  total: number;
  notes: string[];
  warnings: string[];
}

export function buildEstimate(table: PricingTable, input: EstimateInput): Estimate {
  const warnings: string[] = [];
  const isParentChild = input.isParentChild === true;
  const requestedPax = input.pax ?? 1;

  // 集計人数:
  //  - 親子留学: requestedPax (倍掛け)
  //  - その他(single/pair/hotel): 1名(pairも相部屋を1人で利用するのが基本ケース)
  const effectivePax = isParentChild ? Math.max(1, requestedPax) : 1;

  if (isParentChild && requestedPax < 2) {
    warnings.push('親子留学は2名以上が前提です. 人数をご確認ください.');
  }

  const row = getRow(table, input.weeks);
  if (!row) {
    const max = maxWeeks(table);
    if (input.weeks > max) {
      warnings.push(`${input.weeks}週は料金表(最大${max}週)を超えるため個別見積もりが必要です`);
    } else {
      warnings.push(`${input.weeks}週は料金表にない週数です. 直近の週数で代替するか個別見積もりが必要です`);
    }
    return {
      weeks: input.weeks,
      plan: input.plan,
      planLabel: table.plans.find((p) => p.id === input.plan)?.label ?? input.plan,
      pax: effectivePax,
      isParentChild,
      lines: [],
      subtotal: 0,
      total: 0,
      notes: ['料金表外: スタッフが個別にお見積もりします'],
      warnings,
    };
  }

  const perPersonAmount = row[input.plan] as number;
  const planLabel = table.plans.find((p) => p.id === input.plan)?.label ?? input.plan;

  // 入学金を per-person 金額に統合(内訳に出さず総額一本化)
  const admissionAmount = input.includeAdmissionFee !== false
    ? (table.not_included.find((n) => n.label === '入学金')?.amount ?? 0)
    : 0;
  const perPersonAllInclusive = perPersonAmount + admissionAmount;

  const lines: EstimateLineItem[] = [];

  if (isParentChild) {
    // 親子留学: pax名分の合計を1行で(入学金含む)
    lines.push({
      label: `${planLabel} ${input.weeks}週 × ${effectivePax}名(税込・全部込み)`,
      amount: perPersonAllInclusive * effectivePax,
      note: `1名あたり ${perPersonAllInclusive.toLocaleString()} 円`,
    });
  } else {
    // 通常: 1人分(single/pair/hotelすべて同じ。pairも相部屋1名利用が基本)
    lines.push({
      label: `${planLabel} ${input.weeks}週(税込・全部込み)`,
      amount: perPersonAllInclusive,
    });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);

  const notes: string[] = [...table.notes];
  notes.push('航空券・ビザ料金・現地でのお小遣いは別途必要です');
  if (input.plan === 'pair' && !isParentChild) {
    notes.push('ペア(2人部屋)はルームメイトとの相部屋です。お一人参加でも問題ありません');
  }
  notes.push('5万円のデポジット決済で、空き枠を仮予約できます(渡航60日前まで全額返金)');

  return {
    weeks: input.weeks,
    plan: input.plan,
    planLabel,
    pax: effectivePax,
    isParentChild,
    lines,
    subtotal,
    total: subtotal,
    notes,
    warnings,
  };
}

/**
 * 見積もりを LINE textMessage 用の整形文字列に変換する.
 */
export function formatEstimateText(estimate: Estimate): string {
  if (estimate.lines.length === 0) {
    return [
      `${estimate.planLabel} ${estimate.weeks}週のお見積もり`,
      '',
      ...estimate.warnings.map((w) => `※ ${w}`),
      '',
      'スタッフから個別にご連絡します',
    ].join('\n');
  }

  const headerSuffix = estimate.isParentChild ? ` (親子留学 ${estimate.pax}名)` : '';
  const lines: string[] = [];
  lines.push(`【お見積もり】${estimate.planLabel} ${estimate.weeks}週${headerSuffix}`);
  lines.push('');
  for (const li of estimate.lines) {
    lines.push(`・${li.label}: ${li.amount.toLocaleString()}円`);
    if (li.note) lines.push(`  (${li.note})`);
  }
  lines.push('');
  lines.push(`合計: ${estimate.total.toLocaleString()}円(税込・全部込み)`);
  lines.push('');
  lines.push('別途必要:');
  lines.push('・航空券・ビザ・現地お小遣い');
  if (estimate.plan === 'pair' && !estimate.isParentChild) {
    lines.push('');
    lines.push('👥 ペア(2人部屋)はルームメイトとの相部屋プランです。');
    lines.push('お一人参加でも問題ありません(相部屋にすることで料金がお得)。');
  }
  lines.push('');
  lines.push('🌴 人気期間は2-3ヶ月前に埋まります');
  lines.push('5万円のデポジット決済で空き枠を仮予約できます');
  lines.push('(渡航60日前まで全額返金、本予約時は全額充当)');

  return lines.join('\n');
}

/**
 * LINE Flex Message 用の構造体. harness `POST /api/friends/:id/messages` で送信可能.
 *
 * 設計方針(2026-05-15 改訂):
 *  - 入学金は内訳に出さず、総額に統合
 *  - ペアプランは2名分計算済みで提示(同行者別途の文言を排除)
 *  - 合計を最も大きく強調表示(目立たせる)
 *  - 「全部込み」「税込」を明示
 *  - 行動ボタン4種: デポジット仮予約(primary)/相談予約/再見積もり/質問
 *  - 損失回避: 「人気期間は2-3ヶ月前に埋まります」訴求
 *  - 社会的証明: 卒業生数・リピート率(空欄カスタマイズ可能)
 *  - 時間制約: 「無料相談 → デポジット → 仮予約 約10分」見通し提示
 */
export function buildEstimateFlex(estimate: Estimate): unknown {
  if (estimate.total === 0) {
    // 料金表外: スタッフ個別案内Flex
    return buildOutOfTableFlex(estimate);
  }

  const headerSuffix = estimate.isParentChild
    ? ` 親子${estimate.pax}名`
    : '';

  const totalStr = `${estimate.total.toLocaleString()}円`;
  const perPersonHint = estimate.lines[0]?.note ?? '';

  const body: unknown[] = [
    // タイトル行
    {
      type: 'text',
      text: `${estimate.planLabel} ${estimate.weeks}週${headerSuffix}`,
      weight: 'bold',
      size: 'md',
      color: '#374151',
      wrap: true,
    },
    { type: 'separator', margin: 'md' },

    // メイン合計を大きく表示
    {
      type: 'box',
      layout: 'vertical',
      margin: 'lg',
      paddingAll: '16px',
      backgroundColor: '#FFF7ED',
      cornerRadius: 'md',
      contents: [
        { type: 'text', text: '合計(税込・全部込み)', size: 'sm', color: '#9A3412' },
        {
          type: 'text',
          text: totalStr,
          weight: 'bold',
          size: 'xxl',
          color: '#FF6600',
          margin: 'sm',
          align: 'center',
        },
        ...(perPersonHint
          ? [{ type: 'text', text: perPersonHint, size: 'sm', color: '#9A3412', margin: 'sm', align: 'center', wrap: true }]
          : []),
      ],
    },

    // 含まれるもの (箇条書きで読みやすく)
    { type: 'separator', margin: 'lg' },
    {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      paddingAll: '12px',
      backgroundColor: '#F9FAFB',
      cornerRadius: 'md',
      contents: [
        {
          type: 'text',
          text: '✅ この金額に含まれるもの',
          weight: 'bold',
          size: 'sm',
          color: '#111827',
        },
        {
          type: 'text',
          text: '・授業料\n・食事(平日のみ)\n・宿舎\n・空港送迎\n・入学金\n・卒業後コミュニティ\n・学習/キャリア相談\n・ツアー/イベント紹介',
          size: 'sm',
          color: '#374151',
          margin: 'sm',
          wrap: true,
        },
      ],
    },
    // 別途必要
    {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      paddingAll: '12px',
      backgroundColor: '#FFFBEB',
      cornerRadius: 'md',
      contents: [
        {
          type: 'text',
          text: '⚠️ 別途必要',
          weight: 'bold',
          size: 'sm',
          color: '#92400E',
        },
        {
          type: 'text',
          text: '・航空券\n・ビザ料金\n・現地でのお小遣い' + (estimate.plan === 'hotel' ? '\n・食事(ホテルプランは食事なし)' : ''),
          size: 'sm',
          color: '#78350F',
          margin: 'sm',
          wrap: true,
        },
      ],
    },
    // ペア相部屋の説明(該当時のみ)
    ...(estimate.plan === 'pair' && !estimate.isParentChild
      ? [
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            paddingAll: '12px',
            backgroundColor: '#F0FDFA',
            cornerRadius: 'md',
            contents: [
              {
                type: 'text',
                text: '👥 ペア(2人部屋)について',
                weight: 'bold',
                size: 'sm',
                color: '#0F766E',
              },
              {
                type: 'text',
                text: 'ルームメイトとの相部屋プラン。\nお一人参加でもOK(相部屋にすることで1人部屋より料金がお得です)。',
                size: 'sm',
                color: '#134E4A',
                margin: 'sm',
                wrap: true,
              },
            ],
          },
        ]
      : []),

    // デポジット導入(損失回避訴求)
    { type: 'separator', margin: 'lg' },
    {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      paddingAll: '12px',
      backgroundColor: '#ECFEFF',
      cornerRadius: 'md',
      contents: [
        {
          type: 'text',
          text: '🌴 人気の期間は2〜3ヶ月前に埋まります',
          weight: 'bold',
          size: 'sm',
          color: '#0E7490',
          wrap: true,
        },
        {
          type: 'text',
          text: '5万円のデポジットで空き枠を仮予約できます。\n渡航60日前まで全額返金、本予約時は全額充当。',
          size: 'sm',
          color: '#155E75',
          margin: 'sm',
          wrap: true,
        },
      ],
    },

    // 流れ(時間制約)
    {
      type: 'text',
      text: '無料相談 → デポジット → 仮予約まで約10分',
      size: 'sm',
      color: '#6B7280',
      margin: 'md',
      align: 'center',
      wrap: true,
    },
  ];

  return {
    type: 'flex',
    altText: `${estimate.planLabel} ${estimate.weeks}週: ${totalStr}(全部込み)`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FF6600',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '🌴 バリリンガル お見積もり', color: '#FFFFFF', weight: 'bold', size: 'md' },
        ],
      },
      body: { type: 'box', layout: 'vertical', contents: body, paddingAll: '16px' },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          // 1番目: 最も温度高いCTA = デポジット仮予約
          {
            type: 'button',
            style: 'primary',
            color: '#FF6600',
            height: 'md',
            action: {
              type: 'postback',
              label: '💳 5万円で仮予約する',
              data: 'action=book_deposit',
              displayText: '5万円で仮予約します',
            },
          },
          // 2番目: 無料相談
          {
            type: 'button',
            style: 'primary',
            color: '#0EA5A4',
            height: 'md',
            action: {
              type: 'postback',
              label: '☕ まずは無料相談する',
              data: 'action=book_consultation',
              displayText: '無料相談したいです',
            },
          },
          // 3番目: 条件変更
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'postback',
              label: '条件を変えて再見積もり',
              data: 'action=re_estimate',
              displayText: '条件を変えたいです',
            },
          },
          // 4番目: 質問
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'postback',
              label: '質問する',
              data: 'action=ask_question',
              displayText: '質問があります',
            },
          },
          // 案内文(社会的証明 + メール案内)
          {
            type: 'text',
            text: '📩 詳しい資料をメールでもお送りできます',
            size: 'xs',
            color: '#888888',
            margin: 'md',
            align: 'center',
            wrap: true,
          },
        ],
      },
    },
  };
}

function buildOutOfTableFlex(estimate: Estimate): unknown {
  const warningText = estimate.warnings.join(' / ') || '料金表外の条件です';
  return {
    type: 'flex',
    altText: `${estimate.planLabel} ${estimate.weeks}週: 個別お見積もり`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FF6600',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '🌴 バリリンガル お見積もり', color: '#FFFFFF', weight: 'bold', size: 'md' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: `${estimate.planLabel} ${estimate.weeks}週`, weight: 'bold', size: 'md', color: '#111111' },
          { type: 'text', text: warningText, size: 'sm', color: '#6B7280', wrap: true, margin: 'md' },
          { type: 'text', text: 'スタッフから個別にお見積もりをお送りします。下のボタンからお気軽にどうぞ。', size: 'sm', color: '#374151', wrap: true, margin: 'md' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#0EA5A4',
            height: 'md',
            action: {
              type: 'postback',
              label: '☕ 無料相談する',
              data: 'action=book_consultation',
              displayText: '無料相談したいです',
            },
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'postback',
              label: '質問する',
              data: 'action=ask_question',
              displayText: '質問があります',
            },
          },
        ],
      },
    },
  };
}

export function buildBalilingualEstimate(input: EstimateInput): Estimate {
  return buildEstimate(BALILINGUAL_PRICING_TABLE, input);
}
