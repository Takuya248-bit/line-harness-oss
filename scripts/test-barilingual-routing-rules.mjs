#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const rulesPath =
  process.argv[2] ??
  path.resolve(process.cwd(), "config/barilingual-lstep-notion/routing-rules.v1.json");

function loadRules(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function evalWhen(expr, ctx) {
  const fn = new Function("event", "state", `return (${expr});`);
  return Boolean(fn(ctx.event, ctx.state));
}

function applyEffects(baseState, effects = {}) {
  const next = JSON.parse(JSON.stringify(baseState));
  const counts = next.action_counts ?? {};
  next.action_counts = counts;

  for (const key of effects.increment_counts ?? []) {
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return next;
}

function route(nodeRules, event, state) {
  const matches = (nodeRules.transitions ?? [])
    .filter((t) => evalWhen(t.when, { event, state }))
    .sort((a, b) => a.priority - b.priority);
  if (matches.length === 0) return { to: null, state };
  const hit = matches[0];
  return {
    to: hit.to,
    state: applyEffects(state, hit.effects),
    transition: hit
  };
}

function runCase(rules, tc) {
  const nodeRules = rules.nodes[tc.node];
  if (!nodeRules) {
    return { ok: false, reason: `node not found: ${tc.node}` };
  }
  const initial = {
    action_counts: {},
    ...tc.state
  };
  const res = route(nodeRules, tc.event, initial);
  if (res.to !== tc.expect.to) {
    return {
      ok: false,
      reason: `expected to=${tc.expect.to}, got=${res.to}`
    };
  }
  const deltaSpec = tc.expect.count_delta ?? {};
  for (const [k, delta] of Object.entries(deltaSpec)) {
    const before = initial.action_counts?.[k] ?? 0;
    const after = res.state.action_counts?.[k] ?? 0;
    if (after - before !== delta) {
      return {
        ok: false,
        reason: `count delta mismatch for ${k}: expected ${delta}, got ${after - before}`
      };
    }
  }
  return { ok: true };
}

const rules = loadRules(rulesPath);
const cases = rules.test_cases ?? [];

let failed = 0;
for (const tc of cases) {
  const result = runCase(rules, tc);
  if (result.ok) {
    console.log(`PASS: ${tc.name}`);
  } else {
    failed++;
    console.log(`FAIL: ${tc.name} :: ${result.reason}`);
  }
}

console.log(
  JSON.stringify(
    {
      schema_version: rules.schema_version,
      cases: cases.length,
      failed,
      pass: failed === 0
    },
    null,
    2
  )
);

process.exit(failed === 0 ? 0 : 1);
