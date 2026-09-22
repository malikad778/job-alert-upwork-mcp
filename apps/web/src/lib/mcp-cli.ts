import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpServer } from "./mcp-server.js";

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("Upwork BPass MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
