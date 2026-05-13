import { BALILINGUAL_PRICING_TABLE, getRow, maxWeeks, type PlanId, type PricingTable } from './pricing';

export type { PlanId, PricingTable } from './pricing';
export { BALILINGUAL_PRICING_TABLE, getRow, maxWeeks } from './pricing';
export { answersToEstimateInput, type ConvertResult, type DiagnosisAnswers } from './diagnosis';

export interface EstimateInput {
  weeks: number;
  plan: PlanId;
  pax?: number;
  isParentChild?: boolean;
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
  const effectivePax = isParentChild ? Math.max(1, requestedPax) : 1;

  if (isParentChild && requestedPax < 2) {
    warnings.push('親子留学は2名以上が前提です. 人数をご確認ください.');
  }

  const row = getRow(table, input.weeks);
  const planLabel = table.plans.find((plan) => plan.id === input.plan)?.label ?? input.plan;
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
      planLabel,
      pax: effectivePax,
      isParentChild,
      lines: [],
      subtotal: 0,
      total: 0,
      notes: ['料金表外: スタッフが個別にお見積もりします'],
      warnings,
    };
  }

  const perPersonAmount = row[input.plan];
  const lines: EstimateLineItem[] = [];

  if (isParentChild) {
    lines.push({
      label: `${planLabel} ${input.weeks}週 × ${effectivePax}名`,
      amount: perPersonAmount * effectivePax,
      note: `1名あたり ${perPersonAmount.toLocaleString()} 円`,
    });
  } else {
    lines.push({
      label: `${planLabel} ${input.weeks}週`,
      amount: perPersonAmount,
    });
  }

  if (input.includeAdmissionFee !== false) {
    const admission = table.not_included.find((item) => item.label === '入学金');
    if (admission?.amount) {
      if (isParentChild) {
        lines.push({
          label: '入学金',
          amount: admission.amount * effectivePax,
          note: `1名あたり ${admission.amount.toLocaleString()} 円 × ${effectivePax}名`,
        });
      } else {
        lines.push({ label: '入学金', amount: admission.amount });
      }
    }
  }

  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const notes = [...table.notes, '航空券・ビザ料金・現地でのお小遣いは別途必要です'];
  if (input.plan === 'pair' && !isParentChild) {
    notes.push('ペア留学(2人部屋)は同行者の方も同額で別途お見積もりとなります');
  }

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

export function buildBalilingualEstimate(input: EstimateInput): Estimate {
  return buildEstimate(BALILINGUAL_PRICING_TABLE, input);
}

export function formatEstimateText(estimate: Estimate): string {
  if (estimate.lines.length === 0) {
    return [
      `${estimate.planLabel} ${estimate.weeks}週のお見積もり`,
      '',
      ...estimate.warnings.map((warning) => `※ ${warning}`),
      '',
      'スタッフから個別にご連絡します',
    ].join('\n');
  }

  const headerSuffix = estimate.isParentChild ? ` (親子留学 ${estimate.pax}名)` : '';
  const lines: string[] = [];
  lines.push(`【お見積もり】${estimate.planLabel} ${estimate.weeks}週${headerSuffix}`);
  lines.push('');
  for (const item of estimate.lines) {
    lines.push(`・${item.label}: ${item.amount.toLocaleString()}円`);
    if (item.note) lines.push(`  (${item.note})`);
  }
  lines.push('');
  lines.push(`合計: ${estimate.total.toLocaleString()}円(税込)`);
  lines.push('');
  if (estimate.plan === 'pair' && !estimate.isParentChild) {
    lines.push('※ ペア留学(2人部屋)の場合、同行者の方も同額で別途お見積もりとなります');
    lines.push('');
  }
  lines.push('別途必要:');
  lines.push('・航空券・ビザ・現地お小遣い');
  lines.push('');
  lines.push('内容のご確認・ご相談はスタッフが承ります');

  return lines.join('\n');
}

export function buildEstimateFlex(estimate: Estimate): unknown {
  const headerSuffix = estimate.isParentChild ? ` 親子${estimate.pax}名` : '';
  const body: unknown[] = [
    { type: 'text', text: `${estimate.planLabel} ${estimate.weeks}週${headerSuffix}`, weight: 'bold', size: 'lg', color: '#111111' },
    { type: 'separator', margin: 'md' },
  ];

  for (const item of estimate.lines) {
    body.push({
      type: 'box',
      layout: 'horizontal',
      margin: 'md',
      contents: [
        { type: 'text', text: item.label, size: 'sm', color: '#555555', flex: 5, wrap: true },
        { type: 'text', text: `${item.amount.toLocaleString()}円`, size: 'sm', color: '#111111', flex: 3, align: 'end' },
      ],
    });
    if (item.note) {
      body.push({ type: 'text', text: item.note, size: 'xs', color: '#888888' });
    }
  }

  body.push({ type: 'separator', margin: 'md' });
  body.push({
    type: 'box',
    layout: 'horizontal',
    margin: 'md',
    contents: [
      { type: 'text', text: '合計(税込)', weight: 'bold', size: 'md', flex: 5 },
      { type: 'text', text: `${estimate.total.toLocaleString()}円`, weight: 'bold', size: 'md', flex: 3, align: 'end', color: '#FF6600' },
    ],
  });
  if (estimate.plan === 'pair' && !estimate.isParentChild) {
    body.push({ type: 'text', text: '※ 同行者の方も同額で別途お見積もり', size: 'xs', color: '#888888', margin: 'sm', wrap: true });
  }
  body.push({ type: 'text', text: '航空券・ビザ・現地お小遣いは別途', size: 'xs', color: '#888888', margin: 'sm' });

  return {
    type: 'flex',
    altText: `${estimate.planLabel} ${estimate.weeks}週のお見積もり: ${estimate.total.toLocaleString()}円`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FF6600',
        contents: [{ type: 'text', text: 'バリリンガル お見積もり', color: '#FFFFFF', weight: 'bold' }],
      },
      body: { type: 'box', layout: 'vertical', contents: body },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#FF6600',
            action: { type: 'message', label: '相談を予約する', text: '相談予約希望' },
          },
          {
            type: 'button',
            style: 'secondary',
            action: { type: 'message', label: 'もう一度診断する', text: '見積もり診断' },
          },
        ],
      },
    },
  };
}
