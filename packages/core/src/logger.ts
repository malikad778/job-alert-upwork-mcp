import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'accessToken', 'refreshToken', 'access_token', 'refresh_token',
      'apiKey', 'api_key', 'secret', 'secretEnc', 'password',
      'authorization', 'headers.authorization',
      '*.private_key', 'credentials.private_key',
      'phoneE164', 'phone_e164', 'to',
    ],
    censor: '[REDACTED]',
  },
});
