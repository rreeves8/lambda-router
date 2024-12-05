import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Callback,
  Context,
} from "aws-lambda";
import { CreateRemixOptions, createRequestHandler } from "./remixHandler";

export type RouteHandler<RouterContext extends object> = (
  event: APIGatewayProxyEventV2,
  context: Context & RouterContext,
  callBack: Callback<APIGatewayProxyResultV2<never>>
) => Promise<APIGatewayProxyResultV2>;

export type MiddleWare<RouterContext extends object> = (
  event: APIGatewayProxyEventV2,
  context: Context & RouterContext,
  next: (response?: APIGatewayProxyResultV2) => void
) => Promise<void>;

type Configure<RouterContext extends object> = {
  get: (path: string, handler: RouteHandler<RouterContext>) => void;
  post: (path: string, handler: RouteHandler<RouterContext>) => void;
  remix: <T>(options: CreateRemixOptions) => void;
  use: (handler: MiddleWare<RouterContext>) => void;
  build: () => (
    event: APIGatewayProxyEventV2,
    context: Context,
    callBack: Callback<APIGatewayProxyResultV2<never>>
  ) => Promise<APIGatewayProxyResultV2>;
};

export function lambdaRouter<
  RouterContext extends object
>(): Configure<RouterContext> {
  const handlers = new Map<
    string,
    {
      get?: RouteHandler<RouterContext>;
      post?: RouteHandler<RouterContext>;
      remix?: RouteHandler<RouterContext>;
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
    remix: (options) => {
      handlers.set("remix", {
        remix: createRequestHandler(options),
      });
    },
    use: (handler) => {
      middleware.push(handler);
    },
    build: () => {
      return async (event, context, callBack) => {
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

          const remixHandler = handler.remix;

          if (!remixHandler) {
            return fourOfour;
          }

          return await remixHandler(
            event,
            {
              ...context,
              ...routerContext,
            } as Context & RouterContext,
            callBack
          );
        }

        if (method === "GET") {
          const getHandler = handler.get;
          if (!getHandler) {
            return fourOfour;
          }

          return await getHandler(
            event,
            {
              ...context,
              ...routerContext,
            } as Context & RouterContext,
            callBack
          );
        }
        if (method === "POST") {
          const postHandler = handler.post;
          if (!postHandler) {
            return fourOfour;
          }

          return await postHandler(
            event,
            {
              ...context,
              ...routerContext,
            } as Context & RouterContext,
            callBack
          );
        }

        return fourOfour;
      };
    },
  };
}
