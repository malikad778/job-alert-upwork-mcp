import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    return res.status(400).send("Missing sessionId");
  }

  const transport = (global as any).mcpTransports?.get(sessionId);
  if (!transport) {
    return res.status(404).send("Session not found or disconnected");
  }

  // The MCP SDK SSEServerTransport relies on standard request parsing
  // Next.js automatically parses JSON body. We must pass it explicitly.
  await transport.handlePostMessage(req as any, res as any, req.body);
}
