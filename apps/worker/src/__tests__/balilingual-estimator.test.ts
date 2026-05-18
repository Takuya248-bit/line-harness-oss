import { describe, it, expect } from 'vitest';
import { BALILINGUAL_PRICING_TABLE } from '../services/balilingual-estimator';
import { buildEstimate, formatEstimateText, buildEstimateFlex } from '../services/balilingual-estimator';
import { answersToEstimateInput } from '../services/balilingual-estimator';



const table = BALILINGUAL_PRICING_TABLE;

describe('buildEstimate - 1人分基本(入学金統合版)', () => {
  it('1人部屋4週: 入学金を内訳に出さず総額一本化', () => {
    const e = buildEstimate(table, { weeks: 4, plan: 'single', includeAdmissionFee: true });
    // 内訳1行のみ(入学金は別行にしない)
    expect(e.lines).toHaveLength(1);
    expect(e.lines[0].label).toBe('1人部屋 4週(税込・全部込み)');
    expect(e.lines[0].amount).toBe(379800); // 349,800 + 30,000
    expect(e.total).toBe(379800);
    expect(e.pax).toBe(1);
    expect(e.isParentChild).toBe(false);
  });

  it('ペア(2人部屋)4週: 1人参加・相部屋プランで1人分料金', () => {
    const e = buildEstimate(table, { weeks: 4, plan: 'pair', includeAdmissionFee: true });
    expect(e.pax).toBe(1);
    // 298,000 + 30,000 = 328,000 (1人分のみ)
    expect(e.lines[0].amount).toBe(328000);
    expect(e.total).toBe(328000);
    // 「相部屋」の説明が含まれる
    expect(e.notes.some((n) => n.includes('相部屋'))).toBe(true);
    // 「同行者別途」の文言は出さない
    expect(e.notes.some((n) => n.includes('同行者の方も同額で別途'))).toBe(false);
  });

  it('外泊24週 入学金なし → 1人分', () => {
    const e = buildEstimate(table, { weeks: 24, plan: 'hotel', includeAdmissionFee: false });
    expect(e.lines).toHaveLength(1);
    expect(e.total).toBe(1058000);
  });
});

describe('buildEstimate - 親子留学(人数倍掛け+入学金統合)', () => {
  it('1人部屋8週 親子2名 → (1名分料金+入学金) × 2', () => {
    const e = buildEstimate(table, { weeks: 8, plan: 'single', pax: 2, isParentChild: true });
    expect(e.pax).toBe(2);
    expect(e.isParentChild).toBe(true);
    // (629,000 + 30,000) × 2 = 1,318,000
    expect(e.lines[0].amount).toBe(1318000);
    expect(e.lines[0].label).toContain('× 2名');
    expect(e.lines[0].note).toContain('1名あたり 659,000');
    expect(e.total).toBe(1318000);
  });

  it('親子3名は3人分計算', () => {
    const e = buildEstimate(table, { weeks: 4, plan: 'single', pax: 3, isParentChild: true });
    // (349,800 + 30,000) × 3 = 1,139,400
    expect(e.total).toBe(1139400);
  });

  it('親子フラグありで pax<2 なら警告', () => {
    const e = buildEstimate(table, { weeks: 4, plan: 'single', pax: 1, isParentChild: true });
    expect(e.warnings.some((w) => w.includes('2名以上が前提'))).toBe(true);
  });
});

describe('buildEstimate - 料金表外(個別案内)', () => {
  it('30週は warning + total=0', () => {
    const e = buildEstimate(table, { weeks: 30, plan: 'single' });
    expect(e.warnings.length).toBeGreaterThan(0);
    expect(e.total).toBe(0);
    expect(e.notes).toContain('料金表外: スタッフが個別にお見積もりします');
  });
});

describe('formatEstimateText - 新仕様', () => {
  it('1人部屋4週: 入学金を内訳に出さず総額一本化', () => {
    const e = buildEstimate(table, { weeks: 4, plan: 'single', includeAdmissionFee: true });
    const text = formatEstimateText(e);
    expect(text).toContain('379,800円');
    expect(text).toContain('1人部屋 4週');
    expect(text).toContain('全部込み');
    // 入学金は内訳に出さない
    expect(text).not.toContain('入学金');
  });

  it('ペア4週: 1人分料金 + 相部屋説明', () => {
    const e = buildEstimate(table, { weeks: 4, plan: 'pair' });
    const text = formatEstimateText(e);
    expect(text).toContain('328,000円');
    expect(text).toContain('相部屋');
  });

  it('デポジット案内が含まれる', () => {
    const e = buildEstimate(table, { weeks: 4, plan: 'single' });
    const text = formatEstimateText(e);
    expect(text).toContain('5万円のデポジット');
    expect(text).toContain('60日前まで全額返金');
  });

  it('料金表外は問い合わせ文言', () => {
    const e = buildEstimate(table, { weeks: 30, plan: 'single' });
    const text = formatEstimateText(e);
    expect(text).toContain('スタッフから個別にご連絡');
  });
});

