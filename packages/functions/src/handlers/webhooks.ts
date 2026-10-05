import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { timingSafeEqual } from 'node:crypto';
import { CREDIT_PACKS, type TierId } from '@potluck/core';
import { handleInbound, type InboundMedia } from '../lib/bot.js';
import { sendTelegram, downloadTelegramFile, type TelegramUpdate } from '../lib/channels/telegram.js';
import { downloadWhatsAppMedia, sendWhatsApp, verifyWhatsAppSignature, type WhatsAppWebhook } from '../lib/channels/whatsapp.js';
import { Router, buildCtx, dispatch, json, type Ctx } from '../lib/http.js';
import * as repo from '../lib/repo.js';
import { secrets } from '../lib/secrets.js';
import { stripeApi, tierForPrice, verifyStripeSignature, type StripeCheckoutSession, type StripeSubscription } from '../lib/stripe.js';

const router = new Router();
const ok = () => json(200, { ok: true });

function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Run a webhook body once per provider event id; on failure the mark is cleared so a redelivery retries. */
async function once(provider: string, id: string, fn: () => Promise<void>): Promise<void> {
  if (!(await repo.markEventSeen(provider, id))) return;
  try {
    await fn();
  } catch (err) {
    await repo.unmarkEvent(provider, id).catch(() => undefined);
    throw err;
  }
}

/* --------------------------------- Telegram -------------------------------- */

router.on('POST', '/webhooks/telegram', async (ctx: Ctx) => {
  const s = await secrets();
  if (!safeEqual(ctx.headers['x-telegram-bot-api-secret-token'], s['telegram-webhook-secret'])) return json(401, { error: 'bad secret' });
  const update = JSON.parse(ctx.rawBody || '{}') as TelegramUpdate;
  const m = update.message;
  if (!m || m.chat.type !== 'private') return ok();
  await once('telegram', String(update.update_id), async () => {
    const media: InboundMedia[] = [];
    const largestPhoto = m.photo?.length ? m.photo[m.photo.length - 1] : undefined;
    if (largestPhoto) media.push({ type: 'image', load: async () => ({ bytes: (await downloadTelegramFile(largestPhoto.file_id)).bytes, contentType: 'image/jpeg' }) });
    const video = m.video ?? (m.document?.mime_type?.startsWith('video/') ? m.document : undefined);
    const tooBig = video?.file_size && video.file_size > 20 * 1024 * 1024;
    if (video && !tooBig) media.push({ type: 'video', load: async () => ({ bytes: (await downloadTelegramFile(video.file_id)).bytes, contentType: video.mime_type ?? 'video/mp4' }) });
    const chatId = String(m.chat.id);
    if (tooBig) {
      await sendTelegram(chatId, 'That video is over 20 MB, which is the most Telegram lets me download. Send the link instead.');
      return;
    }
    const reply = await handleInbound({ channel: 'telegram', address: chatId, text: m.text ?? m.caption ?? '', media });
    if (reply) await sendTelegram(chatId, reply);
  });
  return ok();
});

/* --------------------------------- WhatsApp -------------------------------- */

router.on('GET', '/webhooks/whatsapp', async (ctx) => {
  const s = await secrets();
  const mode = ctx.query['hub.mode'];
  const token = ctx.query['hub.verify_token'];
  const challenge = ctx.query['hub.challenge'];
  if (mode === 'subscribe' && safeEqual(token, s['whatsapp-verify-token']) && challenge) {
    return { statusCode: 200, headers: { 'content-type': 'text/plain' }, body: challenge };
  }
  return json(403, { error: 'verification failed' });
});

router.on('POST', '/webhooks/whatsapp', async (ctx) => {
  const s = await secrets();
  if (!s['whatsapp-app-secret'] || !verifyWhatsAppSignature(ctx.rawBody, ctx.headers['x-hub-signature-256'], s['whatsapp-app-secret'])) {
    return json(401, { error: 'bad signature' });
  }
  const payload = JSON.parse(ctx.rawBody || '{}') as WhatsAppWebhook;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        await once('whatsapp', m.id, async () => {
          const media: InboundMedia[] = [];
          if (m.image) media.push({ type: 'image', load: () => downloadWhatsAppMedia(m.image!.id) });
          if (m.video) media.push({ type: 'video', load: () => downloadWhatsAppMedia(m.video!.id) });
          const text = m.text?.body ?? m.image?.caption ?? m.video?.caption ?? '';
          if (!text && !media.length) return;
          const reply = await handleInbound({ channel: 'whatsapp', address: m.from, text, media });
          if (reply) await sendWhatsApp(m.from, reply);
        });
      }
    }
  }
  // Meta retries anything that isn't a fast 200, so always acknowledge.
  return ok();
});

/* ---------------------------------- Stripe --------------------------------- */

async function applySubscription(sub: StripeSubscription): Promise<void> {
  const userId = sub.metadata?.userId ?? (await repo.userForStripeCustomer(sub.customer));
  if (!userId || !(await repo.getUser(userId))) {
    console.warn('Subscription for unknown customer', sub.customer);
    return;
  }
  const active = ['active', 'trialing', 'past_due'].includes(sub.status);
  const tier: TierId = active ? ((await tierForPrice(sub.items.data[0]?.price.id)) ?? 'free') : 'free';
  await repo.mapStripeCustomer(sub.customer, userId);
  await repo.updateUser(userId, { tier, stripeCustomerId: sub.customer, stripeSubscriptionId: active ? sub.id : '', subscriptionStatus: sub.status });
}

router.on('POST', '/webhooks/stripe', async (ctx) => {
  const s = await secrets();
  if (!s['stripe-webhook-secret'] || !verifyStripeSignature(ctx.rawBody, ctx.headers['stripe-signature'], s['stripe-webhook-secret'])) {
    return json(400, { error: 'bad signature' });
  }
  const event = JSON.parse(ctx.rawBody) as { id: string; type: string; data: { object: unknown } };
  await once('stripe', event.id, async () => {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as StripeCheckoutSession;
        const userId = session.client_reference_id ?? session.metadata?.userId;
        if (!userId || !(await repo.getUser(userId))) return;
        if (session.customer) {
          await repo.mapStripeCustomer(session.customer, userId);
          await repo.updateUser(userId, { stripeCustomerId: session.customer });
        }
        if (session.mode === 'subscription' && session.subscription) {
          await applySubscription(await stripeApi<StripeSubscription>('GET', `subscriptions/${session.subscription}`));
        } else if (session.mode === 'payment' && session.payment_status === 'paid') {
          const pack = CREDIT_PACKS.find((p) => p.id === session.metadata?.creditPackId);
          if (pack) {
            await repo.addCredits(userId, pack.creditMicros);
            await repo.addLedger(userId, { kind: 'credit_purchase', micros: -pack.creditMicros, ref: session.id });
          }
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscription(event.data.object as StripeSubscription);
        break;
      default:
        break;
    }
  });
  return ok();
});

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    return await dispatch(router, buildCtx(event));
  } catch (err) {
    console.error('Webhook failed', err);
    return json(500, { error: 'internal' });
  }
}
