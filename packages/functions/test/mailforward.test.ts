import { describe, expect, it } from 'vitest';
import { rewriteForForward } from '../src/lib/mailforward.js';

const raw = [
  'Return-Path: <ana@example.org>',
  'DKIM-Signature: v=1; a=rsa-sha256; d=example.org;',
  '\tb=abc123',
  'From: "Ana Lima" <ana@example.org>',
  'To: support@potluckhq.app',
  'Subject: Help with my',
  ' community',
  'Message-ID: <x@example.org>',
  'Content-Type: text/plain',
  '',
  'Hi there,',
  'From: this line is body text, not a header',
].join('\r\n');

describe('rewriteForForward', () => {
  const out = rewriteForForward(raw, { forwardFrom: 'forwarder@potluckhq.app', recipientLabel: 'support' });
  const [head, body] = out.split('\r\n\r\n');

  it('sends from our domain and keeps the sender reachable through Reply-To', () => {
    expect(head).toMatch(/^From: "Ana Lima via Potluck support" <forwarder@potluckhq.app>/);
    expect(head).toContain('Reply-To: "Ana Lima" <ana@example.org>');
  });
  it('drops headers that break on the second hop and keeps folded ones intact', () => {
    expect(head).not.toMatch(/DKIM-Signature|Return-Path|Message-ID/i);
    expect(head).toContain('Subject: Help with my\r\n community');
  });
  it('leaves the body untouched', () => {
    expect(body).toBe('Hi there,\r\nFrom: this line is body text, not a header');
  });
});
