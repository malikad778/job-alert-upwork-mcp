import { encrypt, decrypt } from '../crypto/encryption.ts';

export type UpworkOAuthTokens = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: Date;
  tokenType: string;
};

export type UpworkConnectionModel = {
  id: string;
  userId: string;
  accessTokenEnc: string;
  refreshTokenEnc?: string | null;
  expiresAt: Date;
  tokenType: string;
  clientId?: string | null;
  clientSecretEnc?: string | null;
  orgUid?: string | null;
  accountRole?: string | null;
  accountName?: string | null;
  consecutiveFailures: number;
  isActive: boolean;
};

export class UpworkAuthError extends Error {
  constructor(public userId: string, message: string) {
    super(`Upwork authentication failed for user ${userId}: ${message}`);
    this.name = 'UpworkAuthError';
  }
}

export class UpworkNotConnectedError extends Error {
  constructor(public userId: string) {
    super(`No active Upwork connection found for user ${userId}. Please connect your Upwork account.`);
    this.name = 'UpworkNotConnectedError';
  }
}

/**
 * Checks if a token needs refreshing (< 5 minutes remaining)
 */
export function isTokenExpiring(expiresAt: Date, thresholdMs = 5 * 60 * 1000): boolean {
  return expiresAt.getTime() - Date.now() < thresholdMs;
}

/**
 * Encrypts OAuth token set for secure storage in database (§10.2)
 */
export function encryptTokens(tokens: { accessToken: string; refreshToken?: string | null }) {
  return {
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
  };
}

/**
 * Decrypts OAuth token set in-memory for immediate HTTP transport use
 */
export function decryptTokens(connection: { accessTokenEnc: string; refreshTokenEnc?: string | null }): {
  accessToken: string;
  refreshToken: string | null;
} {
  return {
    accessToken: decrypt(connection.accessTokenEnc),
    refreshToken: connection.refreshTokenEnc ? decrypt(connection.refreshTokenEnc) : null,
  };
}

/**
 * Refreshes Upwork OAuth2 tokens using refresh token
 */
export async function refreshUpworkOAuthToken(
  refreshToken: string,
  clientId: string,
  clientSecret?: string | null,
  mcpServerUrl?: string,
): Promise<UpworkOAuthTokens> {
  const tokenEndpoint =
    process.env.UPWORK_TOKEN_ENDPOINT ||
    'https://www.upwork.com/api/v3/oauth2/token';

  const bodyParams = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  if (clientSecret) {
    bodyParams.append('client_secret', clientSecret);
  }

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upwork token refresh failed (HTTP ${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const expiresInSeconds = data.expires_in || 86400;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt,
    tokenType: data.token_type || 'Bearer',
  };
}

/**
 * Exchanges authorization code for Upwork OAuth2 tokens (GAP-01)
 */
export async function exchangeUpworkCode(params: {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string | null;
  redirectUri: string;
  mcpServerUrl?: string;
}): Promise<UpworkOAuthTokens> {
  const tokenEndpoint =
    process.env.UPWORK_TOKEN_ENDPOINT ||
    'https://www.upwork.com/api/v3/oauth2/token';

  const bodyParams = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });

  if (params.clientSecret) {
    bodyParams.append('client_secret', params.clientSecret);
  }

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upwork code exchange failed (HTTP ${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const expiresInSeconds = data.expires_in || 86400;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt,
    tokenType: data.token_type || 'Bearer',
  };
}
