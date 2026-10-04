import * as z from 'zod/mini';
import { Json, UserInfoSchema } from './common.js';

// ---------- shared chat shapes ----------

/** ProseMirror-style rich document; the server stores it opaquely. */
export const RichDoc = z.looseObject({
  type: z.literal('doc'),
  content: z.optional(z.array(Json)),
});

export const MessageBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().check(z.minLength(1), z.maxLength(4000)) }),
  z.object({ type: z.literal('rich'), doc: RichDoc }),
]);
export type MessageBodyDto = z.infer<typeof MessageBody>;

export const Attachment = z.object({
  id: z.string(),
  url: z.string(),
  name: z.string().check(z.maxLength(255)),
  mime: z.string().check(z.maxLength(127)),
  size: z.int().check(z.nonnegative()),
  width: z.optional(z.int().check(z.positive())),
  height: z.optional(z.int().check(z.positive())),
});
export type AttachmentDto = z.infer<typeof Attachment>;

export const Message = z.object({
  id: z.string(),
  clientId: z.string(),
  conversationId: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  authorAvatarUrl: z.optional(z.string()),
  body: MessageBody,
  attachments: z.array(Attachment),
  replyTo: z.optional(z.string()),
  /** emoji → user ids */
  reactions: z.record(z.string(), z.array(z.string())),
  createdAt: z.string(),
  editedAt: z.optional(z.string()),
  deletedAt: z.optional(z.string()),
});
export type MessageDto = z.infer<typeof Message>;

export const Conversation = z.object({
  id: z.string(),
  kind: z.enum(['room', 'direct']),
  title: z.optional(z.string()),
  members: z.optional(z.array(z.string())),
  lastMessage: z.optional(Message),
  unread: z.int().check(z.nonnegative()),
});
export type ConversationDto = z.infer<typeof Conversation>;

const ConversationId = z.string().check(z.minLength(1), z.maxLength(130));
const MessageId = z.string().check(z.minLength(1), z.maxLength(64));

// ---------- request / response pairs (client → server `req`) ----------

export const ChatConversationsReq = z.object({});
export const ChatConversationsRes = z.object({ conversations: z.array(Conversation) });

export const ChatOpenDirectReq = z.object({
  userId: z.string().check(z.minLength(1), z.maxLength(200)),
});
export const ChatOpenDirectRes = Conversation;

export const ChatSendReq = z.object({
  conversationId: ConversationId,
  clientId: z.string().check(z.minLength(1), z.maxLength(64)),
  body: MessageBody,
  attachments: z.optional(z.array(Attachment).check(z.maxLength(10))),
  replyTo: z.optional(MessageId),
});
export const ChatSendRes = Message;

export const ChatHistoryReq = z
  .object({
    conversationId: ConversationId,
    before: z.optional(MessageId),
    after: z.optional(MessageId),
    limit: z._default(z.int().check(z.gte(1), z.lte(100)), 30),
  })
  .check(
    z.refine((v) => !(v.before && v.after), { message: 'use either before or after, not both' }),
  );
export const ChatHistoryRes = z.object({ messages: z.array(Message), hasMore: z.boolean() });

export const ChatEditReq = z.object({ messageId: MessageId, body: MessageBody });
export const ChatEditRes = Message;

export const ChatDeleteReq = z.object({ messageId: MessageId });
export const ChatDeleteRes = Message;

export const ChatReactReq = z.object({
  messageId: MessageId,
  emoji: z.string().check(z.minLength(1), z.maxLength(16)),
  on: z.boolean(),
});
export const ChatReactRes = z.object({
  messageId: MessageId,
  reactions: z.record(z.string(), z.array(z.string())),
});

export const ChatReadReq = z.object({ conversationId: ConversationId, messageId: MessageId });
export const ChatReadRes = z.object({ conversationId: ConversationId, messageId: MessageId });

// ---------- broadcasts (server → room `msg`) ----------

export const ChatReactionEvent = z.object({
  conversationId: ConversationId,
  messageId: MessageId,
  emoji: z.string(),
  userId: z.string(),
  on: z.boolean(),
});
export const ChatReadEvent = z.object({
  conversationId: ConversationId,
  messageId: MessageId,
  userId: z.string(),
});
export const DocChangedEvent = z.object({
  collection: z.string(),
  id: z.string(),
  version: z.int().check(z.nonnegative()),
  deleted: z.optional(z.boolean()),
  by: z.optional(z.string()),
});

/** WebRTC signaling payload relayed with `Room.send(peerId, 'rtc.signal', …)`. */
export const RtcSignal = z.object({
  description: z.optional(
    z.object({
      type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
      sdp: z.optional(z.string()),
    }),
  ),
  candidate: z.optional(z.nullable(z.looseObject({ candidate: z.optional(z.string()) }))),
});

/** Request/response schemas keyed by topic — the server's handler registry and typed clients use this. */
export const TopicSchemas = {
  'chat.conversations': { request: ChatConversationsReq, response: ChatConversationsRes },
  'chat.open-direct': { request: ChatOpenDirectReq, response: ChatOpenDirectRes },
  'chat.send': { request: ChatSendReq, response: ChatSendRes },
  'chat.history': { request: ChatHistoryReq, response: ChatHistoryRes },
  'chat.edit': { request: ChatEditReq, response: ChatEditRes },
  'chat.delete': { request: ChatDeleteReq, response: ChatDeleteRes },
  'chat.react': { request: ChatReactReq, response: ChatReactRes },
  'chat.read': { request: ChatReadReq, response: ChatReadRes },
} as const;
export type RequestTopic = keyof typeof TopicSchemas;
export type TopicRequest<T extends RequestTopic> = z.input<(typeof TopicSchemas)[T]['request']>;
export type TopicResponse<T extends RequestTopic> = z.infer<(typeof TopicSchemas)[T]['response']>;

/** Server → room broadcast topics and their payloads. */
export const BroadcastSchemas = {
  'chat.message': Message,
  'chat.message-updated': Message,
  'chat.reaction': ChatReactionEvent,
  'chat.read': ChatReadEvent,
  'doc.changed': DocChangedEvent,
} as const;
export type BroadcastTopic = keyof typeof BroadcastSchemas;

export { UserInfoSchema };
