import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}
  list(userId: string, before?: string) {
    return this.prisma.notification.findMany({ where: { recipientId: userId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, type: true, entityId: true, readAt: true, createdAt: true, actor: { select: { tutor: { select: { displayName: true } } } } } });
  }
  async unreadCount(userId: string) { return { count: await this.prisma.notification.count({ where: { recipientId: userId, readAt: null } }) }; }
  async markRead(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({ where: { id, recipientId: userId, readAt: null }, data: { readAt: new Date() } });
    if (!result.count) {
      const exists = await this.prisma.notification.findFirst({ where: { id, recipientId: userId }, select: { id: true } });
      if (!exists) throw new NotFoundException("Notificação não encontrada.");
    }
    return { success: true };
  }
  async markAllRead(userId: string) { const result = await this.prisma.notification.updateMany({ where: { recipientId: userId, readAt: null }, data: { readAt: new Date() } }); return { updated: result.count }; }

  async eventFor(userId: string, entityId: string, types: string[]) {
    const notification = await this.prisma.notification.findFirst({ where: { recipientId: userId, entityId, type: { in: types as never[] } }, orderBy: { createdAt: "desc" }, select: { id: true, type: true, entityId: true, createdAt: true, readAt: true } });
    if (!notification) return null;
    const typeMap: Record<string, string> = { LIKE: "NEW_LIKE", PET_LIKE: "NEW_LIKE", FOLLOW: "NEW_LIKE", MATCH: "NEW_MATCH", MESSAGE: "NEW_MESSAGE", SUPER_MATCH: "SUPER_MATCH", CONNECTION_UPDATE: "SYSTEM_ALERT" };
    return { id: notification.id, type: typeMap[notification.type] ?? "SYSTEM_ALERT", title: notification.type === "MATCH" ? "Você tem um novo Match!" : notification.type === "MESSAGE" ? "Nova mensagem" : notification.type === "FOLLOW" ? "Novo seguidor" : "Nova interação", body: notification.type === "FOLLOW" ? "Um tutor começou a seguir um dos seus animais." : "Uma nova atividade está esperando por você.", referenceId: notification.entityId, createdAt: notification.createdAt.toISOString(), read: Boolean(notification.readAt) };
  }
}
