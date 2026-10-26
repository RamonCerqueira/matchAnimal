import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Ack as AckDecorator, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { SocketAck, SocketCommand, ChatMessageEvent } from "@matchanimal/shared";
import { ChatService } from "./chat.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

type Client = Socket & { data: { userId?: string; accessVersion?: number; counts?: Record<string, number>; lastRateAt?: number; rateCount?: number } };
type Ack<T> = (result: SocketAck<T>) => void;
const origins = (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((value) => value.trim());

@Injectable()
@WebSocketGateway({ namespace: "/realtime", transports: ["websocket"], maxHttpBufferSize: 64 * 1024, cors: { origin: origins, credentials: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);
  private readonly online = new Map<string, number>();
  private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly jwt: JwtService, private readonly chat: ChatService, private readonly notifications: NotificationsService, private readonly prisma: PrismaService) {}

  async handleConnection(client: Client) {
    try {
      const cookie = client.handshake.headers.cookie?.split(";").map((value) => value.trim()).find((value) => value.startsWith("access_token="))?.slice("access_token=".length);
      const token = (client.handshake.auth?.token as string | undefined) ?? (client.handshake.headers.authorization?.startsWith("Bearer ") ? client.handshake.headers.authorization.slice(7) : undefined) ?? cookie;
      if (!token) throw new Error("missing token");
      const claims = await this.jwt.verifyAsync<{ sub: string; exp?: number; av?: number }>(decodeURIComponent(token), { secret: process.env.JWT_ACCESS_SECRET });
      if (!claims.sub) throw new Error("invalid token");
      const account = await this.prisma.user.findUnique({ where: { id: claims.sub }, select: { accountStatus: true, suspendedUntil: true, accessVersion: true } });
      if (!account || account.accessVersion !== (claims.av ?? 0) || account.accountStatus === "BANNED" || account.accountStatus === "SUSPENDED" && (!account.suspendedUntil || account.suspendedUntil > new Date())) throw new Error("account access revoked");
      client.data.userId = claims.sub;
      client.data.accessVersion = claims.av ?? 0;
      await client.join(`user:${claims.sub}`);
      const count = (this.online.get(claims.sub) ?? 0) + 1;
      this.online.set(claims.sub, count);
      if (count === 1) void this.emitPresence(claims.sub, "ONLINE", null);
      client.emit("session:ready", { userId: claims.sub, serverTime: new Date().toISOString(), capabilities: ["chat", "typing", "delivery", "read", "presence", "notifications"] });
      if (claims.exp && claims.exp * 1000 - Date.now() < 5 * 60_000) client.emit("session:expiring", { expiresAt: new Date(claims.exp * 1000).toISOString() });
    } catch {
      client.emit("connect_error", { code: "UNAUTHORIZED", message: "Sessão inválida ou expirada." });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Client) {
    const userId = client.data.userId;
    if (!userId) return;
    const remaining = Math.max(0, (this.online.get(userId) ?? 1) - 1);
    if (remaining) this.online.set(userId, remaining);
    else { this.online.delete(userId); void this.emitPresence(userId, "OFFLINE", new Date().toISOString()); }
  }

  onModuleDestroy() { for (const timer of this.typingTimers.values()) clearTimeout(timer); }

  async publishMessage(message: { id: string; threadId: string; senderId: string; body: string; createdAt: Date; deliveredAt: Date | null; readAt: Date | null; idempotencyKey?: string | null }) {
    const participantIds = await this.chat.participantIds(message.senderId, message.threadId);
    const event: ChatMessageEvent = { messageId: message.id, clientMessageId: message.idempotencyKey ?? message.id, conversationId: message.threadId, senderId: message.senderId, type: "TEXT", content: message.body, createdAt: message.createdAt.toISOString() };
    this.server?.to(`conversation:${message.threadId}`).emit("chat:message", event);
    for (const userId of participantIds) {
      this.server?.to(`user:${userId}`).emit("chat:message", event);
      this.server?.to(`user:${userId}`).emit("chat:unread:update", { conversationId: message.threadId, unreadCount: await this.chat.unreadCount(userId, message.threadId), totalUnreadCount: await this.chat.totalUnreadCount(userId) });
      if (userId !== message.senderId) {
        const notification = await this.notifications.eventFor(userId, message.threadId, ["MESSAGE"]);
        if (notification) this.server?.to(`user:${userId}`).emit("notification:new", notification);
      }
    }
  }

  async publishMatch(matchId: string, userIds: string[]) {
    for (const userId of new Set(userIds)) {
      const event = await this.chat.matchEvent(matchId, userId);
      if (event) {
        this.server?.to(`user:${userId}`).emit("match:created", event);
        const notification = await this.notifications.eventFor(userId, matchId, ["MATCH"]);
        if (notification) this.server?.to(`user:${userId}`).emit("notification:new", notification);
      }
    }
  }

  async publishMatchRemoved(matchId: string, userIds: string[], reason = "UNMATCHED") {
    const conversationId = await this.chat.conversationIdForMatch(matchId, userIds[0]);
    for (const userId of new Set(userIds)) {
      const room = `conversation:${conversationId}`;
      const sockets = await this.server.in(`user:${userId}`).fetchSockets();
      for (const socket of sockets) if (conversationId) await socket.leave(room);
      this.server?.to(`user:${userId}`).emit("match:removed", { matchId, conversationId, reason });
    }
  }

  publishSocial(event: "feed:post:created" | "feed:post:updated" | "feed:post:deleted" | "feed:reaction:updated" | "feed:comment:created" | "feed:comment:deleted" | "social:follow:updated" | "story:created" | "event:updated" | "group:post:created", payload: Record<string, unknown>, userIds: string[]) {
    for (const userId of new Set(userIds)) this.server?.to(`user:${userId}`).emit(event, payload);
  }

  async publishNotification(userId: string, entityId: string, type: string) {
    const notification = await this.notifications.eventFor(userId, entityId, [type]);
    if (notification) this.server?.to(`user:${userId}`).emit("notification:new", notification);
  }

  @SubscribeMessage("chat:join")
  async join(@ConnectedSocket() client: Client, command: SocketCommand<{ conversationId: string }>, @AckDecorator() ack: Ack<{ conversationId: string }>) {
    await this.command(client, command, ack, async (userId, data) => {
      if (typeof data.conversationId !== "string" || !data.conversationId || data.conversationId.length > 100) throw new SocketFailure("VALIDATION_ERROR", "Comando inválido.");
      await this.chat.authorize(userId, data.conversationId);
      await client.join(`conversation:${data.conversationId}`);
      const delivered = await this.chat.markDelivered(userId, data.conversationId);
      if (delivered.delivered) this.server.to(`conversation:${data.conversationId}`).emit("chat:delivery:update", { conversationId: data.conversationId, userId, deliveredAt: new Date().toISOString() });
      return { conversationId: data.conversationId };
    });
  }

  @SubscribeMessage("chat:leave")
  async leave(@ConnectedSocket() client: Client, command: SocketCommand<{ conversationId: string }>, @AckDecorator() ack: Ack<{ conversationId: string }>) {
    await this.command(client, command, ack, async (_userId, data) => { if (typeof data.conversationId !== "string" || !data.conversationId || data.conversationId.length > 100) throw new SocketFailure("VALIDATION_ERROR", "Comando inválido."); await client.leave(`conversation:${data.conversationId}`); return { conversationId: data.conversationId }; });
  }

  @SubscribeMessage("chat:send")
  async send(@ConnectedSocket() client: Client, command: SocketCommand<{ conversationId: string; clientMessageId: string; type: "TEXT" | "IMAGE"; content: string }>, @AckDecorator() ack: Ack<ChatMessageEvent>) {
    await this.command(client, command, ack, async (userId, data) => {
      this.rateLimit(client, 20);
      if (typeof data.conversationId !== "string" || data.conversationId.length > 100 || typeof data.clientMessageId !== "string" || !data.clientMessageId || data.clientMessageId.length > 100 || data.type !== "TEXT" || typeof data.content !== "string" || !data.content.trim()) throw new SocketFailure("VALIDATION_ERROR", "Mensagem inválida.");
      if (data.content.length > 4000) throw new SocketFailure("MESSAGE_TOO_LARGE", "A mensagem excede o limite permitido.");
      const message = await this.chat.send(userId, data.conversationId, data.content, data.clientMessageId);
      const event: ChatMessageEvent = { messageId: message.id, clientMessageId: message.idempotencyKey ?? data.clientMessageId, conversationId: message.threadId, senderId: message.senderId, type: "TEXT", content: message.body, createdAt: message.createdAt.toISOString() };
      await this.publishMessage(message);
      return event;
    });
  }

  @SubscribeMessage("chat:typing")
  async typing(@ConnectedSocket() client: Client, command: SocketCommand<{ conversationId: string; isTyping: boolean }>, @AckDecorator() ack: Ack<{ conversationId: string }>) {
    await this.command(client, command, ack, async (userId, data) => {
      this.rateLimit(client, 60);
      if (typeof data.conversationId !== "string" || typeof data.isTyping !== "boolean") throw new SocketFailure("VALIDATION_ERROR", "Comando inválido.");
      await this.chat.authorize(userId, data.conversationId);
      const key = `${userId}:${data.conversationId}`;
      const prior = this.typingTimers.get(key); if (prior) clearTimeout(prior);
      if (data.isTyping) this.typingTimers.set(key, setTimeout(() => { this.typingTimers.delete(key); this.server.to(`conversation:${data.conversationId}`).emit("chat:typing:update", { conversationId: data.conversationId, userId, isTyping: false }); }, 3000));
      client.to(`conversation:${data.conversationId}`).emit("chat:typing:update", { conversationId: data.conversationId, userId, isTyping: Boolean(data.isTyping) });
      return { conversationId: data.conversationId };
    });
  }

  @SubscribeMessage("chat:read")
  async read(@ConnectedSocket() client: Client, command: SocketCommand<{ conversationId: string; lastReadMessageId?: string }>, @AckDecorator() ack: Ack<{ readAt: string }>) {
    await this.command(client, command, ack, async (userId, data) => {
      this.rateLimit(client, 30);
      if (typeof data.conversationId !== "string" || !data.conversationId || data.conversationId.length > 100 || (data.lastReadMessageId !== undefined && typeof data.lastReadMessageId !== "string")) throw new SocketFailure("VALIDATION_ERROR", "Comando inválido.");
      const readAt = new Date(); await this.chat.markRead(userId, data.conversationId, data.lastReadMessageId);
      this.server.to(`conversation:${data.conversationId}`).emit("chat:read:update", { conversationId: data.conversationId, userId, lastReadMessageId: data.lastReadMessageId ?? null, readAt: readAt.toISOString() });
      for (const id of await this.chat.participantIds(userId, data.conversationId)) this.server.to(`user:${id}`).emit("chat:unread:update", { conversationId: data.conversationId, unreadCount: await this.chat.unreadCount(id, data.conversationId), totalUnreadCount: await this.chat.totalUnreadCount(id) });
      return { readAt: readAt.toISOString() };
    });
  }

  @SubscribeMessage("chat:delivered")
  async delivered(@ConnectedSocket() client: Client, command: SocketCommand<{ conversationId: string; messageId: string }>, @AckDecorator() ack: Ack<{ deliveredAt: string }>) {
    await this.command(client, command, ack, async (userId, data) => {
      this.rateLimit(client, 60);
      if (typeof data.conversationId !== "string" || typeof data.messageId !== "string") throw new SocketFailure("VALIDATION_ERROR", "Comando inválido.");
      const deliveredAt = new Date(); await this.chat.markMessageDelivered(userId, data.conversationId, data.messageId);
      this.server.to(`conversation:${data.conversationId}`).emit("chat:delivery:update", { conversationId: data.conversationId, messageId: data.messageId, userId, deliveredAt: deliveredAt.toISOString() });
      return { deliveredAt: deliveredAt.toISOString() };
    });
  }

  @SubscribeMessage("notification:read")
  async notificationRead(@ConnectedSocket() client: Client, command: SocketCommand<{ notificationIds: string[] }>, @AckDecorator() ack: Ack<{ unreadCount: number }>) {
    await this.command(client, command, ack, async (userId, data) => {
      this.rateLimit(client, 20);
      if (!Array.isArray(data.notificationIds) || data.notificationIds.length > 100) throw new SocketFailure("VALIDATION_ERROR", "Lista de notificações inválida.");
      for (const id of data.notificationIds) await this.notifications.markRead(userId, id);
      const { count } = await this.notifications.unreadCount(userId);
      this.server.to(`user:${userId}`).emit("notification:count:update", { unreadCount: count });
      return { unreadCount: count };
    });
  }

  private async command<T, R>(client: Client, command: SocketCommand<T>, ack: Ack<R>, action: (userId: string, data: T) => Promise<R>) {
    const requestId = typeof command?.requestId === "string" ? command.requestId : "missing-request-id";
    try {
      const userId = client.data.userId;
      if (!userId) throw new SocketFailure("UNAUTHORIZED", "Sessão inválida.");
      const account = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountStatus: true, suspendedUntil: true, accessVersion: true } });
      if (!account || account.accessVersion !== client.data.accessVersion || account.accountStatus === "BANNED" || account.accountStatus === "SUSPENDED" && (!account.suspendedUntil || account.suspendedUntil > new Date())) { client.disconnect(true); throw new SocketFailure("UNAUTHORIZED", "A sessão foi encerrada."); }
      if (!command || typeof command.requestId !== "string" || command.requestId.length < 1 || command.requestId.length > 100) throw new SocketFailure("VALIDATION_ERROR", "Comando inválido.");
      const data = await action(userId, command);
      ack?.({ success: true, requestId, data });
    } catch (error) {
      const failure = error instanceof SocketFailure ? error : new SocketFailure("FORBIDDEN", "Ação indisponível.");
      if (!(error instanceof SocketFailure)) this.logger.warn(`socket command failed: ${failure.code}`);
      ack?.({ success: false, requestId, error: { code: failure.code, message: failure.message } });
    }
  }

  private rateLimit(client: Client, limit: number) {
    const now = Date.now();
    if (!client.data.lastRateAt || now - client.data.lastRateAt > 60_000) { client.data.lastRateAt = now; client.data.rateCount = 0; }
    if ((client.data.rateCount ?? 0) >= limit) throw new SocketFailure("RATE_LIMITED", "Muitas ações. Tente novamente em instantes.");
    client.data.rateCount = (client.data.rateCount ?? 0) + 1;
  }

  private async emitPresence(userId: string, status: "ONLINE" | "OFFLINE", lastSeenAt: string | null) {
    const recipients = await this.chat.presenceRecipients(userId);
    for (const recipientId of recipients) this.server?.to(`user:${recipientId}`).emit("presence:changed", { userId, status, lastSeenAt });
  }
}

class SocketFailure extends Error { constructor(readonly code: string, message: string) { super(message); } }
