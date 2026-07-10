// The shape every server/routes/** handler module conforms to: named exports
// for the HTTP methods it serves, each a handler taking the Request plus the
// params extracted from bracket segments — exactly the expo API-route signature
// (`(request: Request, params: Record<string, string>) => Response | Promise<...>`),
// so moving a handler behind the catch-all needs no code change to the handler.

export type ApiHandler = (
  request: Request,
  params: Record<string, string>
) => Response | Promise<Response>;

/** HTTP methods any moved handler may export. Matches the set used across routes. */
export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type RouteModule = Partial<Record<HttpMethod, ApiHandler>>;
