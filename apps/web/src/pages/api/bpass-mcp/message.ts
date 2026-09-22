import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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

  // Handle incoming JSON-RPC POST messages from Claude
  await transport.handlePostMessage(req as any, res as any, req.body);
}
