import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { cachePath, resolveConfig } from "./config.ts";
import { CliError } from "./errors.ts";
import { ApiResponseSchema, normalize, type ApiResponse, type Model } from "./models.ts";

const CacheSchema = ApiResponseSchema.omit({ pagination: true }).extend({
  version: z.literal(3),
  fetchedAt: z.iso.datetime(),
  endpoint: z.string(),
});
type CacheFile = z.infer<typeof CacheSchema>;
type Config = Awaited<ReturnType<typeof resolveConfig>>;

export interface FetchOptions {
  refresh?: boolean;
  offline?: boolean;
  log?: (msg: string) => void;
}

export interface Loaded {
  models: Model[];
  source: "cache" | "network";
  fetchedAt: string;
  tier: ApiResponse["tier"];
  intelligenceIndexVersion: number;
}

export function languageModelsUrl(endpoint: string, free = true): string {
  return `${endpoint.replace(/\/$/, "")}/language/models${free ? "/free" : ""}`;
}

export async function loadModels(opts: FetchOptions = {}): Promise<Loaded> {
  const cfg = await resolveConfig();
  const log = opts.log ?? (() => {});
  const path = cachePath();
  const endpoint = cfg.endpoint.replace(/\/$/, "");

  if (!opts.refresh || opts.offline) {
    const cached = await readCache(path, endpoint);
    if (cached) {
      const ageSec = (Date.now() - Date.parse(cached.fetchedAt)) / 1000;
      if (opts.offline || ageSec < cfg.cacheTtl) {
        log(`using cache (${Math.round(ageSec)}s old): ${path}`);
        return loaded(cached, "cache");
      }
    } else if (opts.offline) {
      throw new CliError(`--offline requested but no compatible cache for ${endpoint} at ${path}. Run aactl ls --refresh first`);
    }
  }

  if (!cfg.apiKey) {
    throw new CliError(`no API key. Set AA_API_KEY or run: printf "<key>" | aactl cfg set apiKey -\nGet a free key at https://artificialanalysis.ai/api`);
  }

  // The Free response reports the key's actual tier, including paid keys.
  const freeUrl = languageModelsUrl(endpoint);
  const probe = await fetchPage(freeUrl, 1, cfg, log);
  let url = freeUrl;
  let page = probe;
  if (probe.tier !== "free") {
    url = languageModelsUrl(endpoint, false);
    page = await fetchPage(url, 1, cfg, log);
  }
  const { tier, intelligence_index_version } = page;
  const data = [...page.data];
  while (page.pagination.has_more) {
    const next = page.pagination.page + 1;
    if (next > 50) throw new CliError("API pagination exceeded 50 pages; refusing to cache an incomplete feed");
    page = await fetchPage(url, next, cfg, log);
    if (page.tier !== tier || page.intelligence_index_version !== intelligence_index_version) {
      throw new CliError("API tier or Intelligence Index version changed during pagination; retry with --refresh");
    }
    data.push(...page.data);
  }
  const fetchedAt = new Date().toISOString();
  const cached: CacheFile = { version: 3, endpoint, fetchedAt, tier, intelligence_index_version, data };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cached));
  log(`fetched ${data.length} models from ${url} (${tier}, index v${intelligence_index_version}), cached to ${path}`);
  return loaded(cached, "network");
}

async function fetchPage(url: string, page: number, cfg: Config, log: (m: string) => void): Promise<ApiResponse> {
  const body = await fetchJson(`${url}?page=${page}`, cfg.apiKey!, cfg.timeout, cfg.retries, log);
  const res = ApiResponseSchema.safeParse(body);
  if (!res.success) {
    const issue = res.error.issues[0];
    throw new CliError(`unexpected API payload on page ${page} at ${issue?.path.join(".")}: ${issue?.message ?? "schema mismatch"}`);
  }
  if (res.data.pagination.page !== page) throw new CliError(`API returned page ${res.data.pagination.page} when page ${page} was requested`);
  return res.data;
}

async function readCache(path: string, endpoint: string): Promise<CacheFile | null> {
  try {
    const res = CacheSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return res.success && res.data.endpoint === endpoint ? res.data : null;
  } catch {
    return null;
  }
}

function loaded(cached: CacheFile, source: Loaded["source"]): Loaded {
  return {
    models: cached.data.map(normalize),
    source,
    fetchedAt: cached.fetchedAt,
    tier: cached.tier,
    intelligenceIndexVersion: cached.intelligence_index_version,
  };
}

async function fetchJson(url: string, apiKey: string, timeout: number, retries: number, log: (m: string) => void): Promise<unknown> {
  let lastErr: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { headers: { "x-api-key": apiKey, accept: "application/json" }, signal: ctl.signal });
      if (res.status === 401) throw new CliError(`API rejected key (HTTP 401). Check AA_API_KEY / aactl cfg get apiKey`, 3);
      if (res.status === 403) throw new CliError(`API access denied (HTTP 403) for ${url}. Check the key's organization and API subscription at https://artificialanalysis.ai/api`, 3);
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const retryHint = retryAfter === null ? "the quota resets" : `${retryAfter} seconds`;
        throw new CliError(`rate limited (HTTP 429). Use --offline or retry after ${retryHint}`, 4);
      }
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
