export interface Env {
  ROUTE_MAP?: string;
}

export type RouteMap = Record<string, string>;

export interface RequestLogEntry {
  subdomain: string;
  targetUrl: string;
  method: string;
  status: number;
  durationMs: number;
}

export interface ErrorLogEntry {
  errorType:
    | "upstream_failure"
    | "timeout"
    | "misconfiguration"
    | "unmatched_subdomain";
  subdomain: string;
  message: string;
}
