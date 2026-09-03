import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { cachePath, resolveConfig } from "./config.ts";
import { CliError } from "./errors.ts";
import { ApiResponseSchema, FreeResponseSchema, mergeFeeds, type FreeModel, type Model } from "./models.ts";

const CACHE_VERSION = 2;

export interface FetchOptions {
  refresh?: boolean;
  offline?: boolean;
  log?: (msg: string) => void;
}

export interface Loaded {
  models: Model[];
  source: "cache" | "network";
  fetchedAt: string;
}

interface CacheFile {
  version: number;
  fetchedAt: string;
  legacy: unknown;
  free: unknown[];
}

export async function loadModels(opts: FetchOptions = {}): Promise<Loaded> {
  const cfg = await resolveConfig();
  const log = opts.log ?? (() => {});
  const path = cachePath();

  if (!opts.refresh) {
    const cached = await readCache(path);
    if (cached) {
      const ageSec = (Date.now() - Date.parse(cached.fetchedAt)) / 1000;
      if (opts.offline || ageSec < cfg.cacheTtl) {
        log(`using cache (${Math.round(ageSec)}s old): ${path}`);
        return { models: parse(cached.legacy, cached.free), source: "cache", fetchedAt: cached.fetchedAt };
      }
    } else if (opts.offline) {
      throw new CliError(`--offline requested but no cache at ${path}`);
    }
  }

  if (!cfg.apiKey) {
    throw new CliError(`no API key. Set AA_API_KEY or run: printf "<key>" | aactl cfg set apiKey -\nGet a free key at https://artificialanalysis.ai/api`);
  }

  const base = cfg.endpoint.replace(/\/$/, "");
  const legacyUrl = `${base}/data/llms/models`;
  const freeUrl = `${base}/language/models/free`;
  const legacy = await fetchJson(legacyUrl, cfg.apiKey, cfg.timeout, cfg.retries, log);
  const free = await fetchFreePages(freeUrl, cfg.apiKey, cfg.timeout, cfg.retries, log);
  const fetchedAt = new Date().toISOString();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ version: CACHE_VERSION, fetchedAt, legacy, free } satisfies CacheFile));
  log(`fetched ${legacyUrl} + ${freeUrl}, cached to ${path}`);
  return { models: parse(legacy, free), source: "network", fetchedAt };
}

/** The free feed is paginated (200/page); follow has_more. */
async function fetchFreePages(url: string, apiKey: string, timeout: number, retries: number, log: (m: string) => void): Promise<unknown[]> {
  const all: unknown[] = [];
  for (let page = 1; page <= 50; page++) {
    const body = await fetchJson(`${url}?page=${page}`, apiKey, timeout, retries, log);
    const res = FreeResponseSchema.safeParse(body);
    if (!res.success) throw new CliError(`unexpected free-tier payload on page ${page}: ${res.error.issues[0]?.message ?? "schema mismatch"}`);
    all.push(...res.data.data);
    if (!res.data.pagination.has_more) break;
  }
  return all;
}

async function readCache(path: string): Promise<CacheFile | null> {
  try {
    await stat(path);
    const c = JSON.parse(await readFile(path, "utf8")) as CacheFile;
    if (c.version !== CACHE_VERSION || typeof c.fetchedAt !== "string" || !("legacy" in c) || !Array.isArray(c.free)) return null;
    return c;
  } catch {
    return null;
  }
}

function parse(legacy: unknown, free: unknown[]): Model[] {
  const res = ApiResponseSchema.safeParse(legacy);
  if (!res.success) throw new CliError(`unexpected API payload: ${res.error.issues[0]?.message ?? "schema mismatch"}`);
  const freeModels: FreeModel[] = [];
  for (const f of free) {
    const r = FreeResponseSchema.shape.data.element.safeParse(f);
    if (r.success) freeModels.push(r.data);
  }
  return mergeFeeds(res.data.data, freeModels);
}

async function fetchJson(url: string, apiKey: string, timeout: number, retries: number, log: (m: string) => void): Promise<unknown> {
  let lastErr: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { headers: { "x-api-key": apiKey, accept: "application/json" }, signal: ctl.signal });
      if (res.status === 401 || res.status === 403) throw new CliError(`API rejected key (HTTP ${res.status}). Check AA_API_KEY / aactl cfg get apiKey`, 3);
      if (res.status === 429) throw new CliError(`rate limited (HTTP 429). Free tier allows 100 requests/day on the language feed; use --offline or wait`, 4);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (err instanceof CliError) throw err;
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) log(`attempt ${attempt + 1} failed (${lastErr.message}), retrying`);
    } finally {
      clearTimeout(t);
    }
  }
  throw new CliError(`request failed after ${retries + 1} attempts: ${lastErr?.message ?? "unknown"}`, 5);
}
