import {
  getActiveProfileName,
  readConfig,
  readProfile,
  type AppConfig,
} from "./config.js";
import type {
  GlobalOptions,
  Profile,
  Region,
  ResolvedAuth,
  RuntimeContext,
} from "./types.js";

interface EndpointConfig {
  readonly baseUrl?: string;
  readonly region?: string;
}

const regionUrls: Record<Region, string> = {
  us: "https://api.secureframe.com",
  uk: "https://api-uk.secureframe.com",
};

export function loadRuntimeContext(options: GlobalOptions): RuntimeContext {
  const profileName = options.profile ?? getActiveProfileName();
  const profile = readProfile(profileName);
  const config = readConfig();
  const endpoint = resolveEndpoint(options, profile, config);
  const region = parseRegion(
    endpoint.region
      ?? inferRegion(endpoint.baseUrl)
      ?? "us",
  );
  const baseUrl = normalizeBaseUrl(endpoint.baseUrl ?? regionUrls[region]);

  return { profileName, profile, baseUrl, region };
}

export function resolveAuth(options: GlobalOptions, context: RuntimeContext): ResolvedAuth {
  if (options.apiKey !== undefined || options.apiSecret !== undefined) {
    return credentials(options.apiKey, options.apiSecret, "command line");
  }

  if (process.env.SECUREFRAME_API_KEY !== undefined || process.env.SECUREFRAME_API_SECRET !== undefined) {
    return credentials(
      process.env.SECUREFRAME_API_KEY,
      process.env.SECUREFRAME_API_SECRET,
      "environment",
    );
  }

  return credentials(
    context.profile?.apiKey,
    context.profile?.apiSecret,
    `profile:${context.profileName ?? "none"}`,
  );
}

export function parseRegion(value: string): Region {
  const normalized = value.toLowerCase();
  if (normalized !== "us" && normalized !== "uk") {
    throw new Error(`Secureframe region "${value}" is invalid. Expected "us" or "uk".`);
  }
  return normalized;
}

function resolveEndpoint(
  options: GlobalOptions,
  profile: Profile | undefined,
  config: AppConfig,
): EndpointConfig {
  if (options.baseUrl !== undefined || options.region !== undefined) {
    return { baseUrl: options.baseUrl, region: options.region };
  }
  if (process.env.SECUREFRAME_BASE_URL !== undefined || process.env.SECUREFRAME_REGION !== undefined) {
    return {
      baseUrl: process.env.SECUREFRAME_BASE_URL,
      region: process.env.SECUREFRAME_REGION,
    };
  }
  if (profile?.baseUrl !== undefined || profile?.region !== undefined) {
    return { baseUrl: profile.baseUrl, region: profile.region };
  }
  return { baseUrl: config.baseUrl, region: config.region };
}

function credentials(
  apiKey: string | undefined,
  apiSecret: string | undefined,
  source: string,
): ResolvedAuth {
  if (!apiKey || !apiSecret) {
    throw new Error(
      "Secureframe credentials are missing. Provide both --api-key and --api-secret, set SECUREFRAME_API_KEY and SECUREFRAME_API_SECRET, or run secureframe setup.",
    );
  }
  return { source, authorization: `${apiKey} ${apiSecret}` };
}

function inferRegion(baseUrl: string | undefined): Region | undefined {
  if (!baseUrl) return undefined;
  try {
    return new URL(baseUrl).hostname === "api-uk.secureframe.com" ? "uk" : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid Secureframe base URL: ${value}`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Secureframe base URL cannot contain credentials, a query string, or a fragment");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("Secureframe base URL must not contain a path");
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Secureframe base URL must use HTTPS unless it is a loopback test server");
  }
  return url.origin;
}
