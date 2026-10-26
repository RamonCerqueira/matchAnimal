import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ReportDto } from "./dto/report.dto";
import { hasAdminArea, isAdministrativeAccount, type AdminArea, type AdminRole } from "../auth/admin-access";

@Injectable()
export class SafetyService {
  constructor(private readonly prisma: PrismaService) {}

  private assertModerator(userId: string, email: string) {
    if (!isAdministrativeAccount(userId, email)) throw new ForbiddenException("Acesso restrito à equipe de moderação.");
  }

  private async assertArea(userId: string, email: string, area: AdminArea) {
    if (isAdministrativeAccount(userId, email)) return;
    const role = await this.prisma.adminMembership.findUnique({ where: { userId }, select: { role: true, active: true } });
    if (!role?.active || !hasAdminArea(role.role, area)) throw new ForbiddenException("Sua função não permite esta operação administrativa.");
  }

  private async assertStaff(userId: string, email: string) {
    if (isAdministrativeAccount(userId, email)) return;
    const member = await this.prisma.adminMembership.findUnique({ where: { userId }, select: { active: true, role: true } });
    if (!member?.active || !["ADMIN", "COMMERCIAL", "FINANCE", "MODERATOR", "SUPPORT", "ANALYST"].includes(member.role as AdminRole)) throw new ForbiddenException("Acesso restrito à equipe administrativa.");
  }

