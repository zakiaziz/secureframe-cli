export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
export type Region = "us" | "uk";

export interface UnknownFlag {
  readonly name: string;
  readonly value: string | boolean;
}

export interface ParsedArgs {
  readonly command: string[];
  readonly flags: Record<string, string | boolean | string[]>;
  readonly unknownFlags: UnknownFlag[];
}

export interface Profile {
  readonly apiKey?: string;
  readonly apiSecret?: string;
  readonly region?: Region;
  readonly baseUrl?: string;
}

export interface GlobalOptions {
  readonly profile?: string;
  readonly apiKey?: string;
  readonly apiSecret?: string;
  readonly region?: string;
  readonly baseUrl?: string;
  readonly data?: string;
  readonly set: string[];
  readonly query: string[];
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly all: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

export interface ResolvedAuth {
  readonly source: string;
  readonly authorization: string;
}

export interface RuntimeContext {
  readonly profileName?: string;
  readonly profile?: Profile;
  readonly baseUrl: string;
  readonly region: Region;
}

export interface RequestPlan {
  readonly method: HttpMethod;
  readonly url: string;
  readonly auth: ResolvedAuth;
  readonly headers: Record<string, string>;
  readonly body?: unknown;
}
