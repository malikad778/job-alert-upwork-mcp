# Upwork MCP

Upwork MCP is a self-hosted web application that monitors the Upwork marketplace on your behalf, matches jobs against your highly specific search profiles, and alerts you instantly on WhatsApp with AI-drafted cover letters!

Built natively on the **Upwork Model Context Protocol (MCP)**, it uses official Upwork APIs without web-scraping or TOS violations.

## Architecture & Technology Stack
This is a modern, full-stack application built for maximum reliability and ease of self-hosting.

- **Frontend & API**: [Next.js 15 (App Router)](https://nextjs.org/) + React 19
- **UI & Styling**: Tailwind CSS v4 + shadcn/ui
- **Database**: PostgreSQL (via [Drizzle ORM](https://orm.drizzle.team/))
- **Background Jobs**: [Trigger.dev v4](https://trigger.dev/) (Durable execution & scheduling)
- **AI Integration**: [Vercel AI SDK](https://sdk.vercel.ai/) (Supporting AWS Bedrock, Anthropic, OpenAI, Gemini, etc.)
- **Upwork Connection**: Official `@modelcontextprotocol/sdk` (OAuth 2.1 Dynamic Client Registration)
- **Messaging**: Meta WhatsApp Cloud API (Graph v21.0)

## Security Features
1. **Basic Authentication**: The web dashboard is secured using a Next.js Edge Middleware. Only the webhook paths remain open.
2. **Bring Your Own Keys (BYOK)**: AI credentials are encrypted using `AES-256-GCM` before being stored in PostgreSQL. They are completely safe and never logged.
3. **Draft-Confirm Execution**: To ensure you never accidentally waste Connects or money, the AI *only* drafts proposals. A human must manually click to submit them on the Upwork website.

## Getting Started

### 1. Local Development
1. Clone the repository: `git clone https://github.com/malikad778/job-radar-upwork-mcp.git`
2. Install dependencies: `pnpm install`
3. Copy `.env.example` to `.env` and configure your keys.
4. Run the database migrations: `pnpm --filter @job-radar/db db:push`
5. Start the development server: `pnpm dev`

### 2. WhatsApp Webhook (Local)
To receive WhatsApp messages locally, use a free Cloudflare Tunnel to expose the webhook securely:
```bash
npx cloudflared tunnel --url http://localhost:3000
```
Provide the generated HTTPS URL (`https://<your-tunnel>.trycloudflare.com/api/whatsapp/webhook`) in the Meta Developer Console.

## License
MIT License.
