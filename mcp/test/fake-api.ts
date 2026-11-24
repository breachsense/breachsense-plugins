import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeRequest { path: string; query: string; headers: IncomingHttpHeaders }
export interface FakeReply {
  status?: number; json?: unknown; body?: string; contentType?: string;
  headers?: Record<string, string>; hang?: boolean; destroy?: boolean;
}
export interface FakeApi { url: string; calls: FakeRequest[]; close(): Promise<void> }

export async function startFakeApi(handler: (req: FakeRequest) => FakeReply | Promise<FakeReply>): Promise<FakeApi> {
  const calls: FakeRequest[] = [];
  const server = createServer(async (req, res) => {
    const [path, query = ""] = (req.url ?? "/").split("?");
    const r: FakeRequest = { path, query, headers: req.headers };
    calls.push(r);
    const reply = await handler(r);
    if (reply.hang) return;
    if (reply.destroy) { req.socket.destroy(); return; }
    const body = reply.body ?? (reply.json === undefined ? "" : JSON.stringify(reply.json));
    res.writeHead(reply.status ?? 200, { "content-type": reply.contentType ?? "application/json", ...reply.headers });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
