import type { EstimateInput } from './index';

const DURATION_MAP: Record<string, number> = {
  '1week': 1,
  '1weeks': 1,
  '2weeks': 2,
  '3weeks': 3,
  '1month': 4,
  '4weeks': 4,
  '5weeks': 5,
  '6weeks': 6,
  '7weeks': 7,
  '2months': 8,
  '8weeks': 8,
  '9weeks': 9,
  '10weeks': 10,
  '11weeks': 11,
  '3months': 12,
  '12weeks': 12,
  '4months': 16,
  '16weeks': 16,
  '5months': 20,
  '20weeks': 20,
  '6months': 24,
  '24weeks': 24,
};

const ROOM_MAP: Record<string, EstimateInput['plan']> = {
  single: 'single',
  '1人部屋': 'single',
  個室: 'single',
  pair: 'pair',
  '2人部屋': 'pair',
  ペア: 'pair',
  ペア留学: 'pair',
  hotel: 'hotel',
  外泊: 'hotel',
  ホテル: 'hotel',
};

export interface DiagnosisAnswers {
  desired_duration?: string;
  room_type?: string;
  plan_interest?: string;
  parent_child_pax?: string | number;
  [key: string]: unknown;
}

export interface ConvertResult {
  input: EstimateInput;
  warnings: string[];
  needsParentChildPax: boolean;
}

export function answersToEstimateInput(answers: DiagnosisAnswers): ConvertResult {
  const warnings: string[] = [];

  let weeks = 4;
  if (answers.desired_duration) {
    const key = String(answers.desired_duration).toLowerCase();
    const mapped = DURATION_MAP[key];
    if (mapped) {
      weeks = mapped;
    } else {
      const num = parseInt(key.match(/\d+/)?.[0] ?? '', 10);
      if (Number.isFinite(num) && num > 0) {
        weeks = key.includes('month') ? num * 4 : num;
      } else {
        warnings.push(`desired_duration を解釈できませんでした: "${answers.desired_duration}". 4週で計算します`);
      }
    }
  } else {
    warnings.push('desired_duration が未回答です. 4週で計算します');
  }

  let plan: EstimateInput['plan'] = 'single';
  if (answers.room_type) {
    const key = String(answers.room_type);
    const mapped = ROOM_MAP[key] ?? ROOM_MAP[key.toLowerCase()];
    if (mapped) {
      plan = mapped;
    } else {
      warnings.push(`room_type を解釈できませんでした: "${answers.room_type}". 1人部屋で計算します`);
    }
  }

  const isParentChild = String(answers.plan_interest ?? '').toLowerCase() === 'parent_child';
  let pax = 1;
  let needsParentChildPax = false;
  if (isParentChild) {
    if (answers.parent_child_pax !== undefined) {
      const n = typeof answers.parent_child_pax === 'number'
        ? answers.parent_child_pax
        : parseInt(String(answers.parent_child_pax), 10);
      if (Number.isFinite(n) && n >= 2) {
        pax = n;
      } else {
        warnings.push(`parent_child_pax が不正です: "${answers.parent_child_pax}". 2名で仮計算します`);
        pax = 2;
        needsParentChildPax = true;
      }
    } else {
      warnings.push('親子留学ですが人数(parent_child_pax)が未回答です. 2名で仮計算します. ユーザーに確認してください');
      pax = 2;
      needsParentChildPax = true;
    }
  }

  return {
    input: { weeks, plan, pax, isParentChild, includeAdmissionFee: true },
    warnings,
    needsParentChildPax,
  };
}
