import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { env } from './env.js';
import { escapeHtml } from './channels/format.js';

const ses = new SESv2Client({});

/** Send an invite email when SES is configured. Returns false when skipped. */
export async function sendInviteEmail(to: string, inviterName: string, communityName: string, url: string): Promise<boolean> {
  if (!env.sesFromEmail) return false;
  const subject = `${inviterName} invited you to ${communityName} on Potluck`;
  const text = `${inviterName} invited you to join "${communityName}", a shared recipe book and meal plan on Potluck.\n\nJoin here: ${url}\n\nThis link expires in 7 days.`;
  const html = `<p>${escapeHtml(inviterName)} invited you to join <b>${escapeHtml(communityName)}</b>, a shared recipe book and meal plan on Potluck.</p><p><a href="${escapeHtml(url)}">Join ${escapeHtml(communityName)}</a></p><p style="color:#666">This link expires in 7 days.</p>`;
  try {
    await ses.send(new SendEmailCommand({
      FromEmailAddress: env.sesFromEmail,
      Destination: { ToAddresses: [to] },
      Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text }, Html: { Data: html } } } },
    }));
    return true;
  } catch (err) {
    console.error('Invite email failed', err);
    return false;
  }
}
