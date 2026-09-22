import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { generateProposalPrompt, generateRepeatDeltaPrompt, generateClientReplyPrompt } from "./bpass-wrapper";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const generateProposalSchema = z.object({
  job_description: z.string().describe("The raw Upwork job posting description"),
  rate: z.string().optional().describe("Rate or fixed price (e.g. $65/hr or $500)"),
  timeframe: z.string().optional().describe("Estimated delivery timeframe (e.g. 2-4 hours)"),
  strategy: z.enum(['phased', 'fast', 'audit']).optional().describe("Work strategy: 'phased' (staged clone verification), 'fast' (rapid MVP triage), 'audit' (diagnostic quarantine first)"),
  category: z.string().optional().describe("Job category (e.g. fullstack, backend, frontend, devops, shopify, wordpress)"),
  seniority: z.enum(['staff', 'senior', 'fast']).optional().describe("Seniority posture: 'staff' (principal systems architect), 'senior', 'fast'"),
  dev_identity: z.string().optional().describe("Developer proof signals (e.g. Top Rated, 100% JSS, AWS Certified)"),
  pricing_model: z.enum(['hourly', 'fixed', 'hybrid']).optional().describe("Pricing model for the proposal"),
  examples: z.string().optional().describe("Past project examples to cite"),
  screening_questions: z.string().optional().describe("Specific screening questions asked by the client"),
  client_profile: z.string().optional().describe("Client history/profile text for intelligence analysis"),
});

const repeatDeltaSchema = z.object({
  new_job_description: z.string().describe("The new job description for the ongoing chat"),
  rate_override: z.string().optional().describe("Optional rate override for this job"),
  strategy_override: z.enum(['phased', 'fast', 'audit']).optional().describe("Optional strategy override for this job"),
  notes: z.string().optional().describe("Any extra notes or specific context for this job"),
});

const clientReplySchema = z.object({
  client_message: z.string().describe("The message received from the client"),
  intent: z.enum(['counter', 'nda', 'scope_creep', 'close', 'interview', 'clarify']).optional().describe("Reply intent: counter-offer, NDA request, scope protection, close contract, interview, or clarify"),
  tone: z.enum(['senior', 'short', 'consultative']).optional().describe("Reply tone: 'senior' (pragmatic, calm), 'short' (2-3 sentences), 'consultative'"),
});

const searchJobsSchema = z.object({
  query: z.string().describe("Keywords to search Upwork marketplace jobs (e.g. 'Next.js React', 'Python AI LLM')"),
  access_token: z.string().optional().describe("Upwork OAuth / MCP access token. If omitted, uses active server connection."),
  org_uid: z.string().optional().describe("Upwork Organization UID. If omitted, automatically resolved from token."),
  sort: z.enum(['recency', 'relevance']).optional().describe("Sort order for search results (default: 'recency')"),
  cursor: z.string().optional().describe("Pagination cursor for next page of results"),
});

const getJobDetailsSchema = z.object({
  job_id: z.string().describe("The Upwork job posting ID or ciphertext (e.g. '~0123456789abcdef')"),
  access_token: z.string().optional().describe("Upwork OAuth / MCP access token. If omitted, uses active server connection."),
  org_uid: z.string().optional().describe("Upwork Organization UID. If omitted, automatically resolved from token."),
});

const getProfileSchema = z.object({
  access_token: z.string().optional().describe("Upwork OAuth / MCP access token. If omitted, uses active server connection."),
  org_uid: z.string().optional().describe("Upwork Organization UID. If omitted, automatically resolved from token."),
});

const listAccountsSchema = z.object({
  access_token: z.string().optional().describe("Upwork OAuth / MCP access token. If omitted, uses active server connection."),
});

async function resolveUpworkCredentials(argsToken?: string, argsOrgUid?: string): Promise<{ accessToken: string; orgUid?: string }> {
  if (argsToken && argsToken.trim()) {
    return { accessToken: argsToken.trim(), orgUid: argsOrgUid?.trim() };
  }

  // Fallback: load from database for any active connection
  try {
    const { db, upworkConnections, eq } = await import('@job-radar/db');
    const { decryptTokens } = await import('@job-radar/core/upwork');
    const [conn] = await db
      .select()
      .from(upworkConnections)
      .where(eq(upworkConnections.isActive, true))
      .limit(1);

    if (conn) {
      const { accessToken } = decryptTokens({
        accessTokenEnc: conn.accessTokenEnc,
        refreshTokenEnc: conn.refreshTokenEnc,
      });
      return { accessToken, orgUid: argsOrgUid?.trim() || conn.orgUid || undefined };
    }
  } catch {}

  throw new Error(
    "No Upwork access token provided. Please supply 'access_token' in tool arguments or connect your Upwork account at https://upwork-mcp.site/settings/upwork"
  );
}

