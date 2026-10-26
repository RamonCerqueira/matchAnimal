import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { hasAdminArea, isAdministrativeAccount, type AdminArea } from "../auth/admin-access";
import { PrismaService } from "../prisma/prisma.service";
import type { AddOperationMessageDto, CreateOperationCaseDto, CreatePackageDto, SetAccountStatusDto, SetAdminRoleDto, UpdateOperationCaseDto, UpdateOperationalSettingsDto } from "./admin-operations.dto";

@Injectable()
export class AdminOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assert(userId: string, email: string, area: AdminArea) {
    if (isAdministrativeAccount(userId, email)) return;
    const member = await this.prisma.adminMembership.findUnique({ where: { userId }, select: { active: true, role: true } });
    if (!member?.active || !hasAdminArea(member.role, area)) throw new ForbiddenException("Sua função não permite esta operação.");
  }
  private recordAudit(tx: Prisma.TransactionClient, actorId: string, action: string, targetType: string, targetId: string, metadata?: Prisma.InputJsonObject) { return tx.adminAuditLog.create({ data: { actorId, action, targetType, targetId, metadata } }); }

  async team(actorId: string, email: string) {
    await this.assert(actorId, email, "TEAM");
    return this.prisma.adminMembership.findMany({ where: { active: true }, orderBy: { updatedAt: "desc" }, take: 100 }).then(async (members) => {
      const users = await this.prisma.user.findMany({ where: { id: { in: members.map(({ userId }) => userId) } }, select: { id: true, email: true, tutor: { select: { displayName: true } } } });
      const byId = new Map(users.map((user) => [user.id, user]));
      return members.map((member) => ({ ...member, user: byId.get(member.userId) ?? null }));
    });
  }
  async setRole(actorId: string, email: string, input: SetAdminRoleDto) {
    await this.assert(actorId, email, "TEAM");
    const target = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() }, select: { id: true, email: true } });
    if (!target) throw new NotFoundException("Crie primeiro a conta da pessoa que receberá o acesso.");
    if (isAdministrativeAccount(target.id, target.email)) throw new BadRequestException("A conta administradora principal é gerenciada pela configuração segura do servidor.");
    return this.prisma.$transaction(async (tx) => {
      const data = { role: input.role, active: input.active ?? true };
      const member = await tx.adminMembership.upsert({ where: { userId: target.id }, create: { userId: target.id, ...data }, update: data });
      await this.recordAudit(tx, actorId, "ADMIN_ROLE_SET", "ADMIN_MEMBERSHIP", target.id, { role: member.role, active: member.active });
      return { ...member, user: target };
    });
  }
  async removeRole(actorId: string, email: string, userId: string) {
    await this.assert(actorId, email, "TEAM");
    const member = await this.prisma.adminMembership.findUnique({ where: { userId } });
    if (!member) throw new NotFoundException("Acesso administrativo não encontrado.");
    await this.prisma.$transaction(async (tx) => { await tx.adminMembership.update({ where: { userId }, data: { active: false } }); await this.recordAudit(tx, actorId, "ADMIN_ROLE_REVOKED", "ADMIN_MEMBERSHIP", userId, { role: member.role }); });
    return { success: true };
  }

  async users(actorId: string, email: string, options: { q?: string; status?: string; cursor?: string; limit?: number }) {
    await this.assert(actorId, email, "ACCOUNTS");
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 30)); const q = options.q?.trim().slice(0, 100);
    const rows = await this.prisma.user.findMany({ where: { ...(options.status && options.status !== "ALL" ? { accountStatus: options.status } : {}), ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { tutor: { displayName: { contains: q, mode: "insensitive" } } }, { tutor: { city: { contains: q, mode: "insensitive" } } }] } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}), take: limit + 1, select: { id: true, email: true, type: true, accountStatus: true, suspendedUntil: true, createdAt: true, lastSeenAt: true, tutor: { select: { displayName: true, city: true, state: true } }, _count: { select: { pets: true, reportsMade: true, posts: true, adoptionApplications: true } } } });
    const hasMore = rows.length > limit; const items = rows.slice(0, limit).map(({ email: address, ...user }) => ({ ...user, email: address, isAdministrator: isAdministrativeAccount(user.id, address) }));
    return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }
  async setAccountStatus(actorId: string, actorEmail: string, userId: string, input: SetAccountStatusDto) {
    await this.assert(actorId, actorEmail, "ACCOUNTS");
    if (userId === actorId) throw new BadRequestException("Você não pode suspender a própria conta.");
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!target) throw new NotFoundException("Conta não encontrada.");
    if (isAdministrativeAccount(target.id, target.email)) throw new BadRequestException("Use a configuração protegida do administrador principal para alterar esse acesso.");
    const suspendedUntil = input.status === "SUSPENDED" && input.durationHours ? new Date(Date.now() + input.durationHours * 3_600_000) : input.status === "SUSPENDED" ? null : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { accountStatus: input.status, suspendedUntil, accessVersion: { increment: 1 } } });
      await tx.refreshSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
      await tx.operationCase.create({ data: { kind: "INCIDENT", title: `Conta ${input.status === "ACTIVE" ? "reativada" : input.status === "BANNED" ? "banida" : "suspensa"}`, description: input.reason, userId, status: "CLOSED", createdById: actorId } });
      await this.recordAudit(tx, actorId, "ACCOUNT_STATUS_CHANGED", "USER", userId, { status: input.status, suspendedUntil: suspendedUntil?.toISOString() ?? null, reason: input.reason });
    });
    return { success: true, status: input.status, suspendedUntil };
  }

  async listCases(actorId: string, email: string, kind?: string, status?: string) {
    await this.assert(actorId, email, "SUPPORT");
    return this.prisma.operationCase.findMany({ where: { ...(kind && kind !== "ALL" ? { kind } : {}), ...(status && status !== "ALL" ? { status } : {}) }, orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { updatedAt: "desc" }], take: 200, include: { messages: { orderBy: { createdAt: "asc" }, take: 50 }, _count: { select: { messages: true } } } });
  }
  async createCase(actorId: string, email: string, input: CreateOperationCaseDto) {
    await this.assert(actorId, email, "SUPPORT");
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && !Number.isFinite(dueAt.getTime())) throw new BadRequestException("Prazo inválido.");
    if (input.userId && !await this.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } })) throw new NotFoundException("Conta associada não encontrada.");
    if (input.partnerId && !await this.prisma.commercialPartner.findUnique({ where: { id: input.partnerId }, select: { id: true } })) throw new NotFoundException("Parceiro associado não encontrado.");
    const item = await this.prisma.operationCase.create({ data: { ...input, dueAt, createdById: actorId } });
    await this.prisma.adminAuditLog.create({ data: { actorId, action: "OPERATION_CASE_CREATED", targetType: "OPERATION_CASE", targetId: item.id, metadata: { kind: item.kind, priority: item.priority } } });
    return item;
  }
  async updateCase(actorId: string, email: string, id: string, input: UpdateOperationCaseDto) {
    await this.assert(actorId, email, "SUPPORT");
    if (!await this.prisma.operationCase.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException("Atendimento não encontrado.");
    const dueAt = input.dueAt === null ? null : input.dueAt ? new Date(input.dueAt) : undefined;
    if (dueAt && !Number.isFinite(dueAt.getTime())) throw new BadRequestException("Prazo inválido.");
    if (input.assigneeId && !await this.prisma.adminMembership.findFirst({ where: { userId: input.assigneeId, active: true }, select: { userId: true } })) throw new BadRequestException("A pessoa atribuída não pertence à equipe ativa.");
    const updated = await this.prisma.operationCase.update({ where: { id }, data: { ...input, dueAt }, include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } } });
    await this.prisma.adminAuditLog.create({ data: { actorId, action: "OPERATION_CASE_UPDATED", targetType: "OPERATION_CASE", targetId: id, metadata: { fields: Object.keys(input), status: updated.status } } });
    return updated;
  }
  async addMessage(actorId: string, email: string, id: string, input: AddOperationMessageDto) {
    await this.assert(actorId, email, "SUPPORT");
    if (!await this.prisma.operationCase.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException("Atendimento não encontrado.");
    return this.prisma.operationMessage.create({ data: { caseId: id, authorId: actorId, body: input.body.trim(), internal: input.internal ?? true } });
  }

  async analytics(actorId: string, email: string, days = 30) {
    await this.assert(actorId, email, "ANALYTICS");
    const window = Math.max(7, Math.min(365, Number(days) || 30)); const since = new Date(); since.setUTCHours(0, 0, 0, 0); since.setUTCDate(since.getUTCDate() - window + 1);
    const [users, recentlyActive, pets, matches, applications, reports, publicPosts, events, invoiceRows, dailyUsers, dailyRevenue, overdue, upcomingRenewals] = await Promise.all([
      this.prisma.user.count(), this.prisma.userActivityDay.findMany({ where: { day: { gte: since } }, distinct: ["userId"], select: { userId: true } }), this.prisma.pet.count({ where: { isActive: true } }), this.prisma.petMatch.count({ where: { status: "ACTIVE" } }), this.prisma.adoptionApplication.count({ where: { status: "APPROVED" } }), this.prisma.contentReport.count({ where: { status: "OPEN" } }), this.prisma.communityPost.count({ where: { moderation: "APPROVED", visibility: "PUBLIC" } }), this.prisma.petEvent.count({ where: { isCancelled: false, startsAt: { gte: new Date() } } }),
      this.prisma.commercialInvoice.findMany({ select: { status: true, amountCents: true, receivedCents: true, refundedCents: true } }),
      this.prisma.$queryRaw<Array<{ day: Date; count: number }>>`SELECT "day", COUNT(DISTINCT "userId")::int AS "count" FROM "UserActivityDay" WHERE "day" >= ${since} GROUP BY "day" ORDER BY "day"`,
      this.prisma.$queryRaw<Array<{ day: Date; cents: number }>>`SELECT DATE("occurredAt") AS "day", SUM("amountCents")::int AS "cents" FROM "FinancialEntry" WHERE "kind" = 'PAYMENT' AND "occurredAt" >= ${since} GROUP BY DATE("occurredAt") ORDER BY DATE("occurredAt")`,
       this.prisma.commercialInvoice.findMany({ where: { status: "PENDING", dueAt: { lt: new Date() } }, take: 100, select: { id: true, description: true, amountCents: true, receivedCents: true, dueAt: true, partner: { select: { businessName: true } } }, orderBy: { dueAt: "asc" } }),
      this.prisma.adCampaign.findMany({ where: { status: "PUBLISHED", endsAt: { gte: new Date(), lte: new Date(Date.now() + 30 * 86_400_000) } }, take: 100, include: { partner: { select: { businessName: true } }, invoice: { select: { status: true } } }, orderBy: { endsAt: "asc" } }),
    ]);
    const invoiceTotals = ["PENDING", "PAID", "CANCELED", "REFUNDED"].map((status) => { const rows = invoiceRows.filter((invoice) => invoice.status === status); const amount = rows.reduce((sum, invoice) => sum + (status === "PENDING" ? invoice.amountCents - invoice.receivedCents : status === "PAID" ? invoice.receivedCents : status === "REFUNDED" ? invoice.refundedCents : invoice.amountCents), 0); return { status, _sum: { amountCents: amount }, _count: rows.length }; });
    return { periodDays: window, metrics: { users, activeUsers: recentlyActive.length, activePets: pets, activeMatches: matches, completedAdoptions: applications, openReports: reports, publicPosts, upcomingEvents: events }, invoices: invoiceTotals, activeUsersByDay: dailyUsers, grossRevenueByDay: dailyRevenue, overdueInvoices: overdue, campaignsExpiring: upcomingRenewals };
  }

  async settings(actorId: string, email: string) { await this.assert(actorId, email, "SETTINGS"); return this.prisma.operationalSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} }); }
  async updateSettings(actorId: string, email: string, input: UpdateOperationalSettingsDto) {
    await this.assert(actorId, email, "SETTINGS");
    const saved = await this.prisma.operationalSettings.upsert({ where: { id: "default" }, create: { id: "default", ...input }, update: input });
    await this.prisma.adminAuditLog.create({ data: { actorId, action: "OPERATIONAL_SETTINGS_UPDATED", targetType: "SETTINGS", targetId: "default", metadata: input as Prisma.InputJsonObject } }); return saved;
  }
  async packages(actorId: string, email: string) { await this.assert(actorId, email, "COMMERCIAL"); return this.prisma.commercialPackage.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] }); }
  async createPackage(actorId: string, email: string, input: CreatePackageDto) { await this.assert(actorId, email, "SETTINGS"); const item = await this.prisma.commercialPackage.create({ data: input }); await this.prisma.adminAuditLog.create({ data: { actorId, action: "COMMERCIAL_PACKAGE_CREATED", targetType: "PACKAGE", targetId: item.id } }); return item; }
  async setPackageActive(actorId: string, email: string, id: string, active: boolean) { await this.assert(actorId, email, "SETTINGS"); const item = await this.prisma.commercialPackage.update({ where: { id }, data: { active } }); await this.prisma.adminAuditLog.create({ data: { actorId, action: active ? "PACKAGE_ACTIVATED" : "PACKAGE_ARCHIVED", targetType: "PACKAGE", targetId: id } }); return item; }
  async audit(actorId: string, email: string, q?: string, cursor?: string) {
    await this.assert(actorId, email, "ANALYTICS"); const search = q?.trim().slice(0, 100);
    const rows = await this.prisma.adminAuditLog.findMany({ where: search ? { OR: [{ action: { contains: search, mode: "insensitive" } }, { targetType: { contains: search, mode: "insensitive" } }, { targetId: { contains: search, mode: "insensitive" } }, { actorId: { contains: search, mode: "insensitive" } }] } : {}, orderBy: { createdAt: "desc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 51 });
    const hasMore = rows.length > 50; return { items: rows.slice(0, 50), nextCursor: hasMore ? rows[49]?.id ?? null : null };
  }
}
