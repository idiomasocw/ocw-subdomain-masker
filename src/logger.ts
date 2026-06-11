import type { RequestLogEntry, ErrorLogEntry } from "./types";

export function logRequest(entry: RequestLogEntry): void {
  console.log(JSON.stringify(entry));
}

export function logError(entry: ErrorLogEntry): void {
  console.error(JSON.stringify(entry));
}
