import type { Env, RouteMap } from "./types";
import { DEFAULT_ROUTE_MAP } from "./constants";

export function resolveRouteMap(env: Env): RouteMap {
  if (env.ROUTE_MAP) {
    try {
      const parsed = JSON.parse(env.ROUTE_MAP) as unknown;
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        const valid: RouteMap = {};
        for (const [key, val] of Object.entries(
          parsed as Record<string, unknown>,
        )) {
          if (typeof val === "string") valid[key] = val;
        }
        if (Object.keys(valid).length > 0) return valid;
      }
    } catch {
      // Fall through to default
    }
  }
  return DEFAULT_ROUTE_MAP;
}
