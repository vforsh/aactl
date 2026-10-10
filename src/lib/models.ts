import { z } from "zod";
import { UsageError } from "./errors.ts";

const num = z.number().nullable().optional();

export const RawModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  release_date: z.string().nullable().optional(),
  model_creator: z.object({ id: z.string(), name: z.string() }).nullable(),
  evaluations: z.record(z.string(), num).default({}),
  pricing: z
    .object({
      price_1m_blended_3_to_1: num,
      price_1m_input_tokens: num,
      price_1m_output_tokens: num,
      price_1m_cache_hit_tokens: num,
      price_1m_cache_write_tokens: num,
    })
    .nullable()
    .optional(),
  performance: z
    .object({
      median_output_tokens_per_second: num,
      median_time_to_first_token_seconds: num,
      median_time_to_first_answer_token_seconds: num,
    })
    .nullable()
    .optional(),
  artificial_analysis_intelligence_index_cost: z
    .object({
      total_cost: num,
      cost_per_task: z.object({ total_cost: num }).nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type RawModel = z.infer<typeof RawModelSchema>;

/** Shared envelope for the supported Free, Pro, and Commercial language feeds. */
export const ApiResponseSchema = z.object({
  tier: z.enum(["free", "pro", "commercial"]),
  intelligence_index_version: z.number(),
  pagination: z.object({ page: z.number().int().positive(), total_pages: z.number().int().nonnegative(), has_more: z.boolean() }),
  data: z.array(RawModelSchema),
});
export type ApiResponse = z.infer<typeof ApiResponseSchema>;

/** Flattened, CLI-friendly view of a model. */
export interface Model {
  slug: string;
  name: string;
  creator: string;
  creatorSlug: string;
  releaseDate: string | null;
  intelligence: number | null;
  coding: number | null;
  math: number | null;
  speed: number | null; // output tokens/s
  ttft: number | null; // seconds
  ttfa: number | null; // seconds to first answer token (incl. reasoning)
  cost: number | null; // blended $/M tokens, 3:1
  costIn: number | null;
  costOut: number | null;
  costTask: number | null; // $ per Intelligence Index task (actual tokens burned)
  value: number | null; // intelligence / costTask
  costIndex: number | null; // $ to run the whole Intelligence Index suite
  cacheHit: number | null; // $/M cached input tokens
  cacheWrite: number | null; // $/M cache write tokens
  agentic: number | null;
  evaluations: Record<string, number | null>;
}

export const METRICS = {
  intelligence: { label: "Intel", higherIsBetter: true, fmt: (v: number) => v.toFixed(1) },
  coding: { label: "Coding", higherIsBetter: true, fmt: (v: number) => v.toFixed(1) },
  math: { label: "Math", higherIsBetter: true, fmt: (v: number) => v.toFixed(1) },
  speed: { label: "Tok/s", higherIsBetter: true, fmt: (v: number) => v.toFixed(0) },
  ttft: { label: "TTFT s", higherIsBetter: false, fmt: (v: number) => v.toFixed(2) },
  ttfa: { label: "TTFA s", higherIsBetter: false, fmt: (v: number) => v.toFixed(1) },
  cost: { label: "$/M", higherIsBetter: false, fmt: (v: number) => fmtPrice(v) },
  costIn: { label: "$/M in", higherIsBetter: false, fmt: (v: number) => fmtPrice(v) },
  costOut: { label: "$/M out", higherIsBetter: false, fmt: (v: number) => fmtPrice(v) },
  costTask: { label: "$/task", higherIsBetter: false, fmt: (v: number) => fmtTask(v) },
  value: { label: "Value", higherIsBetter: true, fmt: (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1)) },
  agentic: { label: "Agentic", higherIsBetter: true, fmt: (v: number) => v.toFixed(1) },
  cacheHit: { label: "$/M cache", higherIsBetter: false, fmt: (v: number) => fmtPrice(v) },
} as const satisfies Record<string, { label: string; higherIsBetter: boolean; fmt: (v: number) => string }>;
export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

export function fmtPrice(v: number): string {
  return v >= 10 ? v.toFixed(1) : v.toFixed(2);
}

export function fmtTask(v: number): string {
  return v >= 1 ? v.toFixed(2) : v.toFixed(3);
}

const n = (v: number | null | undefined): number | null => (typeof v === "number" ? v : null);
/** Upstream sometimes reports 0 for unmeasured speed/latency; 0 is impossible there, so treat it as missing. */
const pos = (v: number | null | undefined): number | null => (typeof v === "number" && v > 0 ? v : null);

export function normalize(raw: RawModel): Model {
  const ev = raw.evaluations ?? {};
  const p = raw.pricing ?? {};
  const performance = raw.performance ?? {};
  const creator = raw.model_creator?.name ?? "Unknown";
  const intelligence = n(ev.artificial_analysis_intelligence_index);
  const costTask = n(raw.artificial_analysis_intelligence_index_cost?.cost_per_task?.total_cost);
  const costIn = n(p.price_1m_input_tokens);
  const costOut = n(p.price_1m_output_tokens);
  // The Free API omits blended pricing; retain the CLI's 3:1 metric locally.
  let cost = n(p.price_1m_blended_3_to_1);
  if (p.price_1m_blended_3_to_1 === undefined && costIn !== null && costOut !== null) {
    cost = (3 * costIn + costOut) / 4;
  }
  return {
    slug: raw.slug,
    name: raw.name,
    creator,
    creatorSlug: creator.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    releaseDate: raw.release_date ?? null,
    intelligence,
    coding: n(ev.artificial_analysis_coding_index),
    math: n(ev.artificial_analysis_math_index),
    speed: pos(performance.median_output_tokens_per_second),
    ttft: pos(performance.median_time_to_first_token_seconds),
    ttfa: pos(performance.median_time_to_first_answer_token_seconds),
    cost,
    costIn,
    costOut,
    costTask,
    value: intelligence !== null && costTask !== null && costTask > 0 ? intelligence / costTask : null,
    costIndex: n(raw.artificial_analysis_intelligence_index_cost?.total_cost),
    cacheHit: n(p.price_1m_cache_hit_tokens),
    cacheWrite: n(p.price_1m_cache_write_tokens),
    agentic: n(ev.artificial_analysis_agentic_index),
    evaluations: Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, n(v)])),
  };
}

