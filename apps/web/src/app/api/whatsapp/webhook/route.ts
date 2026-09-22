import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  db,
  jobs,
  matches,
  jobAlerts,
  proposalDrafts,
  aiCredentials,
  upworkProfileSnapshots,
  notificationSettings,
  whatsappConfigs,
  whatsappRecipients,
  getOrCreateNotificationSettings,
  setAutomationPaused,
  countQueuedAlerts,
  countAlertsSentSince,
  eq,
  and,
  desc,
  gte,
  sql,
} from '@job-radar/db';
import {
  WhatsAppClient,
  parseWhatsAppCommand,
  WHATSAPP_HELP_TEXT,
} from '@job-radar/core/whatsapp';
import { generateProposalOnDemand } from '@job-radar/core/ai';
import { decrypt } from '@job-radar/core/crypto';
import { logger } from '@job-radar/core/logger';

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'job_radar_webhook_secret_9988';

/**
 * Meta Webhook Verification (GET)
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    logger.info('Meta WhatsApp Webhook subscription verified successfully.');
    return new NextResponse(challenge, { status: 200 });
  }

  logger.warn({ mode, token }, 'Meta Webhook verification failed.');
  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * Meta Webhook Event Handler (POST)
 * Triggered ONLY when user explicitly replies to a job alert on WhatsApp (§14.8, §14.9).
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const appSecret = process.env.WHATSAPP_APP_SECRET;

    // SEC-02: HMAC-SHA256 signature verification if secret configured
    if (appSecret) {
      const signature = req.headers.get('x-hub-signature-256') ?? '';
      const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');

      if (
        signature.length !== expected.length ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      ) {
        logger.warn({ signature }, 'WhatsApp webhook signature mismatch - rejected.');
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    const body = JSON.parse(rawBody);
    logger.info({ entryCount: body?.entry?.length }, 'Received WhatsApp webhook event.');

    const changes = body?.entry?.[0]?.changes?.[0]?.value;
    const message = changes?.messages?.[0];

    if (!message) {
      // Status update (delivered, read, etc.)
      const statusUpdate = changes?.statuses?.[0];
      if (statusUpdate?.id) {
        const newStatus = statusUpdate.status; // delivered, read, failed
        await db
          .update(jobAlerts)
          .set({
            status: newStatus as any,
            ...(newStatus === 'delivered' ? { deliveredAt: new Date() } : {}),
            ...(newStatus === 'read' ? { readAt: new Date() } : {}),
          })
          .where(eq(jobAlerts.providerMessageId, statusUpdate.id));
      }
      return NextResponse.json({ status: 'ok' });
    }

    const fromNumber = message.from;
    const textBody = (message.text?.body || '').trim();
    const quotedWamid = message.context?.id;
    const cleanInput = textBody.toLowerCase().trim();
    const { command, value: commandValue } = parseWhatsAppCommand(cleanInput);
    const isStopCommand = command === 'stop';
    const isMoreCommand = command === 'start';

    logger.info({ fromNumber, textBody, quotedWamid }, 'Incoming WhatsApp user message.');

    // Find the recipient and user context
    const [recipient] = await db
      .select()
      .from(whatsappRecipients)
      .where(eq(whatsappRecipients.phoneE164, fromNumber.replace('+', '')));

    let userId = recipient?.userId;
    let targetJobId: string | null = null;
    let targetProfileId: string | null = null;

    // 1. Look up job from quoted message wamid
    if (quotedWamid) {
      const [alert] = await db
        .select()
        .from(jobAlerts)
        .where(eq(jobAlerts.providerMessageId, quotedWamid));

      if (alert) {
        targetJobId = alert.jobId;
        targetProfileId = alert.profileId;
        if (!userId) userId = alert.userId;
      }
    }

    // 2. Alternatively check if user typed a job ID or Upwork link (e.g. "proposal ~0219851...")
    if (!targetJobId) {
      const idMatch = textBody.match(/(?:jobs\/~?|job_id=|\b)([0-9]{10,25}|~02[0-9a-zA-Z]+)/);
      if (idMatch && idMatch[1]) {
        targetJobId = idMatch[1];
      }
    }

    // 3. If neither quoted nor explicit ID, find the latest job alert sent to this recipient
    if (!targetJobId && (userId || recipient?.userId)) {
      const targetUserId = userId || recipient?.userId;
      if (targetUserId) {
        const [latestAlert] = await db
          .select()
          .from(jobAlerts)
          .where(eq(jobAlerts.userId, targetUserId))
          .orderBy(sql`${jobAlerts.queuedAt} DESC`)
          .limit(1);

        if (latestAlert) {
          targetJobId = latestAlert.jobId;
          userId = targetUserId;
        }
      }
    }

    // Update recipient lastInboundAt to keep 24h service window active
    if (recipient) {
      await db
        .update(whatsappRecipients)
        .set({ lastInboundAt: new Date() })
        .where(eq(whatsappRecipients.id, recipient.id));
    }

    // Load WhatsApp config for sending reply
    let waConfig: typeof whatsappConfigs.$inferSelect | undefined;
    if (userId) {
      const [cfg] = await db
        .select()
        .from(whatsappConfigs)
        .where(and(eq(whatsappConfigs.userId, userId), eq(whatsappConfigs.isActive, true)));
      waConfig = cfg;
    }

    const phoneNumberId = waConfig?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = waConfig ? decrypt(waConfig.accessTokenEnc) : process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      // Still honour the control command even though we cannot acknowledge it.
      if (userId && (isStopCommand || isMoreCommand)) {
        await setAutomationPaused(userId, isStopCommand, 'whatsapp');
      }
      logger.warn('No active WhatsApp credentials found to reply to webhook.');
      return NextResponse.json({ status: 'ok' });
    }

    const waClient = new WhatsAppClient({
      phoneNumberId,
      accessToken,
      version: waConfig?.graphApiVersion || 'v21.0',
    });

    const isNextCommand = command === 'next';

    // Control commands need a resolved user; without one we cannot scope the
    // write and must not fall back to updating every account.
    if (!userId && (isStopCommand || isMoreCommand || command === 'status' || command === 'rate')) {
      await waClient.sendText(
        fromNumber,
        '⚠️ This number is not linked to an Upwork MCP account yet.\n\nAdd it under *Settings → WhatsApp* at https://upwork-mcp.site and send *help* once linked.',
      );
      return NextResponse.json({ status: 'ok' });
    }

    // Handle STOP command
    if (isStopCommand && userId) {
      await setAutomationPaused(userId, true, 'whatsapp');
      const queued = await countQueuedAlerts(userId);

      await waClient.sendText(
        fromNumber,
        [
          '⏸️ *Automatic Alerts Paused*',
          '',
          `Your queue is preserved${queued > 0 ? ` (*${queued}* job${queued === 1 ? '' : 's'} waiting)` : ''}. Upwork MCP keeps monitoring and holding matches.`,
          '',
          '• *1* - fetch the next queued job now',
          '• *start* - resume automatic alerts',
          '• *status* - check current state',
        ].join('\n'),
      );
      return NextResponse.json({ status: 'ok' });
    }

    // Handle MORE / START command
    if (isMoreCommand && userId) {
      const settings = await setAutomationPaused(userId, false, 'whatsapp');
      const queued = await countQueuedAlerts(userId);

      await waClient.sendText(
        fromNumber,
        [
          '🚀 *Automatic Alerts Resumed*',
          '',
          `Upwork MCP checks the marketplace every 5 minutes and will send you up to *${settings.maxAlertsPerHour}* alert${settings.maxAlertsPerHour === 1 ? '' : 's'} per hour, at least *${settings.minDelaySeconds}s* apart.`,
          queued > 0 ? `\n*${queued}* queued job${queued === 1 ? '' : 's'} will start flowing now.` : '',
          '',
          '• *stop* - pause anytime',
          '• *rate 2* - change the hourly limit',
        ].filter(Boolean).join('\n'),
      );
      return NextResponse.json({ status: 'ok' });
    }

    // Handle STATUS command
    if (command === 'status' && userId) {
      const settings = await getOrCreateNotificationSettings(userId);
      const queued = await countQueuedAlerts(userId);
      const sentLastHour = await countAlertsSentSince(userId, new Date(Date.now() - 60 * 60 * 1000));
      const sentToday = await countAlertsSentSince(userId, new Date(Date.now() - 24 * 60 * 60 * 1000));

      await waClient.sendText(
        fromNumber,
        [
          '📊 *Upwork MCP Status*',
          '',
          `State: ${settings.automationPaused ? '⏸️ *Paused*' : '▶️ *Running*'}`,
          `Queued jobs: *${queued}*`,
          `Sent: *${sentLastHour}* in the last hour, *${sentToday}* in 24h`,
          '',
          `Limit: *${settings.maxAlertsPerHour}*/hour, *${settings.maxAlertsPerDay}*/day`,
          `Spacing: at least *${settings.minDelaySeconds}s* apart`,
          settings.quietHoursEnabled
            ? `Quiet hours: *${settings.quietStart}–${settings.quietEnd}*`
            : 'Quiet hours: off',
          '',
          'Send *help* for the full command list.',
        ].join('\n'),
      );
      return NextResponse.json({ status: 'ok' });
    }

    // Handle RATE command - adjust the hourly cap inline
    if (command === 'rate' && userId) {
      const requested = Math.max(1, Math.min(60, Number(commandValue)));

      if (!Number.isFinite(requested)) {
        await waClient.sendText(fromNumber, '⚠️ Use a number between 1 and 60, e.g. *rate 3*.');
        return NextResponse.json({ status: 'ok' });
      }

      await getOrCreateNotificationSettings(userId);
      await db
        .update(notificationSettings)
        .set({ maxAlertsPerHour: requested, updatedAt: new Date() })
        .where(eq(notificationSettings.userId, userId));

      await waClient.sendText(
        fromNumber,
        `✅ Alert limit set to *${requested}* per hour.\n\nSend *status* to review all pacing settings.`,
      );
      return NextResponse.json({ status: 'ok' });
    }

    // Handle HELP command
    if (command === 'help') {
      await waClient.sendText(fromNumber, WHATSAPP_HELP_TEXT);
      return NextResponse.json({ status: 'ok' });
    }

    // Handle 1 / NEXT command -> Fetch next queued/unhandled high match
    if (isNextCommand && userId) {
      const [queuedAlert] = await db
        .select({
          id: jobAlerts.id,
          jobId: jobAlerts.jobId,
        })
        .from(jobAlerts)
        .where(and(eq(jobAlerts.userId, userId), eq(jobAlerts.status, 'queued')))
        .orderBy(desc(jobAlerts.queuedAt))
        .limit(1);

      if (queuedAlert) {
        targetJobId = queuedAlert.jobId;
        await db
          .update(jobAlerts)
          .set({ status: 'sent', sentAt: new Date() })
          .where(eq(jobAlerts.id, queuedAlert.id));
      } else {
        const recentMatches = await db
          .select({
            jobId: matches.jobId,
            score: matches.score,
          })
          .from(matches)
          .where(and(eq(matches.userId, userId), sql`${matches.score} >= 60`))
          .orderBy(desc(matches.createdAt))
          .limit(10);

        if (recentMatches.length > 0) {
          targetJobId = recentMatches[0].jobId;
        }
      }
    }

    // If targetJobId is present and not a toggle command, generate proposal!
    if (targetJobId && userId) {
      // Dynamically fetch AI credential for this user (§12.5)
      const [activeCred] = await db
        .select()
        .from(aiCredentials)
        .where(and(eq(aiCredentials.userId, userId), eq(aiCredentials.isDefault, true)))
        .limit(1);

      let decryptedKey: string | undefined;
      if (activeCred?.secretEnc) {
        try {
          decryptedKey = decrypt(activeCred.secretEnc);
        } catch (e) {
          logger.error('Failed to decrypt stored AI key in memory.');
        }
      } else {
        // Check daily proposal quota for free platform users (3 proposals/day)
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const [dailyDrafts] = await db
          .select({ count: sql<number>`count(*)` })
          .from(proposalDrafts)
          .where(and(eq(proposalDrafts.userId, userId), gte(proposalDrafts.createdAt, startOfToday)));

        const countToday = Number(dailyDrafts?.count || 0);
        if (countToday >= 10) {
          await waClient.sendText(
            fromNumber,
            '⚠️ *Daily Free AI Limit Reached*\n\nYou have generated 10 AI proposal drafts today. Visit your Dashboard at *https://upwork-mcp.site* for unlimited access!',
          );
          return NextResponse.json({ status: 'ok' });
        }
      }

      const provider: any = activeCred?.provider || 'aws_bedrock';
      const apiKey = decryptedKey || process.env.AWS_SECRET_ACCESS_KEY || '';
      const modelName = activeCred?.defaultModel || process.env.AWS_BEDROCK_MODEL || 'meta.llama3-8b-instruct-v1:0';
      const config = (activeCred?.config as Record<string, string>) || {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        region: process.env.AWS_BEDROCK_REGION || 'ap-south-1',
      };

      // Load job from database
      const [job] = await db.select().from(jobs).where(eq(jobs.id, targetJobId));

      if (!job) {
        await waClient.sendText(fromNumber, `❌ Job \`${targetJobId}\` not found in database.`);
        return NextResponse.json({ status: 'ok' });
      }

      // Load freelancer profile snapshot for this user
      const [snapshot] = await db
        .select()
        .from(upworkProfileSnapshots)
        .where(eq(upworkProfileSnapshots.userId, userId))
        .orderBy(desc(upworkProfileSnapshots.fetchedAt))
        .limit(1);

      const freelancerProfile = {
        title: snapshot?.title || 'Senior Software Engineer & Freelance Specialist',
        overview: snapshot?.overview || 'Experienced developer dedicated to delivering reliable, scalable, and high-performance solutions.',
        skills: (snapshot?.skills as string[]) || (job.skills as string[]) || ['TypeScript', 'JavaScript', 'Python', 'React', 'Node.js'],
        hourlyRate: snapshot?.hourlyRate ? Number(snapshot.hourlyRate) : 45,
        jobSuccessScore: snapshot?.jobSuccessScore ? Number(snapshot.jobSuccessScore) : 100,
      };

      // Generate grounded proposal on-demand (§13)
      const proposal = await generateProposalOnDemand({
        job: {
          id: job.id,
          title: job.title,
          description: job.description,
          url: job.url || `https://www.upwork.com/jobs/${job.id}`,
          jobType: job.jobType as any,
          skills: (job.skills as string[]) || [],
          budgetAmount: job.budgetAmount ? Number(job.budgetAmount) : null,
          hourlyMin: job.hourlyMin ? Number(job.hourlyMin) : null,
          hourlyMax: job.hourlyMax ? Number(job.hourlyMax) : null,
          currency: job.currency || 'USD',
          postedAt: job.postedAt,
          proposalsCount: job.proposalsCount,
          client: {
            rating: job.clientRating ? Number(job.clientRating) : null,
            reviewsCount: job.clientReviewsCount,
            totalSpent: job.clientTotalSpent ? Number(job.clientTotalSpent) : null,
            country: job.clientCountry,
            paymentVerified: job.clientPaymentVerified,
          },
          unmappedFields: [],
          rawPayload: {},
          normalizerVersion: 1,
        },
        freelancer: freelancerProfile,
        preferences: {
          tone: 'professional',
          customInstructions: textBody && textBody.toLowerCase() !== 'proposal' ? textBody : undefined,
        },
        aiProviderConfig: {
          provider: provider as any,
          apiKey,
          modelName,
          config,
        },
      });

      // Format WhatsApp single final proposal reply message
      const cleanTitle = (job.title || '').replace(/<\/?untrusted_participant_content>/gi, '').trim();
      const directApplyUrl = `https://www.upwork.com/ab/proposals/job/${job.id}/apply/`;

      const replyMsg = [
        `━━━━━━━━━━━━━━━━━━━━━━`,
        `*AI PROPOSAL DRAFT*`,
        `Job: *${cleanTitle}*`,
        `━━━━━━━━━━━━━━━━━━━━━━\n`,
        `*Suggested Bid:* $${proposal.suggestedBid.amount} (${proposal.suggestedBid.type})`,
        `*Rationale:* ${proposal.suggestedBid.rationale}\n`,
        `*Cover Letter:*`,
        `${proposal.coverLetter}\n`,
        `*Submit Proposal on Upwork:*`,
        `${directApplyUrl}`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
      ].join('\n');

      // Send single final proposal message directly to user
      await waClient.sendText(fromNumber, replyMsg);
      logger.info({ jobId: targetJobId, fromNumber }, 'Delivered on-demand AI proposal to WhatsApp.');

      // Save proposal draft to DB in safe block
      try {
        await db.insert(proposalDrafts).values({
          userId,
          jobId: job.id,
          credentialId: activeCred?.id || null,
          provider: (provider === 'aws_bedrock' ? 'custom' : provider) as any,
          model: activeCred?.defaultModel || modelName || 'default',
          coverLetter: proposal.coverLetter,
          suggestedBid: String(proposal.suggestedBid.amount),
          bidRationale: proposal.suggestedBid.rationale,
          status: 'ready',
        });
      } catch (dbErr) {
        logger.warn({ dbErr }, 'Failed to record proposal draft history in DB.');
      }
    } else {
      // General bot instructions reply
      await waClient.sendText(fromNumber, WHATSAPP_HELP_TEXT);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err: any) {
    logger.error({ err }, 'Error processing WhatsApp webhook.');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
