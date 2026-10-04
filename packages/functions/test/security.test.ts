import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { formEncode, verifyStripeSignature } from '../src/lib/stripe.js';
import { verifyWhatsAppSignature } from '../src/lib/channels/whatsapp.js';
import { toTelegramHtml, toPlain } from '../src/lib/channels/format.js';
import { Router } from '../src/lib/http.js';
import { sanitizeExtraction } from '../src/lib/extract.js';
import { classifyYtdlpError } from '../src/lib/downloader.js';
import { RetryableError, UserFacingError } from '../src/lib/gemini.js';

describe('stripe', () => {
  const secret = 'whsec_test';
  const body = '{"id":"evt_1"}';
  const sign = (t: number) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
  it('accepts a fresh valid signature', () => {
    const now = 1_700_000_000;
    expect(verifyStripeSignature(body, sign(now), secret, now)).toBe(true);
  });
  it('rejects tampered bodies, stale timestamps and missing headers', () => {
    const now = 1_700_000_000;
    expect(verifyStripeSignature(body + ' ', sign(now), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(now - 1000), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, undefined, secret, now)).toBe(false);
  });
  it('encodes nested form params', () => {
    expect(formEncode({ line_items: [{ price: 'p1', quantity: 1 }], metadata: { userId: 'u' } })).toEqual([
      'line_items%5B0%5D%5Bprice%5D=p1',
      'line_items%5B0%5D%5Bquantity%5D=1',
      'metadata%5BuserId%5D=u',
    ]);
  });
});

describe('whatsapp', () => {
  it('verifies the app-secret HMAC', () => {
    const body = '{"entry":[]}';
    const sig = `sha256=${createHmac('sha256', 'app').update(body).digest('hex')}`;
    expect(verifyWhatsAppSignature(body, sig, 'app')).toBe(true);
    expect(verifyWhatsAppSignature(body, sig, 'other')).toBe(false);
    expect(verifyWhatsAppSignature(body, undefined, 'app')).toBe(false);
  });
});

describe('message formatting', () => {
  it('escapes html for telegram and converts bold markers', () => {
    expect(toTelegramHtml('*Mac & cheese* <3')).toBe('<b>Mac &amp; cheese</b> &lt;3');
    expect(toPlain('*Bold* text')).toBe('Bold text');
  });
});

describe('router', () => {
  it('matches params and methods', async () => {
    const r = new Router().on('GET', '/api/communities/:cid/plans/:week', async (c) => c.params);
    expect(r.match('GET', '/api/communities/abc/plans/2026-10-05')?.params).toEqual({ cid: 'abc', week: '2026-10-05' });
    expect(r.match('POST', '/api/communities/abc/plans/2026-10-05')).toBeNull();
    expect(r.match('GET', '/api/communities/abc')).toBeNull();
  });
});

describe('extraction cleanup', () => {
  it('normalizes units, clamps numbers and rejects empty recipes', () => {
    const out = sanitizeExtraction({
      isRecipe: true, title: '  Pasta ', servings: 0, tags: ['Dinner', 'dinner'], confidence: 3,
      ingredients: [{ quantity: -1, unit: 'Tablespoons', name: 'olive oil', aisle: 'nonsense' as never }],
      steps: [{ text: 'Boil', timestampSec: -5 }],
    });
    expect(out.title).toBe('Pasta');
    expect(out.servings).toBe(1);
    expect(out.tags).toEqual(['dinner']);
    expect(out.confidence).toBe(1);
    expect(out.ingredients[0]).toMatchObject({ quantity: null, unit: 'tbsp', aisle: 'pantry' });
    expect(out.steps[0]!.timestampSec).toBe(0);
    expect(sanitizeExtraction({ isRecipe: true, title: 'x', servings: 2, tags: [], ingredients: [], steps: [], confidence: 1 }).isRecipe).toBe(false);
  });
});

describe('yt-dlp errors', () => {
  it('turns login walls into user-facing advice and network blips into retries', () => {
    expect(classifyYtdlpError('ERROR: [Instagram] login required')).toBeInstanceOf(UserFacingError);
    expect(classifyYtdlpError('ERROR: HTTP Error 503')).toBeInstanceOf(RetryableError);
  });
});
