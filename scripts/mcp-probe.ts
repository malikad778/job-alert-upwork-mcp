import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { extractJsonBlocks } from '../packages/core/src/upwork/parse.ts';

const UPWORK_MCP_URL = process.env.UPWORK_MCP_URL || 'https://mcp.upwork.com/mcp';

// Support reading tokens from env or secrets
const ACCESS_TOKEN = process.env.UPWORK_ACCESS_TOKEN;

async function runProbe() {
  console.log('🔍 Starting Upwork MCP Probe (§10.3)...');
  console.log(`Connecting to: ${UPWORK_MCP_URL}`);

  if (!ACCESS_TOKEN) {
    console.error('❌ UPWORK_ACCESS_TOKEN is required in .env or environment to run probe.');
    process.exit(1);
  }

  const transport = new StreamableHTTPClientTransport(new URL(UPWORK_MCP_URL), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    },
  });

  const client = new Client(
    { name: 'job-radar-probe', version: '1.0.0' },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.log('✅ Connected to Upwork MCP server successfully!\n');

  // Step 1: List all tools
  console.log('📋 Fetching tools list...');
  const toolsResult = await client.listTools();
  const tools = toolsResult.tools || [];
  console.log(`Found ${tools.length} available tools.\n`);

  // Print tool summary table
  console.log('--------------------------------------------------------------------------------');
  console.log('| Tool Name                               | Description (truncated)');
  console.log('--------------------------------------------------------------------------------');
  for (const t of tools) {
    const desc = (t.description || '').replace(/\n/g, ' ').slice(0, 45);
    console.log(`| ${t.name.padEnd(39)} | ${desc}`);
  }
  console.log('--------------------------------------------------------------------------------\n');

  // Ensure docs directories exist
  const mcpDocsDir = path.resolve(process.cwd(), 'docs/mcp');
  const samplesDir = path.resolve(mcpDocsDir, 'samples');
  fs.mkdirSync(samplesDir, { recursive: true });

  // Save tools snapshot
  const snapshotPath = path.join(mcpDocsDir, 'tools.snapshot.json');
  fs.writeFileSync(snapshotPath, JSON.stringify(tools, null, 2), 'utf-8');
  console.log(`💾 Saved tool definitions to ${snapshotPath}`);

  // Calculate fingerprint
  const sortedNames = tools.map((t) => t.name).sort();
  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify({ names: sortedNames, tools }))
    .digest('hex');
  console.log(`🔑 MCP Connector Fingerprint: ${fingerprint}\n`);

  // Step 2: List accounts and get org_uid
  console.log('👤 Calling account listing tool...');
  const accountToolName = tools.find((t) => t.name.includes('account'))?.name || 'upwork__list_accounts';
  let orgUid: string | null = null;

  try {
    const accountsRes = await client.callTool({ name: accountToolName, arguments: {} });
    const blocks = extractJsonBlocks(accountsRes);
    console.log('Account response blocks:', JSON.stringify(blocks, null, 2));

    for (const b of blocks) {
      const accts = (b as any)?.accounts || [];
      const talent = accts.find((a: any) => a.role === 'TALENT') || accts[0];
      if (talent?.org_uid) {
        orgUid = talent.org_uid;
        break;
      }
    }
  } catch (err: any) {
    console.warn(`Could not list accounts with ${accountToolName}:`, err.message);
  }

  // Step 3: Call find_jobs
  const findToolName = tools.find((t) => t.name.includes('find_jobs') || t.name.includes('search'))?.name || 'upwork__find_jobs';
  console.log(`\n🔎 Querying jobs with ${findToolName} (org_uid: ${orgUid || 'none'})...`);

  let sampledJobs: any[] = [];
  try {
    const searchArgs: Record<string, unknown> = {
      action: 'search',
      params: { query: 'laravel OR php OR react', sort: 'recency' },
    };
    if (orgUid) searchArgs.org_uid = orgUid;

    const searchRes = await client.callTool({ name: findToolName, arguments: searchArgs });
    const blocks = extractJsonBlocks(searchRes);

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const sampleFilePath = path.join(samplesDir, `find-jobs-${ts}.json`);
    fs.writeFileSync(sampleFilePath, JSON.stringify(blocks, null, 2), 'utf-8');
    console.log(`💾 Dumped raw search response to ${sampleFilePath}`);

    for (const b of blocks) {
      const found = (b as any)?.jobs || (b as any)?.results || [];
      if (Array.isArray(found)) sampledJobs.push(...found);
    }
  } catch (err: any) {
    console.warn(`Job search call failed:`, err.message);
  }

  console.log(`Retrieved ${sampledJobs.length} sample jobs for field coverage analysis.`);

  // Step 4: Run Field-Frequency Analyzer (§10.3)
  const pathCounts = new Map<string, number>();
  function flatten(obj: any, prefix = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;
      pathCounts.set(full, (pathCounts.get(full) || 0) + 1);
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        flatten(v, full);
      }
    }
  }

  for (const j of sampledJobs) flatten(j);

  const coverageReport = [...pathCounts.entries()]
    .map(([p, count]) => ({
      path: p,
      coverage: sampledJobs.length ? Math.round((count / sampledJobs.length) * 100) : 0,
      count,
    }))
    .sort((a, b) => b.coverage - a.coverage);

  console.log('\n📊 Field Coverage Analysis (Top Fields & Client Data):');
  console.log('------------------------------------------------------------');
  console.log('| Field Path                         | Coverage | Count    |');
  console.log('------------------------------------------------------------');
  for (const row of coverageReport.slice(0, 30)) {
    console.log(`| ${row.path.padEnd(34)} | ${(row.coverage + '%').padEnd(8)} | ${String(row.count).padEnd(8)} |`);
  }
  console.log('------------------------------------------------------------\n');

  // Step 5: Check Detail Tools (§10.4)
  const detailTools = tools.filter(
    (t) =>
      t.name.includes('job') ||
      t.name.includes('detail') ||
      t.name.includes('posting') ||
      (t.description && t.description.toLowerCase().includes('detail')),
  );
  console.log(`Found ${detailTools.length} potential job detail tools:`, detailTools.map((t) => t.name).join(', '));

  // Write FINDINGS.md
  const findingsPath = path.join(mcpDocsDir, 'FINDINGS.md');
  const findingsContent = `# Upwork MCP - Observed Behaviour and Capability Findings

Probe Date: ${new Date().toISOString()}
Connector Fingerprint: \`${fingerprint}\`
Tools Count: ${tools.length}

## Available Tools Summary
\`\`\`json
${JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description })), null, 2)}
\`\`\`

## Field Coverage on Job Search (${sampledJobs.length} jobs sampled)
| Field Path | Coverage % | Sample Count |
|---|---|---|
${coverageReport.map((r) => `| \`${r.path}\` | ${r.coverage}% | ${r.count} |`).join('\n')}

## Client Details Investigation (Gap G3 & §10.4)
- Client Rating in search payload: ${coverageReport.find((r) => r.path.includes('rating'))?.coverage || 0}%
- Client Total Spent in search payload: ${coverageReport.find((r) => r.path.includes('spent'))?.coverage || 0}%
- Client Country in search payload: ${coverageReport.find((r) => r.path.includes('country'))?.coverage || 0}%
`;

  fs.writeFileSync(findingsPath, findingsContent, 'utf-8');
  console.log(`✅ Wrote full findings report to ${findingsPath}`);

  await client.close();
}

runProbe().catch((err) => {
  console.error('❌ Probe execution failed:', err);
  process.exit(1);
});
