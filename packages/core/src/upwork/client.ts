import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { extractJsonBlocks } from './parse.ts';
import { normalizeJob, type NormalizedJob } from './normalize.ts';

export type UpworkClientConfig = {
  mcpServerUrl?: string;
  accessToken: string;
  orgUid?: string;
  minGapSeconds?: number;
};

export type FindJobsResult = {
  jobs: NormalizedJob[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

export class UpworkRateLimiter {
  private lastCallTime = 0;
  private minGapMs: number;

  constructor(minGapMs: number) {
    this.minGapMs = minGapMs;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.minGapMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minGapMs - elapsed));
    }
    this.lastCallTime = Date.now();
  }
}

export class UpworkMcpClient {
  private client: Client;
  private transport: SSEClientTransport;
  private rateLimiter: UpworkRateLimiter;
  private isConnected = false;
  private config: UpworkClientConfig;

  constructor(config: UpworkClientConfig) {
    this.config = config;
    const url = config.mcpServerUrl || 'https://mcp.upwork.com/mcp';
    this.rateLimiter = new UpworkRateLimiter((config.minGapSeconds ?? 1.5) * 1000);

    this.transport = new SSEClientTransport(new URL(url), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
      },
    });

    this.client = new Client(
      { name: 'job-radar', version: '1.0.0' },
      { capabilities: {} },
    );
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect(this.transport);
      this.isConnected = true;
    }
  }

  async close(): Promise<void> {
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
    }
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown[]> {
    await this.connect();
    await this.rateLimiter.throttle();

    const response = await this.client.callTool({ name, arguments: args });
    return extractJsonBlocks(response as any);
  }

  async resolveOrgUid(): Promise<{ orgUid: string | null; role: string | null; accountName: string | null }> {
    const blocks = await this.callTool('upwork__list_accounts', {});
    for (const b of blocks) {
      const accounts = (b as any)?.accounts;
      if (Array.isArray(accounts) && accounts.length > 0) {
        const talent = accounts.find((a: any) => a.role === 'TALENT') || accounts[0];
        return {
          orgUid: talent.org_uid || null,
          role: talent.role || null,
          accountName: talent.name || null,
        };
      }
    }
    return { orgUid: null, role: null, accountName: null };
  }

  async findJobs(params: {
    query: string;
    orgUid: string;
    cursor?: string;
    sort?: string;
  }): Promise<{ jobs: NormalizedJob[]; nextCursor: string | null; hasNextPage: boolean }> {
    const searchArgs: Record<string, unknown> = {
      action: 'search',
      org_uid: params.orgUid,
      params: {
        query: params.query,
        sort: params.sort || 'recency',
        ...(params.cursor ? { cursor: params.cursor } : {}),
      },
    };

    const blocks = await this.callTool('upwork__find_jobs', searchArgs);

    const rawJobs: any[] = [];
    let nextCursor: string | null = null;
    let hasNextPage = false;

    for (const b of blocks) {
      const data = b as any;
      const found = data.jobs || data.results || [];
      if (Array.isArray(found)) rawJobs.push(...found);

      const pageInfo = data.pageInfo || {};
      hasNextPage = Boolean(pageInfo.hasNextPage || data.hasMore);
      nextCursor = pageInfo.endCursor || data.next_cursor || null;
    }

    const jobs: NormalizedJob[] = [];
    for (const raw of rawJobs) {
      try {
        jobs.push(normalizeJob(raw));
      } catch {
        // Skip unparseable job
      }
    }

    return { jobs, nextCursor, hasNextPage };
  }

  async getJobDetails(jobId: string, orgUid: string): Promise<Record<string, unknown> | null> {
    // 1. Try the freelancer-facing find_jobs detail action first
    try {
      const blocks = await this.callTool('upwork__find_jobs', {
        action: 'get',
        org_uid: orgUid,
        params: { id: jobId },
      });
      for (const b of blocks) {
        const job = (b as any)?.job || (b as any)?.result || b;
        if (job && typeof job === 'object' && Object.keys(job).length > 0) {
          return job as Record<string, unknown>;
        }
      }
    } catch {
      // Fallback below
    }

    // 2. Fallback: marketplace endpoint
    try {
      const blocks2 = await this.callTool('upwork__get_job_posting', {
        action: 'get_marketplace',
        org_uid: orgUid,
        params: { id: jobId },
      });
      for (const b of blocks2) {
        const job = (b as any)?.job || (b as any)?.result || b;
        if (job && typeof job === 'object' && Object.keys(job).length > 0) {
          return job as Record<string, unknown>;
        }
      }
    } catch {
      // Neither tool returned details
    }

    return null;
  }
}
