import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { hasAdminArea, isAdministrativeAccount, type AdminArea } from "./admin-access";

export interface AuthenticatedRequest extends Request {
  user: { sub: string; email: string; av?: number; adminRole?: string; adminAreas?: string[] };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly activityWriteAt = new Map<string, number>();
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieToken = request.cookies?.access_token as string | undefined;
    const header = request.headers.authorization;
    const bearerToken = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const token = cookieToken ?? bearerToken;
    if (!token) throw new UnauthorizedException("Entre na sua conta para continuar.");
    try {
      request.user = await this.jwt.verifyAsync<{ sub: string; email: string; av?: number }>(token, { secret: process.env.JWT_ACCESS_SECRET });
      if (!request.user.sub || !request.user.email) throw new Error("invalid token claims");
      const account = await this.prisma.user.findUnique({ where: { id: request.user.sub }, select: { accountStatus: true, suspendedUntil: true, accessVersion: true, email: true } });
      if (!account || account.accessVersion !== (request.user.av ?? 0) || account.accountStatus === "BANNED" || account.accountStatus === "SUSPENDED" && (!account.suspendedUntil || account.suspendedUntil > new Date())) throw new Error("account access revoked");
      request.user.email = account.email;
      const root = isAdministrativeAccount(request.user.sub, account.email);
      const membership = root ? null : await this.prisma.adminMembership.findUnique({ where: { userId: request.user.sub }, select: { role: true, active: true } });
      const role = root ? "ADMIN" : membership?.active ? membership.role : undefined;
      request.user.adminRole = role;
      const adminAreas: AdminArea[] = ["COMMERCIAL", "FINANCE", "MODERATION", "ACCOUNTS", "SUPPORT", "ANALYTICS", "TEAM", "SETTINGS"];
      request.user.adminAreas = adminAreas.filter((area) => hasAdminArea(role, area));
      const now = Date.now();
      if ((this.activityWriteAt.get(request.user.sub) ?? 0) < now - 60_000) {
        this.activityWriteAt.set(request.user.sub, now);
        const day = new Date(); day.setUTCHours(0, 0, 0, 0);
        void this.prisma.userActivityDay.createMany({ data: { userId: request.user.sub, day }, skipDuplicates: true }).then(() => this.prisma.user.updateMany({ where: { id: request.user.sub, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now - 24 * 60 * 60_000) } }] }, data: { lastSeenAt: new Date(now) } })).catch(() => this.activityWriteAt.delete(request.user.sub));
        if (this.activityWriteAt.size > 10_000) for (const [id, timestamp] of this.activityWriteAt) if (timestamp < now - 24 * 60 * 60_000) this.activityWriteAt.delete(id);
      }
      return true;
    } catch {
      throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
    }
  }
}