  async moderationReports(userId: string, email: string, status = "OPEN") {
    await this.assertArea(userId, email, "MODERATION");
    if (! ["OPEN", "RESOLVED", "DISMISSED"].includes(status)) throw new BadRequestException("Filtro inválido.");
    return this.prisma.contentReport.findMany({ where: { status }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, targetType: true, targetId: true, reason: true, details: true, status: true, createdAt: true, reporter: { select: { tutor: { select: { displayName: true } } } } } });
  }

  async adminOverview(userId: string, email: string) {
    await this.assertStaff(userId, email);
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const [users, newUsers, pets, publicPets, matches, openReports, posts, partners, partnerAccounts, recentAccounts] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      this.prisma.pet.count({ where: { isActive: true } }),
      this.prisma.pet.count({ where: { isActive: true, isPublic: true } }),
      this.prisma.petMatch.count({ where: { status: "ACTIVE" } }),
      this.prisma.contentReport.count({ where: { status: "OPEN" } }),
      this.prisma.communityPost.count({ where: { moderation: "APPROVED", visibility: "PUBLIC" } }),
      this.prisma.user.count({ where: { type: { in: ["ORGANIZATION", "PROTECTOR", "PROFESSIONAL"] } } }),
      this.prisma.user.findMany({
        where: { type: { in: ["ORGANIZATION", "PROTECTOR", "PROFESSIONAL"] } },
        orderBy: { createdAt: "desc" }, take: 50,
        select: { id: true, email: true, type: true, createdAt: true, tutor: { select: { displayName: true, city: true, state: true } }, _count: { select: { pets: true } } },
      }),
      this.prisma.user.findMany({
        orderBy: { createdAt: "desc" }, take: 100,
        select: { id: true, email: true, type: true, createdAt: true, tutor: { select: { displayName: true, city: true, state: true } }, _count: { select: { pets: true } } },
      }),
    ]);
    return {
      metrics: { users, newUsersLast30Days: newUsers, activePets: pets, publicPets, activeMatches: matches, openReports, publicPosts: posts, partners },
      partners: partnerAccounts.map(({ id, email: accountEmail, type, createdAt, tutor, _count }) => ({ id, type, isAdministrator: isAdministrativeAccount(id, accountEmail), createdAt, displayName: tutor?.displayName ?? "Perfil sem nome", city: tutor?.city, state: tutor?.state, pets: _count.pets })),
      recentAccounts: recentAccounts.map(({ id, email: accountEmail, type, createdAt, tutor, _count }) => ({ id, type, isAdministrator: isAdministrativeAccount(id, accountEmail), createdAt, displayName: tutor?.displayName ?? "Perfil sem nome", city: tutor?.city, state: tutor?.state, pets: _count.pets })),
      billing: { provider: "stripe", configured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET), priceConfigured: Boolean(process.env.STRIPE_PRICE_ID) },
    };
  }

  async resolveReport(userId: string, email: string, reportId: string, status: "RESOLVED" | "DISMISSED") {
    await this.assertArea(userId, email, "MODERATION");
    const result = await this.prisma.contentReport.updateMany({ where: { id: reportId, status: "OPEN" }, data: { status } });
    if (!result.count) throw new NotFoundException("Denúncia não encontrada ou já analisada.");
    return { success: true, status };
  }

  async moderate(userId: string, email: string, targetType: string, targetId: string, status: "APPROVED" | "REMOVED") {
    await this.assertArea(userId, email, "MODERATION");
    if (targetType === "POST") {
      const result = await this.prisma.communityPost.updateMany({ where: { id: targetId }, data: { moderation: status } });
      if (!result.count) throw new NotFoundException("Publicação não encontrada.");
    } else if (targetType === "COMMENT") {
      const result = await this.prisma.postComment.updateMany({ where: { id: targetId }, data: { moderation: status } });
      if (!result.count) throw new NotFoundException("Comentário não encontrado.");
    } else if (targetType === "PET") {
      if (status !== "REMOVED") throw new BadRequestException("Um perfil removido precisa ser republicado pelo tutor.");
      const result = await this.prisma.pet.updateMany({ where: { id: targetId }, data: { isPublic: false } });
      if (!result.count) throw new NotFoundException("Perfil do animal não encontrado.");
    } else throw new BadRequestException("Este tipo de conteúdo não oferece ação de moderação automática.");
    return { success: true, status };
  }

  async block(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new BadRequestException("Você não pode bloquear sua própria conta.");
    const target = await this.prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } });
    if (!target) throw new NotFoundException("Conta não encontrada.");
    const block = await this.prisma.userBlock.upsert({ where: { blockerId_blockedId: { blockerId, blockedId } }, create: { blockerId, blockedId }, update: {}, select: { id: true, createdAt: true } });
    const pets = await this.prisma.pet.findMany({ where: { ownerId: { in: [blockerId, blockedId] } }, select: { id: true, ownerId: true } });
    const mine = pets.filter((pet) => pet.ownerId === blockerId).map((pet) => pet.id);
    const theirs = pets.filter((pet) => pet.ownerId === blockedId).map((pet) => pet.id);
    if (mine.length && theirs.length) {
      const matches = await this.prisma.petMatch.findMany({ where: { status: "ACTIVE", OR: mine.flatMap((a) => theirs.map((b) => ({ petAId: a < b ? a : b, petBId: a < b ? b : a }))) }, select: { id: true, petAId: true, petBId: true } });
      await this.prisma.$transaction(async (tx) => {
        if (matches.length) await tx.petMatch.updateMany({ where: { id: { in: matches.map((match) => match.id) } }, data: { status: "UNMATCHED" } });
        await tx.petLike.updateMany({ where: { OR: [{ fromPetId: { in: mine }, toPetId: { in: theirs } }, { fromPetId: { in: theirs }, toPetId: { in: mine } }] }, data: { status: "PASSED" } });
      });
    }
    return { success: true, block };
  }

  async blockPet(blockerId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, isPublic: true, isActive: true }, select: { ownerId: true } });
    if (!pet) throw new NotFoundException("Perfil não encontrado.");
    return this.block(blockerId, pet.ownerId);
  }

  async report(reporterId: string, input: ReportDto) {
    if (input.targetType === "USER" && input.targetId === reporterId) throw new BadRequestException("Você não pode denunciar sua própria conta.");
    const exists = input.targetType === "USER"
      ? await this.prisma.user.findUnique({ where: { id: input.targetId }, select: { id: true } })
      : input.targetType === "PET"
        ? await this.prisma.pet.findUnique({ where: { id: input.targetId }, select: { id: true } })
        : input.targetType === "MESSAGE"
          ? await this.prisma.chatMessage.findUnique({ where: { id: input.targetId }, select: { id: true } })
          : input.targetType === "COMMENT"
            ? await this.prisma.postComment.findUnique({ where: { id: input.targetId }, select: { id: true } })
            : await this.prisma.communityPost.findUnique({ where: { id: input.targetId }, select: { id: true } });
    if (!exists) throw new NotFoundException("Conteúdo não encontrado.");
    return this.prisma.contentReport.create({ data: { reporterId, targetType: input.targetType, targetId: input.targetId, reason: input.reason.trim(), details: input.details?.trim() || null }, select: { id: true, status: true, createdAt: true } });
  }

  async listBlockedUsers(userId: string) {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        blocked: {
          select: {
            id: true,
            tutor: {
              select: {
                displayName: true,
                profilePhotoUrl: true,
                city: true,
                state: true,
              },
            },
          },
        },
      },
    });
    return blocks.map((b) => ({
      id: b.id,
      blockedUserId: b.blocked.id,
      displayName: b.blocked.tutor?.displayName ?? "Tutor bloqueado",
      profilePhotoUrl: b.blocked.tutor?.profilePhotoUrl ?? null,
      city: b.blocked.tutor?.city ?? null,
      state: b.blocked.tutor?.state ?? null,
      createdAt: b.createdAt.toISOString(),
    }));
  }

  async unblock(blockerId: string, blockedId: string) {
    const result = await this.prisma.userBlock.deleteMany({
      where: { blockerId, blockedId },
    });
    return { success: true, unblocked: result.count > 0 };
  }
}

