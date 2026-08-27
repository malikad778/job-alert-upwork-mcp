export type MetaErrorMapping = {
  code: number | string;
  userMessage: string;
  autoAction: 'mark_expired' | 'stop_sending' | 'highlight_field' | 'mark_inactive' | 'resend_template' | 'backoff' | 'none';
  shouldRetry: boolean;
};

export const META_ERROR_LOOKUP: Record<string, MetaErrorMapping> = {
  '0': {
    code: 0,
    userMessage: 'Your WhatsApp access token expired. Generate a permanent System User token.',
    autoAction: 'mark_expired',
    shouldRetry: false,
  },
  '190': {
    code: 190,
    userMessage: 'Your WhatsApp access token expired. Generate a permanent System User token.',
    autoAction: 'mark_expired',
    shouldRetry: false,
  },
  '3': {
    code: 3,
    userMessage: 'The app lacks whatsapp_business_messaging permission.',
    autoAction: 'stop_sending',
    shouldRetry: false,
  },
  '10': {
    code: 10,
    userMessage: 'The app lacks whatsapp_business_messaging permission.',
    autoAction: 'stop_sending',
    shouldRetry: false,
  },
  '100': {
    code: 100,
    userMessage: 'One of the WhatsApp settings is invalid - usually the Phone Number ID.',
    autoAction: 'highlight_field',
    shouldRetry: false,
  },
  '131008': {
    code: 131008,
    userMessage: 'Required parameter missing in WhatsApp message payload.',
    autoAction: 'none',
    shouldRetry: false,
  },
  '131026': {
    code: 131026,
    userMessage: "That number can't receive WhatsApp messages, or hasn't accepted the test invite.",
    autoAction: 'mark_inactive',
    shouldRetry: false,
  },
  '131047': {
    code: 131047,
    userMessage: 'Outside 24-hour customer service window.',
    autoAction: 'resend_template',
    shouldRetry: false,
  },
  '131049': {
    code: 131049,
    userMessage: 'WhatsApp is limiting delivery temporarily.',
    autoAction: 'backoff',
    shouldRetry: true,
  },
  '80007': {
    code: 80007,
    userMessage: 'Sending too fast - alerts are being spaced out.',
    autoAction: 'backoff',
    shouldRetry: true,
  },
  '130429': {
    code: 130429,
    userMessage: 'Sending too fast - alerts are being spaced out.',
    autoAction: 'backoff',
    shouldRetry: true,
  },
};

export class WhatsAppError extends Error {
  public statusCode: number;
  public metaCode: string | number;
  public userMessage: string;
  public raw: unknown;

  constructor(
    statusCode: number,
    metaCode: string | number,
    userMessage: string,
    raw: unknown,
  ) {
    super(`WhatsApp API error (${statusCode}/${metaCode}): ${userMessage}`);
    this.name = 'WhatsAppError';
    this.statusCode = statusCode;
    this.metaCode = metaCode;
    this.userMessage = userMessage;
    this.raw = raw;
  }

  static fromMetaResponse(status: number, json: any): WhatsAppError {
    const err = json?.error || {};
    const code = String(err.code || err.error_subcode || status);
    const mapping = META_ERROR_LOOKUP[code];
    const userMessage = mapping?.userMessage || err.message || 'WhatsApp Cloud API communication failed.';
    return new WhatsAppError(status, code, userMessage, json);
  }
}
