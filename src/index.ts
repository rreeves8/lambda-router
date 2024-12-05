import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";

export type Routehandler<RouterContext extends object> = (
  event: APIGatewayProxyEventV2,
  context: Context & RouterContext
) => Promise<APIGatewayProxyResultV2>;

export type MiddleWare<RouterContext extends object> = (
  event: APIGatewayProxyEventV2,
  context: Context & RouterContext,
  next: (response?: APIGatewayProxyResultV2) => void
) => Promise<void>;

type SetHandler<RouterContext extends object> = (
  path: string,
  handler: (
    event: APIGatewayProxyEventV2,
    context: Context & RouterContext
  ) => Promise<APIGatewayProxyResultV2>
) => void;

type Configure<RouterContext extends object> = {
  get: SetHandler<RouterContext>;
  post: SetHandler<RouterContext>;
  all: (handler: Routehandler<RouterContext>) => void;
  use: (handler: MiddleWare<RouterContext>) => void;
  build: () => (
    event: APIGatewayProxyEventV2,
    context: Context
  ) => Promise<APIGatewayProxyResultV2>;
};

export function lambdaRouter<
  RouterContext extends object
>(): Configure<RouterContext> {
  const handlers = new Map<
    string,
    {
      get?: Routehandler<RouterContext>;
      post?: Routehandler<RouterContext>;
      all?: Routehandler<RouterContext>;
    }
  >();

  const middleware = new Array<MiddleWare<RouterContext>>();

  return {
    get: (path, handler) => {
      if (handlers.has(path)) {
        handlers.get(path)!.get = handler;
      } else {
        handlers.set(path, {
          get: handler,
        });
      }
    },
    post: (path, handler) => {
      if (handlers.has(path)) {
        handlers.get(path)!.post = handler;
      } else {
        handlers.set(path, {
          post: handler,
        });
      }
    },
    all: (handler) => {
      handlers.set("*", {
        all: handler,
      });
    },
    use: (handler) => {
      middleware.push(handler);
    },
    build: () => {
      return async (event, context) => {
        const routerContext = {} as RouterContext;

        for (const mw of middleware) {
          const result = await new Promise<APIGatewayProxyResultV2 | undefined>(
            (res) => {
              mw(
                event,
                { ...context, ...routerContext } as Context & RouterContext,
                res
              );
            }
          );

          if (result) {
            return result;
          }
        }

        const method = event.requestContext.http.method;
        const path = event.rawPath;

        const handler = handlers.get(path);

        const fourOfour = {
          statusCode: 404,
          body: "Not Found",
        };

        if (!handler) {
          const handler = handlers.get("*");

          if (!handler) {
            return fourOfour;
          }

          return await (handler.all as Routehandler<RouterContext>)(event, {
            ...context,
            ...routerContext,
          } as Context & RouterContext);
        }

        if (method === "GET") {
          const getHandler = handler.get;
          if (!getHandler) {
            return fourOfour;
          }

          return await getHandler(event, {
            ...context,
            ...routerContext,
          } as Context & RouterContext);
        }
        if (method === "POST") {
          const postHandler = handler.post;
          if (!postHandler) {
            return fourOfour;
          }

          return await postHandler(event, {
            ...context,
            ...routerContext,
          } as Context & RouterContext);
        }

        return fourOfour;
      };
    },
  };
}