export function assertMetric(key: string): asserts key is MetricKey {
  if (!METRIC_KEYS.includes(key as MetricKey)) {
    throw new UsageError(`unknown metric "${key}"; valid: ${METRIC_KEYS.join(", ")}`);
  }
}

export interface SortSpec {
  key: MetricKey;
  desc: boolean;
}

/** "cost", "-cost", "intelligence:asc", "speed:desc". Default direction = "better first". */
export function parseSort(spec: string): SortSpec {
  let s = spec.trim();
  let dir: "asc" | "desc" | undefined;
  if (s.startsWith("-")) {
    s = s.slice(1);
    dir = "asc";
  } else if (s.startsWith("+")) {
    s = s.slice(1);
    dir = "desc";
  }
  const [key, explicit] = s.split(":");
  if (!key) throw new UsageError(`empty sort spec`);
  assertMetric(key);
  if (explicit !== undefined) {
    if (explicit !== "asc" && explicit !== "desc") throw new UsageError(`sort direction must be asc|desc, got "${explicit}"`);
    dir = explicit;
  }
  const betterFirst = METRICS[key].higherIsBetter ? "desc" : "asc";
  const eff = dir ?? betterFirst;
  return { key, desc: eff === "desc" };
}

export function sortModels(models: Model[], sort: SortSpec): Model[] {
  return [...models].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    if (av === null && bv === null) return 0;
    if (av === null) return 1; // nulls last
    if (bv === null) return -1;
    return sort.desc ? bv - av : av - bv;
  });
}

export interface Filter {
  creator?: string[];
  search?: string;
  min?: Partial<Record<MetricKey, number>>;
  max?: Partial<Record<MetricKey, number>>;
  requireAll?: boolean; // drop rows where any of intelligence/speed/cost is null
}

export function filterModels(models: Model[], f: Filter): Model[] {
  const creators = f.creator?.map((c) => c.toLowerCase());
  const q = f.search?.toLowerCase();
  return models.filter((m) => {
    if (creators && !creators.some((c) => m.creatorSlug.toLowerCase() === c || m.creator.toLowerCase().includes(c))) return false;
    if (q && !(m.name.toLowerCase().includes(q) || m.slug.includes(q))) return false;
    for (const [k, v] of Object.entries(f.min ?? {}) as [MetricKey, number][]) {
      const mv = m[k];
      if (mv === null || mv < v) return false;
    }
    for (const [k, v] of Object.entries(f.max ?? {}) as [MetricKey, number][]) {
      const mv = m[k];
      if (mv === null || mv > v) return false;
    }
    if (f.requireAll && (m.intelligence === null || m.speed === null || m.cost === null)) return false;
    return true;
  });
}

/** "key=value" pairs -> partial metric map. */
export function parseBounds(pairs: string[] | undefined): Partial<Record<MetricKey, number>> {
  const out: Partial<Record<MetricKey, number>> = {};
  for (const p of pairs ?? []) {
    const [k, v] = p.split("=");
    if (!k || v === undefined) throw new UsageError(`expected key=value, got "${p}"`);
    assertMetric(k);
    const n = Number(v);
    if (!Number.isFinite(n)) throw new UsageError(`${k} bound must be a number, got "${v}"`);
    out[k] = n;
  }
  return out;
}

/** Extract model slugs from an artificialanalysis.ai URL's models= param. */
export function slugsFromUrl(url: string): string[] {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new UsageError(`invalid URL: ${url}`);
  }
  const raw = u.searchParams.get("models");
  if (!raw) throw new UsageError(`URL has no models= parameter`);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface Resolved {
  found: Model[];
  missing: string[];
}

/**
 * Match by exact slug, then exact name (case-insensitive), then substring.
 * Several substring hits resolve to the base variant when one slug is a prefix
 * of all the others (e.g. "opus-5" -> claude-opus-5, not claude-opus-5-high).
 */
export function resolveModels(models: Model[], queries: string[]): Resolved {
  const found: Model[] = [];
  const missing: string[] = [];
  for (const q of queries) {
    const lq = q.toLowerCase();
    const exact = models.find((m) => m.slug === lq) ?? models.find((m) => m.name.toLowerCase() === lq);
    if (exact) {
      found.push(exact);
      continue;
    }
    const subs = models.filter((m) => m.slug.includes(lq) || m.name.toLowerCase().includes(lq));
    const pick = subs.length === 1 ? subs[0] : baseVariant(subs);
    if (pick) found.push(pick);
    else missing.push(subs.length > 1 ? `${q} (ambiguous: ${subs.slice(0, 5).map((m) => m.slug).join(", ")}${subs.length > 5 ? ", …" : ""})` : q);
  }
  return { found, missing };
}

function baseVariant(candidates: Model[]): Model | undefined {
  const shortest = [...candidates].sort((a, b) => a.slug.length - b.slug.length)[0];
  if (!shortest) return undefined;
  return candidates.every((m) => m.slug === shortest.slug || m.slug.startsWith(`${shortest.slug}-`)) ? shortest : undefined;
}
