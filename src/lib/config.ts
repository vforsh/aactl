import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { UsageError } from "./errors.ts";

export const ConfigSchema = z.object({
  apiKey: z.string().min(1).optional(),
  endpoint: z.string().url().optional(),
  timeout: z.number().int().positive().optional(),
  retries: z.number().int().min(0).optional(),
  cacheTtl: z.number().int().min(0).optional(),
});
export type Config = z.infer<typeof ConfigSchema>;
export type ConfigKey = keyof Config;

export const CONFIG_KEYS = Object.keys(ConfigSchema.shape) as ConfigKey[];
export const SECRET_KEYS: ReadonlySet<string> = new Set(["apiKey"]);
export const DEFAULT_ENDPOINT = "https://artificialanalysis.ai/api/v2";
export const DEFAULTS = { endpoint: DEFAULT_ENDPOINT, timeout: 30_000, retries: 2, cacheTtl: 3600 } as const;

const ENV_MAP: Record<ConfigKey, string> = {
  apiKey: "AA_API_KEY",
  endpoint: "AA_ENDPOINT",
  timeout: "AA_TIMEOUT",
  retries: "AA_RETRIES",
  cacheTtl: "AA_CACHE_TTL",
};

export function configPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "aactl", "config.json");
}

export function cachePath(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "aactl", "models.json");
}

export async function readConfigFile(): Promise<Config> {
  try {
    const raw = await readFile(configPath(), "utf8");
    return ConfigSchema.parse(JSON.parse(raw));
  } catch (err: unknown) {
    if (isNotFound(err)) return {};
    throw new UsageError(`invalid config at ${configPath()}: ${(err as Error).message}`);
  }
}

export async function writeConfigFile(cfg: Config): Promise<void> {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(ConfigSchema.parse(cfg), null, 2)}\n`, { mode: 0o600 });
}

export function parseValue(key: string, value: string): Config[ConfigKey] {
  assertKey(key);
  if (key === "timeout" || key === "retries" || key === "cacheTtl") {
    const n = Number(value);
    if (!Number.isInteger(n)) throw new UsageError(`${key} must be an integer, got "${value}"`);
    return n;
  }
  return value;
}

export function assertKey(key: string): asserts key is ConfigKey {
  if (!CONFIG_KEYS.includes(key as ConfigKey)) {
    throw new UsageError(`unknown config key "${key}"; valid keys: ${CONFIG_KEYS.join(", ")}`);
  }
}

/** Effective config: env > file > defaults. */
export async function resolveConfig(): Promise<Required<Omit<Config, "apiKey">> & { apiKey?: string; sources: Record<ConfigKey, "env" | "file" | "default" | "unset"> }> {
  const file = await readConfigFile();
  const sources = {} as Record<ConfigKey, "env" | "file" | "default" | "unset">;
  const pick = <K extends ConfigKey>(key: K): Config[K] | undefined => {
    const env = process.env[ENV_MAP[key]];
    if (env !== undefined && env !== "") {
      sources[key] = "env";
      return parseValue(key, env) as Config[K];
    }
    if (file[key] !== undefined) {
      sources[key] = "file";
      return file[key];
    }
    if (key in DEFAULTS) {
      sources[key] = "default";
      return DEFAULTS[key as keyof typeof DEFAULTS] as Config[K];
    }
    sources[key] = "unset";
    return undefined;
  };
  return {
    apiKey: pick("apiKey"),
    endpoint: pick("endpoint") ?? DEFAULTS.endpoint,
    timeout: pick("timeout") ?? DEFAULTS.timeout,
    retries: pick("retries") ?? DEFAULTS.retries,
    cacheTtl: pick("cacheTtl") ?? DEFAULTS.cacheTtl,
    sources,
  };
}

export function redact(key: string, value: unknown): unknown {
  if (!SECRET_KEYS.has(key) || typeof value !== "string") return value;
  return value.length <= 8 ? "****" : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}
