import type { AppLoadContext, ServerBuild } from "@remix-run/node";
import {
  createRequestHandler as createRemixRequestHandler,
  readableStreamToString,
} from "@remix-run/node";
import type {
  APIGatewayProxyEventHeaders,
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from "aws-lambda";
import type { RouteHandler } from "./";

export type GetLoadContextFunction<RouteContext> = (
  event: APIGatewayProxyEventV2,
  context: Context & RouteContext
) => AppLoadContext;

export type CreateRemixOptions<RouteContext> = {
  build: ServerBuild;
  getLoadContext: GetLoadContextFunction<RouteContext>;
  mode?: string;
};

export function createRequestHandler<RouteContext extends object>({
  build,
  getLoadContext,
  mode = process.env.NODE_ENV,
}: CreateRemixOptions<RouteContext>): RouteHandler<RouteContext> {
  let handleRequest = createRemixRequestHandler(build, mode);

  return async (event, context) => {
    const request = createRemixRequest(event);
    const loadContext = getLoadContext(event, context);

    const response = await handleRequest(request, loadContext);

    return sendRemixResponse(response);
  };
}

export function createRemixRequest(event: APIGatewayProxyEventV2): Request {
  let host = event.headers["x-forwarded-host"] || event.headers.host;
  let search = event.rawQueryString.length ? `?${event.rawQueryString}` : "";
  let scheme = process.env.ARC_SANDBOX ? "http" : "https";
  let url = new URL(`${scheme}://${host}${event.rawPath}${search}`);
  let isFormData = event.headers["content-type"]?.includes(
    "multipart/form-data"
  );
  // Note: No current way to abort these for Architect, but our router expects
  // requests to contain a signal, so it can detect aborted requests
  let controller = new AbortController();

  return new Request(url.href, {
    method: event.requestContext.http.method,
    headers: createRemixHeaders(event.headers, event.cookies),
    signal: controller.signal,
    body:
      event.body && event.isBase64Encoded
        ? isFormData
          ? Buffer.from(event.body, "base64")
          : Buffer.from(event.body, "base64").toString()
        : event.body,
  });
}

export function createRemixHeaders(
  requestHeaders: APIGatewayProxyEventHeaders,
  requestCookies?: string[],
  _Headers?: typeof Headers
): Headers {
  // `_Headers` should only be used for unit testing purposes so we can unit test
  // the different behaviors of the @remix-run/web-fetch `Headers` implementation
  // and the node/undici implementation.  See:
  // https://github.com/remix-run/remix/issues/9657
  let HeadersImpl = _Headers || Headers;
  let headers = new HeadersImpl();

  for (let [header, value] of Object.entries(requestHeaders)) {
    if (value) {
      headers.append(header, value);
    }
  }

  if (requestCookies) {
    headers.append("Cookie", requestCookies.join("; "));
  }

  return headers;
}

export async function sendRemixResponse(
  nodeResponse: Response
): Promise<APIGatewayProxyStructuredResultV2> {
  let cookies: string[] = [];

  // Arc/AWS API Gateway will send back set-cookies outside of response headers.
  for (let [key, value] of nodeResponse.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") {
      cookies.push(value);
    }
  }

  if (cookies.length) {
    nodeResponse.headers.delete("Set-Cookie");
  }

  let contentType = nodeResponse.headers.get("Content-Type");
  let isBase64Encoded = isBinaryType(contentType);
  let body: string | undefined;

  if (nodeResponse.body) {
    if (isBase64Encoded) {
      body = await readableStreamToString(nodeResponse.body, "base64");
    } else {
      body = await nodeResponse.text();
    }
  }

  return {
    statusCode: nodeResponse.status,
    headers: Object.fromEntries(nodeResponse.headers.entries()),
    cookies,
    body,
    isBase64Encoded,
  };
}

const binaryTypes = [
  "application/octet-stream",
  // Docs
  "application/epub+zip",
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.amazon.ebook",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Fonts
  "font/otf",
  "font/woff",
  "font/woff2",
  // Images
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/vnd.microsoft.icon",
  "image/webp",
  // Audio
  "audio/3gpp",
  "audio/aac",
  "audio/basic",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-aiff",
  "audio/x-midi",
  "audio/x-wav",
  // Video
  "video/3gpp",
  "video/mp2t",
  "video/mpeg",
  "video/ogg",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  // Archives
  "application/java-archive",
  "application/vnd.apple.installer+xml",
  "application/x-7z-compressed",
  "application/x-apple-diskimage",
  "application/x-bzip",
  "application/x-bzip2",
  "application/x-gzip",
  "application/x-java-archive",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/x-zip",
  "application/zip",
];

export function isBinaryType(contentType: string | null | undefined) {
  if (!contentType) return false;
  let [test] = contentType.split(";");
  return binaryTypes.includes(test);
}
