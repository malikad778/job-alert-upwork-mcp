import { NextApiRequest, NextApiResponse } from "next";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../../lib/mcp-server";

// Keep active transports in global object to survive hot reloads and cross-route access
if (!(global as any).mcpTransports) {
  (global as any).mcpTransports = new Map();
}

let inMemoryClient: any = null;
const pendingRequests = new Map<any, (res: any) => void>();

async function getInMemoryClient() {
  if (inMemoryClient) return inMemoryClient;
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  clientTransport.onmessage = (msg: any) => {
    if (msg.id !== undefined && pendingRequests.has(msg.id)) {
      const resolve = pendingRequests.get(msg.id)!;
      pendingRequests.delete(msg.id);
      resolve(msg);
    }
  };
  await clientTransport.start();
  inMemoryClient = clientTransport;
  return inMemoryClient;
}

async function sendRpc(msg: any): Promise<any> {
  const client = await getInMemoryClient();
  if (msg.id === undefined) {
    await client.send(msg);
    return null;
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(msg.id);
      resolve({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32603, message: "Request timed out" }
      });
    }, 15000);

    pendingRequests.set(msg.id, (res) => {
      clearTimeout(timer);
      resolve(res);
    });

    client.send(msg).catch((err: any) => {
      pendingRequests.delete(msg.id);
      clearTimeout(timer);
      resolve({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32603, message: err?.message || "Internal error" }
      });
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Expose-Headers", "*");
  res.setHeader("Cache-Control", "no-cache, no-transform");

  if (req.method === "OPTIONS" || req.method === "HEAD") {
    return res.status(200).end();
  }

  // Handle POST requests
  if (req.method === "POST") {
    // 1. If this has a sessionId query param, route to existing SSE session
    const sessionId = req.query.sessionId as string;
    if (sessionId) {
      const transport = (global as any).mcpTransports?.get(sessionId);
      if (transport) {
        return await transport.handlePostMessage(req as any, res as any, req.body);
      }
    }

    // 2. Direct JSON-RPC / Streamable HTTP request (Claude Custom Connector probe & calls)
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error" },
          id: null
        });
      }
    }

    if (!body || typeof body !== "object") {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid Request" },
        id: null
      });
    }

    if (Array.isArray(body)) {
      const results = (await Promise.all(body.map((item) => sendRpc(item)))).filter(Boolean);
      return res.status(200).json(results);
    }

    // Notifications (no id)
    if (body.id === undefined) {
      await sendRpc(body);
      return res.status(204).end();
    }

    const response = await sendRpc(body);
    return res.status(200).json(response);
  }

  // Handle GET requests
  if (req.method === "GET") {
    const accept = (req.headers.accept || "").toLowerCase();
    // If opened in a web browser without event-stream
    if (accept.includes("text/html") && !accept.includes("text/event-stream")) {
      return res.status(200).json({
        status: "online",
        server: "bpass-upwork-mcp",
        version: "1.0.0",
        description: "BPass Upwork Proposal Generator MCP Server",
        auth: "None required",
        endpoints: {
          connector: "https://upwork-mcp.site/api/bpass-mcp",
          messages: "https://upwork-mcp.site/api/bpass-mcp/message"
        }
      });
    }

    // SSE connection
    const transport = new SSEServerTransport("/api/bpass-mcp/message", res as any);
    const server = createMcpServer();

    let isClosing = false;
    transport.onclose = async () => {
      if (isClosing) return;
      isClosing = true;
      try {
        (global as any).mcpTransports?.delete(transport.sessionId);
        await server.close();
      } catch {}
    };

    await server.connect(transport);
    (global as any).mcpTransports?.set(transport.sessionId, transport);
    return;
  }

  return res.status(405).send("Method Not Allowed");
}
