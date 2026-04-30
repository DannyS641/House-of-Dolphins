import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

type ApiRequest = IncomingMessage & { body?: unknown };
type ApiResponse = ServerResponse & {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) return {};

  return JSON.parse(rawBody) as unknown;
};

const loadApiHandler = async (path: string) => {
  const apiUrl = pathToFileURL(resolve(process.cwd(), path)).href;
  const apiModule = (await import(apiUrl)) as {
    default: (req: ApiRequest, res: ApiResponse) => Promise<void>;
  };
  return apiModule.default;
};

const sendApiError = (res: ServerResponse, error: unknown) => {
  res.statusCode = 500;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      error: error instanceof Error ? error.message : "API route failed.",
    }),
  );
};

const apiDevServer = (): Plugin => ({
  name: "api-dev-server",
  configureServer(server) {
    server.middlewares.use("/api/bookings", async (req, res) => {
      try {
        const handler = await loadApiHandler("api/bookings.js");
        const apiReq = req as ApiRequest;
        apiReq.body = await readBody(req);
        const apiRes = res as ApiResponse;
        apiRes.status = (code: number) => {
          res.statusCode = code;
          return apiRes;
        };
        apiRes.json = (body: unknown) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        await handler(apiReq, apiRes);
      } catch (error) {
        sendApiError(res, error);
      }
    });

    server.middlewares.use("/api/booking-status", async (req, res) => {
      try {
        const handler = await loadApiHandler("api/booking-status.js");
        const apiReq = req as ApiRequest;
        apiReq.body = await readBody(req);
        const apiRes = res as ApiResponse;
        apiRes.status = (code: number) => {
          res.statusCode = code;
          return apiRes;
        };
        apiRes.json = (body: unknown) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        await handler(apiReq, apiRes);
      } catch (error) {
        sendApiError(res, error);
      }
    });
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [react(), apiDevServer()],
  };
});
