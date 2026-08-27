/**
 * Upwork MCP Local Token Generator & Authenticator (Node.js version)
 * Run this script to generate or refresh your Upwork MCP tokens.
 *
 * Usage:
 *   node scripts/auth-mcp.js
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { exec } = require('child_process');

const REGISTER_URL = 'https://www.upwork.com/register';
const TOKEN_URL = 'https://www.upwork.com/api/v3/oauth2/token';
const REDIRECT_URI = 'http://localhost:8765/callback';

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function openBrowser(url) {
  const start =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${start} "${url}"`);
}

function httpsPost(urlStr, data, isJson = true) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const body = isJson ? JSON.stringify(data) : new URLSearchParams(data).toString();

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': isJson ? 'application/json' : 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'Upwork-MCP-Local-Auth/1.0',
      },
    };

    const req = https.request(options, (res) => {
      let resBody = '';
      res.on('data', (d) => (resBody += d));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(resBody);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: resBody });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('  Upwork MCP Local Authenticator (Node.js)');
  console.log('='.repeat(60));
  console.log('\n1. Registering dynamic client with Upwork MCP server...');

  const regRes = await httpsPost(REGISTER_URL, {
    client_name: 'Upwork MCP Local Client',
    redirect_uris: [REDIRECT_URI],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  });

  if (regRes.status !== 200 && regRes.status !== 201) {
    console.error('❌ Dynamic client registration failed:', regRes.status, regRes.data);
    process.exit(1);
  }

  const clientId = regRes.data.client_id;
  console.log(`✅ Registered dynamic Client ID: ${clientId}`);

  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = `https://www.upwork.com/ab/account-security/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`;

  console.log('\n2. Starting local server and opening browser...');

  let server;
  const codePromise = new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, 'http://localhost:8765');
      const code = parsedUrl.searchParams.get('code');

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication Successful!</h1><p>You can close this tab and return to your terminal.</p>');
        resolve(code);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication Failed</h1>');
      }
    });

    server.listen(8765, () => {
      openBrowser(authUrl);
      console.log('3. Waiting for authorization on http://localhost:8765/callback ...');
    });
  });

  const authCode = await codePromise;
  server.close();

  console.log('\n4. Exchanging authorization code for tokens...');
  const tokenRes = await httpsPost(
    TOKEN_URL,
    {
      grant_type: 'authorization_code',
      code: authCode,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    },
    false
  );

  if (tokenRes.status !== 200) {
    console.error('❌ Token exchange failed:', tokenRes.status, tokenRes.data);
    process.exit(1);
  }

  const tokens = tokenRes.data;
  console.log('\n' + '='.repeat(60));
  console.log('🎉 SUCCESS! Upwork MCP Tokens Generated:');
  console.log('='.repeat(60));
  console.log(`\nUPWORK_ACCESS_TOKEN:\n${tokens.access_token}\n`);
  if (tokens.refresh_token) {
    console.log(`UPWORK_REFRESH_TOKEN:\n${tokens.refresh_token}\n`);
  }
  console.log('='.repeat(60));
  console.log('👉 Copy and paste the UPWORK_ACCESS_TOKEN into your dashboard at:');
  console.log('   https://upwork-mcp.site/settings/upwork');
  console.log('='.repeat(60));
}

main().catch(console.error);
