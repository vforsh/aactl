import { describe, expect, test } from "bun:test";
import { filterModels, normalize, parseBounds, parseSort, resolveModels, slugsFromUrl, sortModels, type Model, type RawModel } from "../src/lib/models.ts";

const raw = (over: Partial<RawModel> & { slug: string; name: string }): RawModel => ({
  id: over.slug,
  release_date: "2026-01-01",
  model_creator: { id: "c", name: "Acme", slug: "acme" },
  evaluations: { artificial_analysis_intelligence_index: 50, gpqa: 0.9 },
  pricing: { price_1m_blended_3_to_1: 1, price_1m_input_tokens: 0.5, price_1m_output_tokens: 2.5 },
  median_output_tokens_per_second: 100,
  median_time_to_first_token_seconds: 0.5,
  median_time_to_first_answer_token: 5,
  ...over,
});

const models: Model[] = [
  normalize(raw({ slug: "fast-cheap", name: "Fast Cheap", median_output_tokens_per_second: 300, pricing: { price_1m_blended_3_to_1: 0.2, price_1m_input_tokens: 0.1, price_1m_output_tokens: 0.5 } })),
  normalize(raw({ slug: "smart-slow", name: "Smart Slow", evaluations: { artificial_analysis_intelligence_index: 80 }, median_output_tokens_per_second: 40 })),
  normalize(raw({ slug: "no-price", name: "No Price", pricing: null })),
];

describe("normalize", () => {
  test("flattens headline metrics and nulls missing values", () => {
    const m = models[2]!;
    expect(m.cost).toBeNull();
    expect(m.intelligence).toBe(50);
    expect(m.evaluations.gpqa).toBe(0.9);
  });
});

describe("parseSort", () => {
  test("defaults to better-first direction", () => {
    expect(parseSort("cost")).toEqual({ key: "cost", desc: false });
    expect(parseSort("speed")).toEqual({ key: "speed", desc: true });
  });
  test("explicit direction and prefix override", () => {
    expect(parseSort("cost:desc")).toEqual({ key: "cost", desc: true });
    expect(parseSort("-speed")).toEqual({ key: "speed", desc: false });
  });
  test("rejects unknown metric", () => {
    expect(() => parseSort("vibes")).toThrow(/unknown metric/);
  });
});

describe("sortModels", () => {
  test("nulls go last regardless of direction", () => {
    const asc = sortModels(models, parseSort("cost"));
    expect(asc.map((m) => m.slug)).toEqual(["fast-cheap", "smart-slow", "no-price"]);
    const desc = sortModels(models, parseSort("cost:desc"));
    expect(desc.at(-1)?.slug).toBe("no-price");
  });
});

describe("filterModels", () => {
  test("bounds and requireAll", () => {
    expect(filterModels(models, { min: parseBounds(["speed=100"]) }).map((m) => m.slug)).toEqual(["fast-cheap", "no-price"]);
    expect(filterModels(models, { requireAll: true }).length).toBe(2);
    expect(filterModels(models, { creator: ["acme"] }).length).toBe(3);
    expect(filterModels(models, { search: "smart" }).length).toBe(1);
  });
  test("parseBounds validates", () => {
    expect(() => parseBounds(["cost"])).toThrow(/key=value/);
    expect(() => parseBounds(["cost=abc"])).toThrow(/number/);
  });
});

describe("resolveModels", () => {
  test("exact slug, name, unique substring, ambiguity", () => {
    const r = resolveModels(models, ["fast-cheap", "Smart Slow", "price", "s"]);
    expect(r.found.map((m) => m.slug)).toEqual(["fast-cheap", "smart-slow", "no-price"]);
    expect(r.missing[0]).toMatch(/^s \(ambiguous/);
  });
  test("ambiguous substring resolves to base variant when one slug prefixes the rest", () => {
    const variants = [
      normalize(raw({ slug: "claude-opus-5-high", name: "Opus 5 (high)" })),
      normalize(raw({ slug: "claude-opus-5", name: "Opus 5" })),
      normalize(raw({ slug: "claude-opus-5-low", name: "Opus 5 (low)" })),
    ];
    expect(resolveModels(variants, ["opus-5"]).found[0]?.slug).toBe("claude-opus-5");
  });
});

describe("slugsFromUrl", () => {
  test("extracts models param", () => {
    expect(slugsFromUrl("https://artificialanalysis.ai/models?models=a%2Cb%2Cc&cost=x#speed")).toEqual(["a", "b", "c"]);
    expect(() => slugsFromUrl("https://artificialanalysis.ai/models")).toThrow(/models=/);
    expect(() => slugsFromUrl("nope")).toThrow(/invalid URL/);
  });
});
