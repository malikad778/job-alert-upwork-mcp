import { NextApiRequest, NextApiResponse } from "next";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { mcpServer } from "../../../lib/mcp-server";

// Keep active transports in global object to survive hot reloads and cross-route access
if (!(global as any).mcpTransports) {
  (global as any).mcpTransports = new Map();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

  const transport = new SSEServerTransport("/api/mcp/message", res as any);
  
  transport.onclose = () => {
    (global as any).mcpTransports.delete(transport.sessionId);
  };
  
  await mcpServer.connect(transport);
  
  // Save the transport using its session ID so the POST route can access it
  (global as any).mcpTransports.set(transport.sessionId, transport);
}
