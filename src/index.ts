export interface Env {
  ROUTE_MAP?: string;
}

export default {
  async fetch(
    _request: Request,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    return new Response("Not implemented", { status: 501 });
  },
};
