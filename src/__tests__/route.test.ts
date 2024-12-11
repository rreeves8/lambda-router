import { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { lambdaRouter } from "../";
import { describe, it, vi } from "vitest";

const mw1 = vi.fn();
const mw2 = vi.fn();

const router = lambdaRouter();

router.use(async (event, context, next) => {
  mw1();
  next();
});

router.get("/cool", async (event, context) => {
  return {
    statusCode: 200,
    body: "Hello World",
  };
});

router.use(async (event, context, next) => {
  mw2();
  next();
});

router.all(async (event, context, callback) => {
  return {
    statusCode: 500,
    body: "Hello World",
  };
});

const handler = router.build();

describe("testing router", () => {
  it("should load", async () => {
    const result = await handler(
      {
        requestContext: { http: { method: "get" } },
        rawPath: "/cool",
      } as APIGatewayProxyEventV2,
      {} as Context,
      () => {}
    );

    console.log(result, mw1.mock.calls, mw2.mock.calls);
  });
});
