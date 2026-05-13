import { describe, expect, it } from 'vitest';
import {
  BALILINGUAL_PRICING_TABLE,
  answersToEstimateInput,
  buildBalilingualEstimate,
  buildEstimate,
  buildEstimateFlex,
  formatEstimateText,
  getRow,
  maxWeeks,
  type PlanId,
} from '../services/balilingual-estimator';

const table = BALILINGUAL_PRICING_TABLE;

describe('balilingual pricing table', () => {
  it('bundles 24 weekly pricing rows', () => {
    expect(table.weekly_pricing).toHaveLength(24);
    expect(table.weekly_pricing.map((row) => row.weeks)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
  });

  it('bundles all three plans', () => {
    expect(table.plans.map((plan) => plan.id).sort()).toEqual(['hotel', 'pair', 'single']);
  });

  it('has 24-week pricing for all three plans', () => {
    expect(getRow(table, 24)).toMatchObject({ single: 1620000, pair: 1370000, hotel: 1058000 });
  });

  it('reports max weeks', () => {
    expect(maxWeeks(table)).toBe(24);
  });
});

describe('buildEstimate - single-person base behavior', () => {
  it('single room 4 weeks includes admission fee', () => {
    const estimate = buildEstimate(table, { weeks: 4, plan: 'single', includeAdmissionFee: true });
    expect(estimate.lines).toHaveLength(2);
    expect(estimate.lines[0].label).toBe('1人部屋 4週');
    expect(estimate.lines[0].amount).toBe(349800);
    expect(estimate.lines[1].amount).toBe(30000);
    expect(estimate.total).toBe(379800);
    expect(estimate.pax).toBe(1);
    expect(estimate.isParentChild).toBe(false);
  });

  it('pair 12 weeks is one-person amount with companion note', () => {
    const estimate = buildEstimate(table, { weeks: 12, plan: 'pair', includeAdmissionFee: true });
    expect(estimate.pax).toBe(1);
    expect(estimate.lines[0].amount).toBe(768000);
    expect(estimate.lines[1].amount).toBe(30000);
    expect(estimate.total).toBe(798000);
    expect(estimate.notes.some((note) => note.includes('同行者の方も同額で別途お見積もり'))).toBe(true);
  });

  it('hotel 24 weeks can exclude admission fee', () => {
    const estimate = buildEstimate(table, { weeks: 24, plan: 'hotel', includeAdmissionFee: false });
    expect(estimate.lines).toHaveLength(1);
    expect(estimate.total).toBe(1058000);
  });

  it.each<PlanId>(['single', 'pair', 'hotel'])('buildBalilingualEstimate imports bundled table for %s', (plan) => {
    const estimate = buildBalilingualEstimate({ weeks: 1, plan, includeAdmissionFee: false });
    expect(estimate.total).toBe(getRow(table, 1)?.[plan]);
  });
});

describe('buildEstimate - parent-child multiplier', () => {
  it('single room 8 weeks parent-child 2 pax multiplies tuition and admission', () => {
    const estimate = buildEstimate(table, { weeks: 8, plan: 'single', pax: 2, isParentChild: true });
    expect(estimate.pax).toBe(2);
    expect(estimate.isParentChild).toBe(true);
    expect(estimate.lines[0].amount).toBe(1258000);
    expect(estimate.lines[0].label).toContain('× 2名');
    expect(estimate.lines[0].note).toContain('1名あたり');
    expect(estimate.lines[1].amount).toBe(60000);
    expect(estimate.total).toBe(1318000);
  });

  it('parent-child 3 pax is supported', () => {
    const estimate = buildEstimate(table, { weeks: 4, plan: 'single', pax: 3, isParentChild: true });
    expect(estimate.total).toBe(1139400);
  });

  it('parent-child with pax less than 2 warns', () => {
    const estimate = buildEstimate(table, { weeks: 4, plan: 'single', pax: 1, isParentChild: true });
    expect(estimate.warnings.some((warning) => warning.includes('2名以上が前提'))).toBe(true);
  });

  it('parent-child pair also multiplies by pax and omits companion note', () => {
    const estimate = buildEstimate(table, { weeks: 4, plan: 'pair', pax: 2, isParentChild: true });
    expect(estimate.pax).toBe(2);
    expect(estimate.lines[0].amount).toBe(596000);
    expect(estimate.notes.some((note) => note.includes('同行者の方も同額で別途お見積もり'))).toBe(false);
  });
});

describe('buildEstimate - out of table', () => {
  it('30 weeks returns warning and zero total', () => {
    const estimate = buildEstimate(table, { weeks: 30, plan: 'single' });
    expect(estimate.warnings.length).toBeGreaterThan(0);
    expect(estimate.total).toBe(0);
    expect(estimate.notes).toContain('料金表外: スタッフが個別にお見積もりします');
  });

  it('zero weeks returns missing-week warning', () => {
    const estimate = buildEstimate(table, { weeks: 0, plan: 'single' });
    expect(estimate.warnings[0]).toContain('料金表にない週数');
  });
});

describe('formatEstimateText', () => {
  it('single room 4 weeks shows one-person amount only', () => {
    const estimate = buildEstimate(table, { weeks: 4, plan: 'single', includeAdmissionFee: true });
    const text = formatEstimateText(estimate);
    expect(text).toContain('379,800円');
    expect(text).toContain('1人部屋 4週');
    expect(text).not.toContain('× 1名');
    expect(text).not.toContain('同行者');
  });

  it('pair 12 weeks shows companion note', () => {
    const estimate = buildEstimate(table, { weeks: 12, plan: 'pair', includeAdmissionFee: true });
    const text = formatEstimateText(estimate);
    expect(text).toContain('798,000円');
    expect(text).toContain('同行者の方も同額で別途お見積もり');
  });

  it('parent-child shows pax in header', () => {
    const estimate = buildEstimate(table, { weeks: 4, plan: 'single', pax: 2, isParentChild: true });
    const text = formatEstimateText(estimate);
    expect(text).toContain('親子留学 2名');
    expect(text).toContain('× 2名');
  });

  it('out-of-table estimate asks staff to follow up', () => {
    const estimate = buildEstimate(table, { weeks: 30, plan: 'single' });
    const text = formatEstimateText(estimate);
    expect(text).toContain('スタッフから個別にご連絡');
  });
});

describe('buildEstimateFlex', () => {
  it('flex contains pair one-person amount and companion note', () => {
    const estimate = buildEstimate(table, { weeks: 4, plan: 'pair' });
    const flex = JSON.stringify(buildEstimateFlex(estimate));
    expect(flex).toContain('298,000円');
    expect(flex).toContain('同行者の方も同額で別途');
  });

  it('parent-child flex contains pax in header', () => {
    const estimate = buildEstimate(table, { weeks: 4, plan: 'single', pax: 3, isParentChild: true });
    const flex = JSON.stringify(buildEstimateFlex(estimate));
    expect(flex).toContain('親子3名');
  });

  it('flex alt text contains total amount', () => {
    const estimate = buildEstimate(table, { weeks: 4, plan: 'single' });
    const flex = buildEstimateFlex(estimate) as { altText: string };
    expect(flex.altText).toContain('379,800円');
  });
});

describe('answersToEstimateInput', () => {
  it('1month and pair converts to 4-week pair one-person estimate input', () => {
    const result = answersToEstimateInput({ desired_duration: '1month', room_type: 'pair' });
    expect(result.input.weeks).toBe(4);
    expect(result.input.plan).toBe('pair');
    expect(result.input.pax).toBe(1);
    expect(result.input.isParentChild).toBe(false);
    expect(result.needsParentChildPax).toBe(false);
  });

  it('parent_child with pax converts to parent-child input', () => {
    const result = answersToEstimateInput({
      desired_duration: '1month',
      room_type: 'single',
      plan_interest: 'parent_child',
      parent_child_pax: '3',
    });
    expect(result.input.isParentChild).toBe(true);
    expect(result.input.pax).toBe(3);
    expect(result.needsParentChildPax).toBe(false);
  });

  it('parent_child without pax sets needs flag and provisional 2 pax', () => {
    const result = answersToEstimateInput({
      desired_duration: '1month',
      room_type: 'single',
      plan_interest: 'parent_child',
    });
    expect(result.input.isParentChild).toBe(true);
    expect(result.input.pax).toBe(2);
    expect(result.needsParentChildPax).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('parent_child_pax'))).toBe(true);
  });

  it('parent_child with pax=1 is corrected to provisional 2 pax', () => {
    const result = answersToEstimateInput({
      desired_duration: '1month',
      room_type: 'single',
      plan_interest: 'parent_child',
      parent_child_pax: '1',
    });
    expect(result.input.pax).toBe(2);
    expect(result.needsParentChildPax).toBe(true);
  });

  it('Japanese pair room wording maps to pair and keeps pax=1', () => {
    const result = answersToEstimateInput({ desired_duration: '1month', room_type: '2人部屋' });
    expect(result.input.plan).toBe('pair');
    expect(result.input.pax).toBe(1);
  });

  it('missing answers produce warning and defaults', () => {
    const result = answersToEstimateInput({});
    expect(result.warnings).toContain('desired_duration が未回答です. 4週で計算します');
    expect(result.input.weeks).toBe(4);
    expect(result.input.plan).toBe('single');
    expect(result.input.isParentChild).toBe(false);
  });

  it('numeric weeks are parsed from unknown duration strings', () => {
    const result = answersToEstimateInput({ desired_duration: '14weeks', room_type: 'hotel' });
    expect(result.input.weeks).toBe(14);
    expect(result.input.plan).toBe('hotel');
  });

  it('unknown room falls back to single with warning', () => {
    const result = answersToEstimateInput({ desired_duration: '1month', room_type: 'suite' });
    expect(result.input.plan).toBe('single');
    expect(result.warnings.some((warning) => warning.includes('room_type を解釈できませんでした'))).toBe(true);
  });
});