export function createMcpServer() {
  const server = new Server({
    name: "bpass-upwork-mcp",
    version: "1.1.0",
  }, {
    capabilities: {
      tools: {},
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "upwork_search_jobs",
          description: "Search real-time Upwork marketplace jobs by query, skills, or keywords using the official Upwork MCP connector. Returns structured job listings with titles, budgets, descriptions, and client verification details.",
          inputSchema: zodToJsonSchema(searchJobsSchema) as any,
        },
        {
          name: "upwork_get_job_details",
          description: "Fetch full description, client history, payment verification, and budget details for a specific Upwork job by ID.",
          inputSchema: zodToJsonSchema(getJobDetailsSchema) as any,
        },
        {
          name: "upwork_get_profile",
          description: "Fetch connected Upwork freelancer profile information and available Connects balance.",
          inputSchema: zodToJsonSchema(getProfileSchema) as any,
        },
        {
          name: "upwork_list_accounts",
          description: "List all connected Upwork accounts, roles (TALENT vs CLIENT), and organization UIDs.",
          inputSchema: zodToJsonSchema(listAccountsSchema) as any,
        },
        {
          name: "generate_proposal_prompt",
          description: "Generates an engineered, psychologically-calibrated Upwork proposal prompt to be sent to Claude. Follows the BPass method (staging clone guarantee, low-level technical diagnostic, risk isolation, discovery question).",
          inputSchema: zodToJsonSchema(generateProposalSchema) as any,
        },
        {
          name: "repeat_proposal_delta",
          description: "Generates a compact delta update prompt for an ongoing Claude chat session. Sends ONLY the new job and changes so you don't repeat the full prompt in the same chat.",
          inputSchema: zodToJsonSchema(repeatDeltaSchema) as any,
        },
        {
          name: "generate_client_reply",
          description: "Generates an engineered client reply prompt for handling client messages on Upwork (budget counters, NDA requests, scope creep, contract closing).",
          inputSchema: zodToJsonSchema(clientReplySchema) as any,
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments || {}) as any;

    if (request.params.name === "upwork_search_jobs") {
      const { accessToken, orgUid } = await resolveUpworkCredentials(args.access_token, args.org_uid);
      const { UpworkMcpClient } = await import('@job-radar/core/upwork');
      const client = new UpworkMcpClient({ accessToken });

      let effectiveOrgUid = orgUid;
      if (!effectiveOrgUid) {
        const resolved = await client.resolveOrgUid();
        effectiveOrgUid = resolved.orgUid || undefined;
      }

      const result = await client.findJobs({
        query: args.query,
        orgUid: effectiveOrgUid || '',
        cursor: args.cursor,
        sort: args.sort || 'recency',
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query: args.query,
            count: result.jobs.length,
            nextCursor: result.nextCursor,
            hasNextPage: result.hasNextPage,
            jobs: result.jobs,
          }, null, 2),
        }]
      };
    }

    if (request.params.name === "upwork_get_job_details") {
      const { accessToken, orgUid } = await resolveUpworkCredentials(args.access_token, args.org_uid);
      const { UpworkMcpClient } = await import('@job-radar/core/upwork');
      const client = new UpworkMcpClient({ accessToken });

      let effectiveOrgUid = orgUid;
      if (!effectiveOrgUid) {
        const resolved = await client.resolveOrgUid();
        effectiveOrgUid = resolved.orgUid || undefined;
      }

      const details = await client.getJobDetails(args.job_id, effectiveOrgUid || '');
      return {
        content: [{
          type: "text",
          text: details ? JSON.stringify(details, null, 2) : `No details found for job ${args.job_id}`,
        }]
      };
    }

    if (request.params.name === "upwork_get_profile") {
      const { accessToken, orgUid } = await resolveUpworkCredentials(args.access_token, args.org_uid);
      const { UpworkMcpClient } = await import('@job-radar/core/upwork');
      const client = new UpworkMcpClient({ accessToken });

      let effectiveOrgUid = orgUid;
      if (!effectiveOrgUid) {
        const resolved = await client.resolveOrgUid();
        effectiveOrgUid = resolved.orgUid || undefined;
      }

      const profileBlocks = await client.callTool('upwork__get_profile', {
        action: 'get',
        org_uid: effectiveOrgUid || '',
      });

      let connectsBalance: number | null = null;
      try {
        const connectsBlocks = await client.callTool('upwork__get_profile', {
          action: 'connects_balance',
          org_uid: effectiveOrgUid || '',
        });
        for (const b of connectsBlocks) {
          const bal = (b as any)?.balance || (b as any)?.connects;
          if (typeof bal === 'number') connectsBalance = bal;
        }
      } catch {}

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            orgUid: effectiveOrgUid,
            connectsBalance,
            profile: profileBlocks,
          }, null, 2),
        }]
      };
    }

    if (request.params.name === "upwork_list_accounts") {
      const { accessToken } = await resolveUpworkCredentials(args.access_token);
      const { UpworkMcpClient } = await import('@job-radar/core/upwork');
      const client = new UpworkMcpClient({ accessToken });
      const accounts = await client.callTool('upwork__list_accounts', {});

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ accounts }, null, 2),
        }]
      };
    }

    if (request.params.name === "generate_proposal_prompt") {
      const prompt = generateProposalPrompt({
        job: args.job_description,
        category: args.category,
        strategy: args.strategy,
        rate: args.rate,
        time: args.timeframe,
        seniority: args.seniority,
        examples: args.examples,
        devIdentity: args.dev_identity,
        pricingModel: args.pricing_model,
        screening_questions: args.screening_questions,
        client_profile: args.client_profile,
      });

      return {
        content: [{ type: "text", text: prompt }]
      };
    }

    if (request.params.name === "repeat_proposal_delta") {
      const prompt = generateRepeatDeltaPrompt({
        new_job_description: args.new_job_description,
        rate_override: args.rate_override,
        strategy_override: args.strategy_override,
        notes: args.notes,
      });

      return {
        content: [{ type: "text", text: prompt }]
      };
    }

    if (request.params.name === "generate_client_reply") {
      const prompt = generateClientReplyPrompt({
        client_message: args.client_message,
        intent: args.intent,
        tone: args.tone,
      });

      return {
        content: [{ type: "text", text: prompt }]
      };
    }

    throw new Error(`Tool not found: ${request.params.name}`);
  });

  return server;
}

// Fallback singleton
export const mcpServer = createMcpServer();
