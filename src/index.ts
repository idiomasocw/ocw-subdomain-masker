import type { Env } from "./types";
import { route } from "./router";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const startTime = performance.now();
    return route(request, env, startTime);
  },
};