describe('buildEstimateFlex - 新仕様', () => {
  it('ペア4週 flex: 1人分金額 + 相部屋説明ボックス', () => {
    const e = buildEstimate(table, { weeks: 4, plan: 'pair' });
    const flex = JSON.stringify(buildEstimateFlex(e));
    expect(flex).toContain('328,000円');
    expect(flex).toContain('ペア(2人部屋)について');
    expect(flex).toContain('お一人参加でも問題ありません');
    // 同行者別途文言は出ない
    expect(flex).not.toContain('同行者の方も同額で別途');
  });

  it('親子3名 flex: ヘッダーに人数', () => {
    const e = buildEstimate(table, { weeks: 4, plan: 'single', pax: 3, isParentChild: true });
    const flex = JSON.stringify(buildEstimateFlex(e));
    expect(flex).toContain('親子3名');
  });

  it('デポジット仮予約ボタンが含まれる', () => {
    const e = buildEstimate(table, { weeks: 4, plan: 'single' });
    const flex = JSON.stringify(buildEstimateFlex(e));
    expect(flex).toContain('action=book_deposit');
    expect(flex).toContain('5万円で仮予約');
  });

  it('無料相談ボタンが含まれる', () => {
    const e = buildEstimate(table, { weeks: 4, plan: 'single' });
    const flex = JSON.stringify(buildEstimateFlex(e));
    expect(flex).toContain('action=book_consultation');
    expect(flex).toContain('まずは無料相談');
  });

  it('損失回避訴求(人気期間は埋まる)が含まれる', () => {
    const e = buildEstimate(table, { weeks: 4, plan: 'single' });
    const flex = JSON.stringify(buildEstimateFlex(e));
    expect(flex).toContain('人気の期間は2〜3ヶ月前に埋まります');
  });

  it('料金表外は専用Flex', () => {
    const e = buildEstimate(table, { weeks: 30, plan: 'single' });
    const flex = JSON.stringify(buildEstimateFlex(e));
    // 個別案内向けなのでデポジットボタンは出さない
    expect(flex).not.toContain('action=book_deposit');
    expect(flex).toContain('action=book_consultation');
    expect(flex).toContain('スタッフから個別');
  });
});

describe('answersToEstimateInput', () => {
  it('1month + pair: pax=1のまま(相部屋プラン1人参加)', () => {
    const r = answersToEstimateInput({ desired_duration: '1month', room_type: 'pair' });
    expect(r.input.weeks).toBe(4);
    expect(r.input.plan).toBe('pair');
    expect(r.input.pax).toBe(1);
    expect(r.input.isParentChild).toBe(false);

    // estimator通しても pax=1のまま(pair=相部屋1人参加)
    const e = buildEstimate(table, r.input);
    expect(e.pax).toBe(1);
  });

  it('plan_interest=parent_child + 人数あり → 親子人数で計算', () => {
    const r = answersToEstimateInput({
      desired_duration: '1month',
      room_type: 'single',
      plan_interest: 'parent_child',
      parent_child_pax: '3',
    });
    expect(r.input.isParentChild).toBe(true);
    expect(r.input.pax).toBe(3);
    expect(r.needsParentChildPax).toBe(false);
  });

  it('plan_interest=parent_child + 人数未指定 → needs flag', () => {
    const r = answersToEstimateInput({
      desired_duration: '1month',
      room_type: 'single',
      plan_interest: 'parent_child',
    });
    expect(r.input.isParentChild).toBe(true);
    expect(r.input.pax).toBe(2);
    expect(r.needsParentChildPax).toBe(true);
  });

  it('「2人部屋」表記でも pair に変換', () => {
    const r = answersToEstimateInput({ desired_duration: '1month', room_type: '2人部屋' });
    expect(r.input.plan).toBe('pair');
  });

  it('未回答は警告とdefault', () => {
    const r = answersToEstimateInput({});
    expect(r.warnings).toContain('desired_duration が未回答です. 4週で計算します');
    expect(r.input.weeks).toBe(4);
    expect(r.input.plan).toBe('single');
    expect(r.input.isParentChild).toBe(false);
  });
});
