import { describe, expect, it } from 'vitest';
import {
  BroadcastSchemas,
  ChatHistoryReq,
  ChatReactReq,
  ChatSendReq,
  DocListQuery,
  DocParams,
  encodeWhereValue,
  IceRes,
  Message,
  MessageBody,
  TopicSchemas,
  whereCandidates,
} from '../src/index.js';

const message = {
  id: '01HZ',
  clientId: 'c1',
  conversationId: 'general',
  authorId: 'u1',
  authorName: 'Ada',
  body: { type: 'text', text: 'hello' },
  attachments: [],
  reactions: { '👍': ['u2'] },
  createdAt: '2026-01-01T00:00:00.000Z',
} as const;

describe('chat DTOs', () => {
  it('validates messages and bodies', () => {
    expect(Message.safeParse(message).success).toBe(true);
    expect(MessageBody.safeParse({ type: 'text', text: '' }).success).toBe(false);
    expect(MessageBody.safeParse({ type: 'text', text: 'x'.repeat(4001) }).success).toBe(false);
    expect(MessageBody.safeParse({ type: 'rich', doc: { type: 'doc', content: [] } }).success).toBe(
      true,
    );
    expect(MessageBody.safeParse({ type: 'rich', doc: { type: 'paragraph' } }).success).toBe(false);
  });

  it('chat.send requires ids and limits attachments', () => {
    const ok = { conversationId: 'general', clientId: 'c1', body: { type: 'text', text: 'hi' } };
    expect(ChatSendReq.safeParse(ok).success).toBe(true);
    expect(ChatSendReq.safeParse({ ...ok, clientId: '' }).success).toBe(false);
    const att = { id: 'a', url: 'u', name: 'n', mime: 'image/png', size: 1 };
    expect(ChatSendReq.safeParse({ ...ok, attachments: Array(11).fill(att) }).success).toBe(false);
  });

  it('chat.history defaults the limit and rejects before+after together', () => {
    const parsed = ChatHistoryReq.parse({ conversationId: 'general' });
    expect(parsed.limit).toBe(30);
    expect(ChatHistoryReq.safeParse({ conversationId: 'g', before: 'a', after: 'b' }).success).toBe(
      false,
    );
    expect(ChatHistoryReq.safeParse({ conversationId: 'g', limit: 101 }).success).toBe(false);
  });

  it('chat.react limits emoji length', () => {
    expect(ChatReactReq.safeParse({ messageId: 'm', emoji: '🎉', on: true }).success).toBe(true);
    expect(
      ChatReactReq.safeParse({ messageId: 'm', emoji: 'x'.repeat(17), on: true }).success,
    ).toBe(false);
  });

  it('every request topic has request and response schemas', () => {
    for (const [topic, schemas] of Object.entries(TopicSchemas)) {
      expect(topic).toMatch(/^[a-z]+(\.[a-z-]+)+$/);
      expect(typeof schemas.request.safeParse).toBe('function');
      expect(typeof schemas.response.safeParse).toBe('function');
    }
    expect(Object.keys(BroadcastSchemas)).toContain('doc.changed');
  });
});

describe('REST DTOs', () => {
  it('parses doc list queries with bracketed where filters', () => {
    const q = DocListQuery.parse({ where: { column: 'todo' }, limit: '25', orderBy: 'rank' });
    expect(q).toMatchObject({ limit: 25, dir: 'asc', where: { column: 'todo' } });
    expect(DocListQuery.safeParse({ where: { 'bad field': 'x' } }).success).toBe(false);
    expect(DocListQuery.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('validates path params', () => {
    expect(
      DocParams.safeParse({ appId: 'demo', collection: 'kanban.cards', id: 'c1' }).success,
    ).toBe(true);
    expect(DocParams.safeParse({ appId: 'Demo', collection: 'x' }).success).toBe(false);
    expect(DocParams.safeParse({ appId: 'demo', collection: '../etc' }).success).toBe(false);
  });

  it('accepts ICE server lists with and without credentials', () => {
    const res = IceRes.safeParse({
      iceServers: [
        { urls: 'stun:stun.example.org:19302' },
        { urls: ['turn:turn.example.org'], username: '1:u', credential: 'abc' },
      ],
    });
    expect(res.success).toBe(true);
  });
});

describe('where value encoding', () => {
  it('round-trips typed values through candidates', () => {
    for (const value of ['todo', 7, true, false, null] as const) {
      expect(whereCandidates(encodeWhereValue(value))).toContain(value);
    }
    expect(whereCandidates('1')).toEqual(['1', 1]);
    expect(whereCandidates('')).toEqual(['']);
    expect(whereCandidates('abc')).toEqual(['abc']);
  });
});
