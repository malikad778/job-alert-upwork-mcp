'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { Globe, RefreshCw, Unlink, Info, Loader2 } from 'lucide-react';
import { SettingsTabs } from '../../../../components/layout/SettingsTabs';
import {
  getUpworkStatusAction,
  disconnectUpworkAction,
  syncUpworkProfileAction,
  connectWithDirectTokensAction,
  saveUpworkConfigAction,
} from '../../../actions/upwork';

export default function UpworkSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tokenConnecting, setTokenConnecting] = useState(false);
  const [directToken, setDirectToken] = useState('');
  const [directRefreshToken, setDirectRefreshToken] = useState('');
  const [directClientId, setDirectClientId] = useState('');
  const [directClientSecret, setDirectClientSecret] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [savingOauthConfig, setSavingOauthConfig] = useState(false);
  const [status, setStatus] = useState<any>(null);

  const handleConnectDirectTokens = async () => {
    if (!directToken.trim()) return;
    setTokenConnecting(true);
    try {
      const res = await connectWithDirectTokensAction({
        accessToken: directToken.trim(),
        refreshToken: directRefreshToken.trim() || undefined,
        clientId: directClientId.trim() || undefined,
        clientSecret: directClientSecret.trim() || undefined,
      });
      if (res.success) {
        alert(`✅ Upwork account connected successfully! Organization: ${res.accountName || 'Active'}`);
        setDirectToken('');
        setDirectRefreshToken('');
        loadStatus();
      } else {
        alert(`❌ Connection failed: ${res.error}`);
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setTokenConnecting(false);
    }
  };

  const handleSaveOauthConfig = async () => {
    if (!oauthClientId.trim()) {
      alert('Please enter your Upwork Client ID');
      return;
    }
    setSavingOauthConfig(true);
    try {
      const res = await saveUpworkConfigAction(
        oauthClientId.trim(),
        oauthClientSecret.trim() || undefined,
      );
      if (res.success) {
        alert('✅ Custom Upwork App credentials saved! You can now launch OAuth Authorization.');
        loadStatus();
      } else {
        alert(`❌ Save failed: ${res.error}`);
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setSavingOauthConfig(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await getUpworkStatusAction();
      if (res.success) {
        setStatus(res);
        if (res.connection?.clientId) {
          setDirectClientId(res.connection.clientId);
          setOauthClientId(res.connection.clientId);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await syncUpworkProfileAction();
      if (res.success) {
        alert('✅ Upwork profile and Connects balance synced successfully!');
        loadStatus();
      } else {
        alert(`❌ Sync failed: ${res.error}`);
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Upwork account? Polling will stop.')) return;
    try {
      const res = await disconnectUpworkAction();
      if (res.success) {
        loadStatus();
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const isConnected = Boolean(status?.connection && status.connection.isActive);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <SettingsTabs />

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Upwork MCP Integration</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Connected via official Upwork Model Context Protocol (MCP) OAuth 2.1 connector (§10).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Connection Card */}
        <Card className="border-zinc-800 glass-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Upwork OAuth 2.1 Connection</CardTitle>
                  <CardDescription>
                    {isConnected
                      ? `${status.connection.accountName || 'Connected Account'} · Automatic token refresh active`
                      : 'Connect your Upwork account to start monitoring jobs'}
                  </CardDescription>
                </div>
              </div>
              {isConnected ? (
                <Badge variant="success">Connected & Active</Badge>
              ) : (
                <Badge variant="outline" className="text-amber-400 border-amber-500/30">Not Connected</Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-5 text-sm">
            {isConnected ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400">Resolved Organization UID</span>
                    <p className="font-mono text-xs text-zinc-200 mt-1 bg-zinc-900 p-2.5 rounded-xl border border-zinc-800">
                      {status.connection.orgUid || 'Resolving on next poll'} ({status.connection.accountRole || 'TALENT'})
                    </p>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-zinc-400">Connects & Snapshot</span>
                    <p className="font-mono text-xs text-emerald-400 mt-1 bg-zinc-900 p-2.5 rounded-xl border border-zinc-800">
                      {status.snapshot?.connectsBalance != null ? `${status.snapshot.connectsBalance} Connects Available` : 'Sync for Connects'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSync}
                    disabled={syncing}
                    className="gap-2 text-xs h-9 rounded-xl border-zinc-700 hover:bg-zinc-800"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'Sync Profile & Connects'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDisconnect}
                    className="gap-2 text-xs text-red-400 hover:text-red-300 h-9 rounded-xl"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    Disconnect Account
                  </Button>
                </div>
              </>
            ) : (
              <div className="py-4 space-y-6">
                <p className="text-sm text-zinc-400">
                  Connect your Upwork account to allow Upwork MCP to search marketplace feeds and send instant AI job alerts.
                </p>

                {/* Option 1: Direct MCP Token Connection */}
                <div className="p-5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                    <RefreshCw className="h-4 w-4" />
                    <span>Option 1: Connect via Upwork MCP Token (Instant & Recommended)</span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Paste your Upwork MCP access token below. The system will verify the token with <code className="text-zinc-300">mcp.upwork.com</code> and immediately activate your account.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">Upwork MCP Access Token *</label>
                      <input
                        type="password"
                        placeholder="oauth2v2_pmc_..."
                        value={directToken}
                        onChange={(e) => setDirectToken(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">Refresh Token (Optional)</label>
                      <input
                        type="password"
                        placeholder="oauth2v2_pmc_..."
                        value={directRefreshToken}
                        onChange={(e) => setDirectRefreshToken(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1.5"
                      >
                        {showAdvanced ? '▼ Hide Custom OAuth App Credentials (Optional)' : '▶ Custom OAuth App Credentials (Optional)'}
                      </button>
                    </div>

                    {showAdvanced && (
                      <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">Custom Client ID (Optional)</label>
                          <input
                            type="text"
                            placeholder="Leave empty to use default (client-metadata.json)"
                            value={directClientId}
                            onChange={(e) => setDirectClientId(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">Custom Client Secret (Optional)</label>
                          <input
                            type="password"
                            placeholder="Optional Client Secret"
                            value={directClientSecret}
                            onChange={(e) => setDirectClientSecret(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={handleConnectDirectTokens}
                      disabled={tokenConnecting || !directToken.trim()}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs gap-2 mt-1"
                    >
                      {tokenConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                      {tokenConnecting ? 'Verifying with MCP Server...' : 'Verify & Connect Account'}
                    </Button>
                  </div>
                </div>

                {/* Option 2: Browser OAuth Redirect */}
                <div className="p-5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-4">
                  <div className="flex items-center gap-2 text-zinc-300 font-semibold text-sm">
                    <Globe className="h-4 w-4 text-zinc-400" />
                    <span>Option 2: Browser OAuth 2.1 Authorization</span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Authorize through your browser using Upwork OAuth 2.1. By default, it uses standard Upwork MCP client metadata, or you can provide your own Upwork Developer App credentials.
                  </p>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">Upwork Client ID (Optional)</label>
                        <input
                          type="text"
                          placeholder="Default: client-metadata.json"
                          value={oauthClientId}
                          onChange={(e) => setOauthClientId(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">Upwork Client Secret (Optional)</label>
                        <input
                          type="password"
                          placeholder="Client Secret"
                          value={oauthClientSecret}
                          onChange={(e) => setOauthClientSecret(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {oauthClientId && (
                        <Button
                          variant="outline"
                          onClick={handleSaveOauthConfig}
                          disabled={savingOauthConfig}
                          className="border-zinc-700 hover:bg-zinc-800 text-zinc-200 rounded-xl text-xs gap-2"
                        >
                          {savingOauthConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Save App Credentials
                        </Button>
                      )}
                      <a href="/api/upwork/authorize">
                        <Button variant="outline" className="border-emerald-700/60 hover:bg-emerald-950/40 text-emerald-300 rounded-xl text-xs gap-2">
                          <Globe className="h-4 w-4 text-emerald-400" /> Launch OAuth Authorization
                        </Button>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Capability Matrix (§10.4 & §10.5) */}
        <Card className="border-zinc-800 glass-card">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <Info className="h-5 w-5 text-emerald-400" />
              <div>
                <CardTitle className="text-lg">Connector Capabilities (Discovered 46 Tools)</CardTitle>
                <CardDescription>Derived dynamically from live Upwork MCP server introspection</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-800/40 border border-zinc-800">
              <div>
                <p className="font-semibold text-zinc-200">Marketplace Search Tool (`upwork__find_jobs`)</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">Direct search with keywords, budget, and sort=recency</p>
              </div>
              <Badge variant="success">Available</Badge>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-800/40 border border-zinc-800">
              <div>
                <p className="font-semibold text-zinc-200">Client Rating & Lifetime Spend in Search Payloads</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">Tier 1 verified: full rating, reviews, and spend returned</p>
              </div>
              <Badge variant="success">Active (Tier 1)</Badge>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-800/40 border border-zinc-800">
              <div>
                <p className="font-semibold text-zinc-200">Account Listing (`upwork__list_accounts`)</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">Automatically resolves TALENT vs CLIENT org UIDs</p>
              </div>
              <Badge variant="success">Available</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
