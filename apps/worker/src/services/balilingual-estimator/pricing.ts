import pricingData from '../../data/balilingual-pricing.json';

export type PlanId = 'single' | 'pair' | 'hotel';

export interface PricingPlan {
  id: PlanId;
  label: string;
  description: string;
  per_person: boolean;
}

export interface WeeklyPricingRow {
  weeks: number;
  single: number;
  pair: number;
  hotel: number;
  highlight?: boolean;
}

export interface NotIncludedItem {
  label: string;
  amount: number | null;
}

export interface PricingTable {
  schema_version: string;
  effective_from: string;
  currency: string;
  tax_included: boolean;
  plans: PricingPlan[];
  weekly_pricing: WeeklyPricingRow[];
  included: string[];
  not_included: NotIncludedItem[];
  notes: string[];
}

const PLAN_IDS = new Set<PlanId>(['single', 'pair', 'hotel']);

function assertPricingTable(value: unknown): asserts value is PricingTable {
  const table = value as Partial<PricingTable>;
  if (!table || typeof table !== 'object') {
    throw new Error('Invalid balilingual pricing table: expected object');
  }
  if (!Array.isArray(table.plans) || !Array.isArray(table.weekly_pricing)) {
    throw new Error('Invalid balilingual pricing table: missing plans or weekly_pricing');
  }
  const planIds = new Set(table.plans.map((plan) => plan.id));
  for (const planId of PLAN_IDS) {
    if (!planIds.has(planId)) {
      throw new Error(`Invalid balilingual pricing table: missing plan ${planId}`);
    }
  }
  for (const row of table.weekly_pricing) {
    if (!Number.isInteger(row.weeks) || row.weeks < 1) {
      throw new Error('Invalid balilingual pricing table: invalid weeks');
    }
    for (const planId of PLAN_IDS) {
      if (!Number.isInteger(row[planId]) || row[planId] <= 0) {
        throw new Error(`Invalid balilingual pricing table: invalid ${planId} price for ${row.weeks} weeks`);
      }
    }
  }
}

assertPricingTable(pricingData);

export const BALILINGUAL_PRICING_TABLE: PricingTable = pricingData;

export function getRow(table: PricingTable, weeks: number): WeeklyPricingRow | undefined {
  return table.weekly_pricing.find((row) => row.weeks === weeks);
}

export function maxWeeks(table: PricingTable): number {
  return Math.max(...table.weekly_pricing.map((row) => row.weeks));
}
