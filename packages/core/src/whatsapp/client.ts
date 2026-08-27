import { WhatsAppError } from './errors.ts';

export type WhatsAppClientConfig = {
  phoneNumberId: string;
  accessToken: string;
  version?: string;
};

export function normalizeE164(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

export class WhatsAppClient {
  private version: string;
  private cfg: WhatsAppClientConfig;

  constructor(cfg: WhatsAppClientConfig) {
    this.cfg = cfg;
    this.version = cfg.version || 'v21.0';
    if (!cfg.phoneNumberId || !cfg.accessToken) {
      throw new Error('WhatsAppClient requires phoneNumberId and accessToken.');
    }
  }

  private url(): string {
    return `https://graph.facebook.com/${this.version}/${this.cfg.phoneNumberId}/messages`;
  }

  private async postWithRetry(payload: unknown, maxAttempts = 3): Promise<{ wamid: string; raw: any }> {
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(this.url(), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.cfg.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        });

        const json = (await res.json()) as any;
        if (!res.ok) {
          const waErr = WhatsAppError.fromMetaResponse(res.status, json);
          // If 5xx or rate limit, retry
          if ((res.status >= 500 || res.status === 429) && attempt < maxAttempts) {
            const delayMs = attempt * 1500;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
          throw waErr;
        }

        const wamid = json.messages?.[0]?.id || '';
        return { wamid, raw: json };
      } catch (err: any) {
        lastError = err;
        if (err.name === 'WhatsAppError' && !err.shouldRetry) {
          throw err;
        }
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        }
      }
    }

    throw lastError;
  }

  async sendText(to: string, body: string, previewUrl = true): Promise<{ wamid: string; raw: any }> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizeE164(to),
      type: 'text',
      text: { preview_url: previewUrl, body },
    };
    return this.postWithRetry(payload);
  }

  async sendTemplate(
    to: string,
    name: string,
    languageCode = 'en',
    components: unknown[] = [],
  ): Promise<{ wamid: string; raw: any }> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizeE164(to),
      type: 'template',
      template: {
        name,
        language: { code: languageCode },
        components,
      },
    };
    return this.postWithRetry(payload);
  }

  async sendInteractive(
    to: string,
    bodyText: string,
    buttons: { id: string; title: string }[],
  ): Promise<{ wamid: string; raw: any }> {
    const actionButtons = buttons.slice(0, 3).map((b) => ({
      type: 'reply',
      reply: {
        id: b.id,
        title: b.title.slice(0, 20), // Max 20 chars per Meta specification (§14.3)
      },
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizeE164(to),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: { buttons: actionButtons },
      },
    };

    return this.postWithRetry(payload);
  }
}
