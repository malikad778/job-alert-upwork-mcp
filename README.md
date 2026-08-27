# Job Alert Upwork MCP

Job Alert Upwork MCP is an open-source, self-hosted web application that acts as an automated, intelligent agent for the Upwork marketplace. 

Instead of manually refreshing Upwork to find high-quality jobs, this system runs in the background, polls the official **Upwork Model Context Protocol (MCP)** server, scores new jobs against your precise search criteria, and instantly delivers them to your WhatsApp. Optionally, it uses the AI provider of your choice to draft a highly personalized proposal grounded in your real Upwork profile history.

This repository open-sources the complete backend infrastructure: database schema, background workers, matching/scoring logic, MCP + WhatsApp connectors, and the HTTP API.

---

## ⚡ Core Features

### 1. Zero-Scraping Upwork Integration
- Authenticates securely with your own Upwork account via OAuth 2.1 Dynamic Client Registration.
- Communicates exclusively with `mcp.upwork.com/mcp` via the `@modelcontextprotocol/sdk`. 
- **100% TOS Compliant**: No headless browsers, no web scraping, no unauthorized bots.

### 2. Intelligent Search Profiles
- Define multiple profiles with positive/negative keywords, required skills, and specific categories.
- Apply strict quality filters: `minHourlyRate`, `minFixedBudget`, `minClientRating`, `minClientSpent`.
- Exclude jobs from specific countries or with unverified payment methods.
- The matching engine assigns a 0–100 score to every job, only alerting you if the threshold is met.

### 3. Real-Time WhatsApp Delivery (via Meta Cloud API)
- Connects directly to the Meta WhatsApp Cloud API (Graph v21.0).
- Delivers rich alerts including the Job Score, Budget, Client Rating, and a direct link to the AI-generated proposal draft.
- Built-in "Quiet Hours" mode automatically parks alerts during the night and delivers a morning digest.

### 4. AI Proposal Drafting (Vercel AI SDK)
- **Bring Your Own Keys (BYOK)**: Supports Anthropic, OpenAI, Google Gemini/Vertex, OpenRouter, and local Ollama models.
- **Draft-Confirm Execution**: The AI **only** drafts the proposal. It does not spend your Connects. You review the draft and submit it yourself.
- Fetches and caches your own freelancer profile (skills, work history, overview) to fuel highly personalized, non-generic cover letters.

### 5. Multi-User & Admin Capabilities
- **Role-Based Access**: Admins can view platform statistics (Jobs Indexed, Proposals Drafted) and manage users.
- Each user manages their own Upwork connections, Search Profiles, WhatsApp settings, and AI API keys.

---

## 🏗️ Architecture & Technology Stack

This is a modern, TypeScript-native monorepo designed for maximum reliability and ease of self-hosting.

### Stack
- **API & Next.js Host**: Next.js 15 (App Router)
- **Database**: PostgreSQL via [Drizzle ORM](https://orm.drizzle.team/)
- **Background Jobs**: [Trigger.dev v4](https://trigger.dev/) (Durable execution, scheduling, and resilient background polling)
- **Authentication**: [Better Auth](https://better-auth.com/)
- **AI Integration**: Vercel AI SDK v5
- **MCP Client**: Official `@modelcontextprotocol/sdk` (Streamable HTTP)

### The 5 Core Pipelines

The entire system is modeled around five resilient background pipelines running on Trigger.dev:

1. **Pipeline A - Discovery (Cron, every 5 min)**: Wakes up, refreshes the Upwork OAuth token, calls `upwork__find_jobs` via MCP, stores the raw payloads, scores jobs against active profiles, and emits events.
2. **Pipeline B - Enrichment (Event)**: Whenever a new job is discovered, it checks if client history is missing. If so, it calls detailed MCP endpoints like `upwork__get_job_posting` to enrich the database record.
3. **Pipeline C - Notification (Event)**: Takes matched jobs, respects quiet hours, formats the WhatsApp template, and sends it via the Meta Graph API with exponential backoff.
4. **Pipeline D - Proposal Drafting (On-Demand)**: Initiated by the user. Loads the freelancer's profile snapshot + the job + past won proposals, resolves the chosen AI provider, and streams a draft.
5. **Pipeline E - Digest (Cron, Hourly)**: Checks for parked alerts (due to quiet hours) and fires a bundled digest message when the user wakes up.

---

## 🔒 Security & Privacy

1. **Envelope Encryption (BYOK)**: All sensitive credentials (AI provider keys, Upwork tokens, WhatsApp tokens) are encrypted at rest in PostgreSQL using `AES-256-GCM` and a master key. They are completely safe and never logged.
2. **Draft-Confirm Execution**: The system is designed to keep the human in the loop for the final submission to ensure you never accidentally waste Connects or money.
3. **Self-Hosted**: All data, including your proprietary proposals and search strategies, remains on your own server.

---

## 🚀 Setup & Installation

### 1. Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/malikad778/job-alert-upwork-mcp.git
   cd job-alert-upwork-mcp
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and configure your database connection. Generate your security keys:
   ```bash
   cp .env.example .env
   echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env
   echo "ENCRYPTION_MASTER_KEY=$(openssl rand -base64 32)" >> .env
   ```

4. **Run the Database Migrations**:
   Ensure PostgreSQL is running locally or provide a cloud connection string in your `.env`.
   ```bash
   pnpm --filter @job-radar/db db:push
   ```

5. **Start the Development Servers**:
   You need to run the web server and the Trigger.dev background worker.
   ```bash
   pnpm dev
   pnpm dev:jobs # in a separate terminal
   ```

### 2. Setting Up the First Admin

To access the Admin Dashboard and manage the platform, you can manually elevate a user account to the admin role.

1. Register an account on the local server at `http://localhost:3000/register`.
2. Edit `scripts/set-admin.ts` to match the email you just registered.
3. Run the script:
   ```bash
   npx tsx scripts/set-admin.ts
   ```

### 3. WhatsApp Webhook (Local Testing)

To receive WhatsApp messages locally, use a free Cloudflare Tunnel to expose the webhook securely:
```bash
npx cloudflared tunnel --url http://localhost:3000
```
Provide the generated HTTPS URL (`https://<your-tunnel>.trycloudflare.com/api/whatsapp/webhook`) in the Meta Developer Console.

---

## 📄 License
MIT License.
