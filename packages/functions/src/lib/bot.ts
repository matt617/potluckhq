import { extractUrls, weekStartOf, type ChannelKind, type Community } from '@potluck/core';
import { env } from './env.js';
import { HttpError } from './http.js';
import { newId } from './ids.js';
import { createImport, describeSource } from './imports.js';
import { HELP_TEXT, listText, planText } from './messages.js';
import * as repo from './repo.js';
import { putObject } from './s3.js';
import { secrets } from './secrets.js';

export interface InboundMedia {
  type: 'image' | 'video';
  load: () => Promise<{ bytes: Uint8Array; contentType: string }>;
}

export interface InboundMessage {
  channel: Exclude<ChannelKind, 'web'>;
  /** Chat id (Telegram) or E.164 phone (WhatsApp, SMS) used for replies. */
  address: string;
  text: string;
  media?: InboundMedia[];
}

const CODE_RE = /^(?:\/start\s+|link\s+)?([A-HJ-NP-Z2-9]{6})$/i;

/** Process one inbound chat message and return the reply text. */
export async function handleInbound(msg: InboundMessage): Promise<string> {
  const text = msg.text.trim();
  const codeMatch = text.match(CODE_RE);
  const link = await repo.getChannel(msg.channel, msg.address);

  if (codeMatch && (!link || /^(\/start|link)/i.test(text))) {
    const userId = await repo.consumeLinkCode(codeMatch[1]!.toUpperCase());
    if (!userId) return 'That code is not valid or has expired. Get a new one from Account → Linked chats in the app.';
    await repo.putChannel({ kind: msg.channel, address: msg.address, userId, linkedAt: new Date().toISOString() });
    const user = await repo.getUser(userId);
    return `You're linked${user ? `, ${user.displayName}` : ''}! 🎉\n\n${HELP_TEXT}`;
  }

  if (!link) {
    return `Hi! I'm the Potluck recipe bot. To save recipes, first link this chat:\n1. Open ${env.appUrl}/account\n2. Tap "Link a chat" and send me the 6-character code.`;
  }

  const userId = link.userId;
  const user = await repo.getUser(userId);
  if (!user) return 'Your account could not be found. Please sign in to the app again.';
  const memberships = await repo.listUserMemberships(userId);
  if (!memberships.length) return `You're not in a community yet. Create one at ${env.appUrl} first.`;
  const communities = (await Promise.all(memberships.map((m) => repo.getCommunity(m.communityId)))).filter(Boolean) as Community[];
  const findCommunity = (name: string) => {
    const n = slug(name);
    return communities.find((c) => slug(c.name) === n) ?? communities.find((c) => slug(c.name).startsWith(n));
  };
  const defaultCommunity = communities.find((c) => c.id === user.defaultCommunityId) ?? communities[0]!;

  const lower = text.toLowerCase().replace(/^\//, '');
  if (!msg.media?.length) {
    if (['help', 'start', '?', 'hi', 'hello'].includes(lower)) return HELP_TEXT;
    if (lower === 'communities') {
      return communities.map((c) => `${c.id === defaultCommunity.id ? '✅' : '•'} ${c.name} (#${slug(c.name)})`).join('\n') + '\n\nSend *use <name>* to switch.';
    }
    if (lower.startsWith('use ')) {
      const target = findCommunity(text.slice(4));
      if (!target) return `I couldn't find that community. You're in: ${communities.map((c) => c.name).join(', ')}`;
      await repo.updateUser(userId, { defaultCommunityId: target.id });
      return `New recipes will go to *${target.name}*.`;
    }
    if (lower === 'plan') {
      const plan = await repo.getPlan(defaultCommunity.id, weekStartOf());
      const recipes = new Map((await repo.listCommunityRecipes(defaultCommunity.id)).map((r) => [r.id, r]));
      return planText(plan, recipes, defaultCommunity.name);
    }
    if (['shop', 'shopping', 'list', 'groceries'].includes(lower)) {
      const { list } = await repo.getListWithVersion(defaultCommunity.id, weekStartOf());
      return listText(list, defaultCommunity.name);
    }
    if (lower === 'recipes') {
      const recipes = (await repo.listCommunityRecipes(defaultCommunity.id)).slice(0, 10);
      if (!recipes.length) return 'No recipes yet. Send me a link!';
      return `*Latest in ${defaultCommunity.name}*\n${recipes.map((r) => `• ${r.title}`).join('\n')}\n\n${env.appUrl}/book`;
    }
  }

  const tag = text.match(/#([\w-]+)/)?.[1];
  const target = tag ? findCommunity(tag) : defaultCommunity;
  if (tag && !target) return `I couldn't find a community called #${tag}. Send *communities* to see yours.`;
  const community = target ?? defaultCommunity;

  try {
    if (msg.media?.length) {
      const images: string[] = [];
      let videoKey: string | undefined;
      for (const m of msg.media.slice(0, 6)) {
        const { bytes, contentType } = await m.load();
        const key = `uploads/${userId}/${Date.now()}-${newId(8)}.${m.type === 'video' ? 'mp4' : 'jpg'}`;
        await putObject(key, bytes, contentType);
        if (m.type === 'video') videoKey = key;
        else images.push(key);
      }
      const job = await createImport({ userId, communityId: community.id, imageKeys: videoKey ? undefined : images, videoKey, text: text || undefined, channel: msg.channel, replyTo: msg.address });
      return `Got your ${describeSource(job)}! Reading the recipe now. I'll message you when it's in *${community.name}*.`;
    }
    const urls = extractUrls(text).slice(0, 5);
    if (urls.length) {
      for (const url of urls) await createImport({ userId, communityId: community.id, url, channel: msg.channel, replyTo: msg.address });
      return urls.length === 1
        ? `Got it! Watching that video now. I'll message you when the recipe is in *${community.name}* (usually under a minute).`
        : `Got ${urls.length} links! I'll message you as each recipe lands in *${community.name}*.`;
    }
    if (text.length >= 120 && /ingredient|tbsp|tsp|cup|gram|\bg\b|oven|bake|stir/i.test(text)) {
      await createImport({ userId, communityId: community.id, text, channel: msg.channel, replyTo: msg.address });
      return `That looks like a recipe. Adding it to *${community.name}*…`;
    }
  } catch (err) {
    if (err instanceof HttpError) return err.message;
    throw err;
  }
  return `I didn't catch that. ${HELP_TEXT}`;
}

export function slug(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function botLinks(): Promise<{ telegram?: string; whatsapp?: string }> {
  const s = await secrets();
  return {
    telegram: s['telegram-bot-username'] ? `https://t.me/${s['telegram-bot-username']}` : undefined,
    whatsapp: s['whatsapp-number'] ? `https://wa.me/${s['whatsapp-number'].replace(/\D/g, '')}` : undefined,
  };
}
