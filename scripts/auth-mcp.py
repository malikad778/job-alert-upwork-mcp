"""
Upwork MCP Local Token Generator & Authenticator
Run this script on your laptop to generate or refresh your Upwork MCP tokens.

Usage:
    python scripts/auth-mcp.py
"""

import asyncio
import json
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import httpx
import secrets
import hashlib
import base64

UPWORK_MCP_URL = "https://mcp.upwork.com/mcp"
REGISTER_URL = "https://www.upwork.com/register"
TOKEN_URL = "https://www.upwork.com/api/v3/oauth2/token"
REDIRECT_URI = "http://localhost:8765/callback"

auth_code = None

class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        query = parse_qs(urlparse(self.path).query)
        if "code" in query:
            auth_code = query["code"][0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Authentication Successful!</h1><p>You can close this tab and return to your terminal.</p>")
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"<h1>Authentication Failed</h1>")

    def log_message(self, format, *args):
        pass

def generate_pkce():
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b'=').decode('utf-8')
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode('utf-8')).digest()).rstrip(b'=').decode('utf-8')
    return verifier, challenge

async def main():
    print("=" * 60)
    print("  Upwork MCP Local Authenticator")
    print("=" * 60)
    print("\n1. Dynamically registering client with Upwork MCP server...")
    
    async with httpx.AsyncClient() as client:
        reg_res = await client.post(REGISTER_URL, json={
            "client_name": "Upwork MCP Local Client",
            "redirect_uris": [REDIRECT_URI],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
        })
        
        if reg_res.status_code not in (200, 201):
            print(f"❌ Dynamic client registration failed: {reg_res.status_code} {reg_res.text}")
            return
            
        client_data = reg_res.json()
        client_id = client_data["client_id"]
        print(f"✅ Registered dynamic Client ID: {client_id}")

        verifier, challenge = generate_pkce()
        state = secrets.token_urlsafe(16)

        auth_url = (
            f"https://www.upwork.com/ab/account-security/oauth2/authorize"
            f"?response_type=code&client_id={client_id}&redirect_uri={REDIRECT_URI}"
            f"&code_challenge={challenge}&code_challenge_method=S256&state={state}"
        )

        print("\n2. Opening Upwork Authorization in your browser...")
        webbrowser.open(auth_url)

        print("3. Waiting for authorization callback on http://localhost:8765/callback ...")
        server = HTTPServer(("localhost", 8765), CallbackHandler)
        server.handle_request()

        if not auth_code:
            print("❌ Did not receive authorization code.")
            return

        print("\n4. Exchanging authorization code for tokens...")
        token_res = await client.post(TOKEN_URL, data={
            "grant_type": "authorization_code",
            "code": auth_code,
            "client_id": client_id,
            "redirect_uri": REDIRECT_URI,
            "code_verifier": verifier,
        })

        if token_res.status_code != 200:
            print(f"❌ Token exchange failed: {token_res.status_code} {token_res.text}")
            return

        tokens = token_res.json()
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")

        print("\n" + "=" * 60)
        print("🎉 SUCCESS! Upwork MCP Tokens Generated:")
        print("=" * 60)
        print(f"\nUPWORK_ACCESS_TOKEN:\n{access_token}\n")
        if refresh_token:
            print(f"UPWORK_REFRESH_TOKEN:\n{refresh_token}\n")
        print("=" * 60)
        print("👉 Copy and paste this Access Token into your dashboard at:")
        print("   https://upwork-mcp.site/settings/upwork")
        print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
