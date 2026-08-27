import { db, users, notificationSettings, whatsappConfigs, whatsappRecipients, eq } from '@job-radar/db';
import { WhatsAppClient } from '@job-radar/core/whatsapp';
import { decrypt } from '@job-radar/core/crypto';

async function main() {
  console.log('1. Updating user timezone to Asia/Karachi and disabling quiet hours...');
  await db.update(users).set({ timezone: 'Asia/Karachi' });
  await db.update(notificationSettings).set({ quietHoursEnabled: false });

  console.log('2. Fetching WhatsApp configuration for Adnan Malik...');
  const [user] = await db.select().from(users).where(eq(users.email, 'adnan@jobradar.io'));
  const [waConfig] = await db.select().from(whatsappConfigs).where(eq(whatsappConfigs.userId, user.id));
  const [recipient] = await db.select().from(whatsappRecipients).where(eq(whatsappRecipients.userId, user.id));

  if (!waConfig || !recipient) {
    console.error('WhatsApp config or recipient not found.');
    process.exit(1);
  }

  const token = decrypt(waConfig.accessTokenEnc);
  console.log(`Sending live test WhatsApp message to: ${recipient.phoneE164} (Phone Number ID: ${waConfig.phoneNumberId})...`);

  const client = new WhatsAppClient({
    phoneNumberId: waConfig.phoneNumberId,
    accessToken: token,
    version: 'v21.0',
  });

  const testMsg = `🚀 *Upwork MCP Alert Test*\n\nHello Adnan! Your Upwork MCP WhatsApp notifications are now active.\n\nTimezone: *Asia/Karachi*\nMonitoring: *Active*\nDomain: *https://upwork-mcp.site*`;

  const res = await client.sendText(recipient.phoneE164, testMsg);
  console.log('✅ WhatsApp message dispatched successfully! Message ID:', res.wamid);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Failed to send WhatsApp message:', err);
  process.exit(1);
});
