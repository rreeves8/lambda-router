import {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Callback,
  Context,
} from "aws-lambda";

export type RouteHandler<RouterContext extends object> = (
  event: APIGatewayProxyEventV2,
  context: Context & RouterContext,
  callBack: Callback<APIGatewayProxyStructuredResultV2>
) => Promise<APIGatewayProxyStructuredResultV2>;

export type MiddleWare<RouterContext extends object> = (
  event: APIGatewayProxyEventV2,
  context: RouterContext,
  next: (response?: APIGatewayProxyStructuredResultV2) => void
) => Promise<void>;

type Configure<RouterContext extends object> = {
  get: (path: string, handler: RouteHandler<RouterContext>) => void;
  post: (path: string, handler: RouteHandler<RouterContext>) => void;
  all: (handler: RouteHandler<RouterContext>) => void;
  use: (handler: MiddleWare<RouterContext>) => void;
  build: () => (
    event: APIGatewayProxyEventV2,
    context: Context,
    callBack: Callback<APIGatewayProxyStructuredResultV2>
  ) => Promise<APIGatewayProxyStructuredResultV2>;
};

export * from "./remixHandler";

export function lambdaRouter<
  RouterContext extends object
>(): Configure<RouterContext> {
  const handlers = new Array<{
    handler: RouteHandler<RouterContext> | MiddleWare<RouterContext>;
    type?: "get" | "post";
    routeName?: string;
  }>();

  return {
    get: (path, handler) => {
      handlers.push({
        handler,
        type: "get",
        routeName: path,
      });
    },
    post: (path, handler) => {
      handlers.push({
        handler,
        type: "post",
        routeName: path,
      });
    },
    all: (handler) => {
      handlers.push({
        handler,
        routeName: "*",
      });
    },
    use: (handler) => {
      handlers.push({ handler });
    },
    build: () => {
      return async (event, context, callBack) => {
        const routerContext = {} as RouterContext;

        const method = event.requestContext.http.method;
        const path = event.rawPath;

        for (const { routeName, handler, type } of handlers) {
          if (!type && !routeName) {
            const result = await new Promise<
              APIGatewayProxyStructuredResultV2 | undefined
            >((res) => {
              (handler as MiddleWare<RouterContext>)(event, routerContext, res);
            });

            if (result) {
              return result;
            }
          }

          if (
            (!type && routeName === "*") ||
            (type === method && path === routeName)
          ) {
            return await (handler as RouteHandler<RouterContext>)(
              event,
              {
                ...context,
                ...routerContext,
              } as Context & RouterContext,
              callBack
            );
          }
        }

        return {
          statusCode: 404,
          body: "Not Found",
        };
      };
    },
  };
}
