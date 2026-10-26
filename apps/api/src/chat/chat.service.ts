import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private async findMembership(userId: string, threadId: string) {
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      select: { id: true, match: { select: { id: true, status: true, petA: { select: { ownerId: true, isActive: true, owner: { select: { tutor: { select: { notificationOptIn: true } } } } } }, petB: { select: { ownerId: true, isActive: true, owner: { select: { tutor: { select: { notificationOptIn: true } } } } } } } } },
    });
    if (!thread || thread.match.status !== "ACTIVE") throw new NotFoundException("Conversa não encontrada.");
    const participant = [thread.match.petA, thread.match.petB].some((pet) => pet.ownerId === userId && pet.isActive);
    if (!participant) throw new ForbiddenException("Você não tem acesso a esta conversa.");
    const blocked = await this.prisma.userBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: { in: [thread.match.petA.ownerId, thread.match.petB.ownerId] } }, { blockedId: userId, blockerId: { in: [thread.match.petA.ownerId, thread.match.petB.ownerId] } }] } });
    if (blocked) throw new ForbiddenException("Esta conversa não está disponível.");
    return thread;
  }

  async participantIds(userId: string, threadId: string) {
    const thread = await this.findMembership(userId, threadId);
    return [...new Set([thread.match.petA.ownerId, thread.match.petB.ownerId])];
  }

  async authorize(userId: string, threadId: string) { await this.findMembership(userId, threadId); return true; }

  async presenceRecipients(userId: string) {
    const matches = await this.prisma.petMatch.findMany({ where: { status: "ACTIVE", OR: [{ petA: { ownerId: userId, isActive: true } }, { petB: { ownerId: userId, isActive: true } }] }, select: { petA: { select: { ownerId: true } }, petB: { select: { ownerId: true } } } });
    const candidates = [...new Set(matches.flatMap(({ petA, petB }) => [petA.ownerId, petB.ownerId]).filter((id) => id !== userId))];
    if (!candidates.length) return [];
    const blocked = await this.prisma.userBlock.findMany({ where: { OR: [{ blockerId: userId, blockedId: { in: candidates } }, { blockedId: userId, blockerId: { in: candidates } }] }, select: { blockerId: true, blockedId: true } });
    const excluded = new Set(blocked.flatMap(({ blockerId, blockedId }) => [blockerId, blockedId]));
    return candidates.filter((id) => !excluded.has(id));
  }

  async matchEvent(matchId: string, userId: string) {
    const match = await this.prisma.petMatch.findFirst({ where: { id: matchId, status: "ACTIVE", OR: [{ petA: { ownerId: userId } }, { petB: { ownerId: userId } }] }, select: { id: true, createdAt: true, thread: { select: { id: true } }, petA: { select: { id: true, name: true, coverPhotoUrl: true, ownerId: true } }, petB: { select: { id: true, name: true, coverPhotoUrl: true, ownerId: true } } } });
    if (!match) return null;
    const matchedPet = match.petA.ownerId === userId ? match.petB : match.petA;
    return { matchId: match.id, petId: match.petA.ownerId === userId ? match.petA.id : match.petB.id, matchedPet: { id: matchedPet.id, name: matchedPet.name, photoUrl: matchedPet.coverPhotoUrl }, conversationId: match.thread?.id ?? null, createdAt: match.createdAt.toISOString() };
  }

  async conversationIdForMatch(matchId: string, userId: string) {
    const match = await this.prisma.petMatch.findFirst({ where: { id: matchId, OR: [{ petA: { ownerId: userId } }, { petB: { ownerId: userId } }] }, select: { thread: { select: { id: true } } } });
    return match?.thread?.id ?? null;
  }

  unreadCount(userId: string, threadId: string) {
    return this.prisma.chatMessage.count({ where: { threadId, senderId: { not: userId }, readAt: null } });
  }

  async totalUnreadCount(userId: string) {
    const threads = await this.listThreads(userId);
    if (!threads.length) return 0;
    return this.prisma.chatMessage.count({ where: { threadId: { in: threads.map((thread) => thread.id) }, senderId: { not: userId }, readAt: null } });
  }

  async listThreads(userId: string) {
    const threads = await this.prisma.chatThread.findMany({
      where: { match: { status: "ACTIVE", OR: [{ petA: { ownerId: userId, isActive: true } }, { petB: { ownerId: userId, isActive: true } }] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, updatedAt: true, match: { select: { id: true, petA: { select: { id: true, name: true, ownerId: true, coverPhotoUrl: true } }, petB: { select: { id: true, name: true, ownerId: true, coverPhotoUrl: true } } } }, messages: { take: 1, orderBy: { createdAt: "desc" }, select: { id: true, body: true, senderId: true, createdAt: true } }, _count: { select: { messages: true } } },
    });
    const allowed: typeof threads = [];
    for (const thread of threads) {
      const otherId = thread.match.petA.ownerId === userId ? thread.match.petB.ownerId : thread.match.petA.ownerId;
      const [blocked, unreadCount] = await Promise.all([
        this.prisma.userBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: otherId }, { blockerId: otherId, blockedId: userId }] }, select: { id: true } }),
        this.prisma.chatMessage.count({ where: { threadId: thread.id, senderId: { not: userId }, readAt: null } }),
      ]);
      if (!blocked) allowed.push(Object.assign(thread, { unreadCount }));
    }
    return allowed;
  }

  async history(userId: string, threadId: string, before?: string, limit = 30) {
    await this.findMembership(userId, threadId);
    if (before && Number.isNaN(new Date(before).getTime())) throw new BadRequestException("Cursor de paginação inválido.");
    const messages = await this.prisma.chatMessage.findMany({ where: { threadId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 50), select: { id: true, senderId: true, body: true, createdAt: true, deliveredAt: true, readAt: true } });
    return messages.reverse();
  }

  async send(userId: string, threadId: string, body: string, idempotencyKey?: string) {
    if (!body.trim()) throw new BadRequestException("Escreva uma mensagem antes de enviar.");
    const thread = await this.findMembership(userId, threadId);
    const recipientId = thread.match.petA.ownerId === userId ? thread.match.petB.ownerId : thread.match.petA.ownerId;
    const message = await this.prisma.$transaction(async (tx) => {
      const existing = idempotencyKey ? await tx.chatMessage.findUnique({ where: { senderId_idempotencyKey: { senderId: userId, idempotencyKey } }, select: { id: true, threadId: true, senderId: true, body: true, createdAt: true, deliveredAt: true, readAt: true, idempotencyKey: true } }) : null;
      if (existing) {
        if (existing.threadId !== threadId) throw new BadRequestException("Chave de envio já utilizada em outra conversa.");
        return existing;
      }
      const created = await tx.chatMessage.create({ data: { threadId, senderId: userId, body: body.trim(), idempotencyKey: idempotencyKey ?? null }, select: { id: true, threadId: true, senderId: true, body: true, createdAt: true, deliveredAt: true, readAt: true, idempotencyKey: true } });
      await tx.chatThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
      const recipientOptIn = thread.match.petA.ownerId === recipientId ? thread.match.petA.owner.tutor?.notificationOptIn : thread.match.petB.owner.tutor?.notificationOptIn;
      if (recipientOptIn) await tx.notification.create({ data: { recipientId, actorId: userId, type: "MESSAGE", entityId: threadId } });
      return created;
    });
    return message;
  }

  async markRead(userId: string, threadId: string, lastReadMessageId?: string) {
    await this.findMembership(userId, threadId);
    if (lastReadMessageId) {
      const target = await this.prisma.chatMessage.findFirst({ where: { id: lastReadMessageId, threadId }, select: { createdAt: true } });
      if (!target) throw new NotFoundException("Mensagem não encontrada.");
      return this.prisma.chatMessage.updateMany({ where: { threadId, senderId: { not: userId }, readAt: null, createdAt: { lte: target.createdAt } }, data: { readAt: new Date() } });
    }
    return this.prisma.chatMessage.updateMany({ where: { threadId, senderId: { not: userId }, readAt: null }, data: { readAt: new Date() } });
  }

  async markDelivered(userId: string, threadId: string) {
    await this.findMembership(userId, threadId);
    const result = await this.prisma.chatMessage.updateMany({ where: { threadId, senderId: { not: userId }, deliveredAt: null }, data: { deliveredAt: new Date() } });
    return { delivered: result.count };
  }

  async markMessageDelivered(userId: string, threadId: string, messageId: string) {
    await this.findMembership(userId, threadId);
    const result = await this.prisma.chatMessage.updateMany({ where: { id: messageId, threadId, senderId: { not: userId }, deliveredAt: null }, data: { deliveredAt: new Date() } });
    if (!result.count) {
      const existing = await this.prisma.chatMessage.findFirst({ where: { id: messageId, threadId, senderId: { not: userId } }, select: { id: true } });
      if (!existing) throw new NotFoundException("Mensagem não encontrada.");
    }
    return true;
  }
}
