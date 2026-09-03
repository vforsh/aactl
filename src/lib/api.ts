import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { cachePath, resolveConfig } from "./config.ts";
import { CliError } from "./errors.ts";
import { ApiResponseSchema, normalize, type Model } from "./models.ts";

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
  fetchedAt: string;
  data: unknown;
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
        return { models: parse(cached.data), source: "cache", fetchedAt: cached.fetchedAt };
      }
    } else if (opts.offline) {
      throw new CliError(`--offline requested but no cache at ${path}`);
    }
  }

  if (!cfg.apiKey) {
    throw new CliError(`no API key. Set AA_API_KEY or run: printf "<key>" | aactl cfg set apiKey -\nGet a free key at https://artificialanalysis.ai/api`);
  }

  const url = `${cfg.endpoint.replace(/\/$/, "")}/data/llms/models`;
  const data = await fetchJson(url, cfg.apiKey, cfg.timeout, cfg.retries, log);
  const fetchedAt = new Date().toISOString();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ fetchedAt, data } satisfies CacheFile));
  log(`fetched ${url}, cached to ${path}`);
  return { models: parse(data), source: "network", fetchedAt };
}

async function readCache(path: string): Promise<CacheFile | null> {
  try {
    await stat(path);
    const c = JSON.parse(await readFile(path, "utf8")) as CacheFile;
    if (typeof c.fetchedAt !== "string" || !("data" in c)) return null;
    return c;
  } catch {
    return null;
  }
}

function parse(data: unknown): Model[] {
  const res = ApiResponseSchema.safeParse(data);
  if (!res.success) throw new CliError(`unexpected API payload: ${res.error.issues[0]?.message ?? "schema mismatch"}`);
  return res.data.data.map(normalize);
}

async function fetchJson(url: string, apiKey: string, timeout: number, retries: number, log: (m: string) => void): Promise<unknown> {
  let lastErr: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { headers: { "x-api-key": apiKey, accept: "application/json" }, signal: ctl.signal });
      if (res.status === 401 || res.status === 403) throw new CliError(`API rejected key (HTTP ${res.status}). Check AA_API_KEY / aactl cfg get apiKey`, 3);
      if (res.status === 429) throw new CliError(`rate limited (HTTP 429). Free tier allows ~1000 requests/day; use cache or wait`, 4);
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
