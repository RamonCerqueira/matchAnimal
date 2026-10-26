import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

const REFRESH_DAYS = 30;
const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async register(input: RegisterDto) {
    const passwordHash = await hash(input.password, 12);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          privacyConsentAt: new Date(),
          privacyConsentVersion: "draft-2026-10-14",
          termsAcceptedAt: new Date(),
          termsVersion: "draft-2026-10-14",
          tutor: { create: { displayName: input.displayName.trim(), city: input.city.trim(), state: input.state, latitude: input.latitude, longitude: input.longitude } },
        },
        select: { id: true, email: true, type: true, tutor: { select: { displayName: true, city: true, state: true } } },
      });
      return { user, tokens: await this.issueSession(user.id, user.email) };
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        throw new ConflictException("Já existe uma conta com este e-mail.");
      }
      throw error;
    }
  }

  async login(input: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true, email: true, passwordHash: true, type: true, accountStatus: true, suspendedUntil: true, tutor: { select: { displayName: true, city: true, state: true } } } });
    if (!user || !(await compare(input.password, user.passwordHash))) throw new UnauthorizedException("E-mail ou senha incorretos.");
    if (user.accountStatus === "BANNED" || user.accountStatus === "SUSPENDED" && (!user.suspendedUntil || user.suspendedUntil > new Date())) throw new UnauthorizedException("Esta conta está suspensa. Entre em contato com o suporte.");
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return { user: safeUser, tokens: await this.issueSession(user.id, user.email) };
  }

  async refresh(token: string | undefined) {
    if (!token) throw new UnauthorizedException("Sessão expirada.");
    const session = await this.prisma.refreshSession.findFirst({ where: { tokenHash: tokenDigest(token), revokedAt: null, expiresAt: { gt: new Date() } }, include: { user: { select: { id: true, email: true, accountStatus: true, suspendedUntil: true } } } });
    if (!session) throw new UnauthorizedException("Sessão expirada. Entre novamente.");
    if (session.user.accountStatus === "BANNED" || session.user.accountStatus === "SUSPENDED" && (!session.user.suspendedUntil || session.user.suspendedUntil > new Date())) throw new UnauthorizedException("Esta conta está suspensa. Entre em contato com o suporte.");
    await this.prisma.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return { userId: session.user.id, email: session.user.email, tokens: await this.issueSession(session.user.id, session.user.email) };
  }

  async logout(token: string | undefined) {
    if (token) await this.prisma.refreshSession.updateMany({ where: { tokenHash: tokenDigest(token), revokedAt: null }, data: { revokedAt: new Date() } });
    return { success: true };
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, email: true } });
    if (!user) return { success: true };
    const token = randomBytes(32).toString("base64url");
    await this.prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + 45 * 60 * 1000) } });
    const webOrigin = (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",")[0].trim().replace(/\/$/, "");
    const resetUrl = `${webOrigin}/recuperar-senha?token=${encodeURIComponent(token)}`;
    const webhook = process.env.PASSWORD_RESET_WEBHOOK_URL;
    if (webhook) {
      try {
        const response = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.PASSWORD_RESET_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.PASSWORD_RESET_WEBHOOK_SECRET}` } : {}) }, body: JSON.stringify({ to: user.email, resetUrl, expiresInMinutes: 45 }) });
        if (!response.ok) console.error(`[auth] Provedor de recuperação retornou HTTP ${response.status}.`);
      } catch { console.error("[auth] Não foi possível alcançar o provedor de recuperação."); }
    } else if (process.env.NODE_ENV !== "production") {
      console.info(`[auth] Link de redefinição de senha para ${user.email}: ${resetUrl}`);
    }
    return { success: true };
  }

  async resetPassword(token: string, password: string) {
    const reset = await this.prisma.passwordResetToken.findFirst({ where: { tokenHash: tokenDigest(token), usedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, userId: true } });
    if (!reset) throw new UnauthorizedException("O link expirou ou já foi utilizado. Solicite uma nova recuperação.");
    const passwordHash = await hash(password, 12);
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({ where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (!consumed.count) throw new UnauthorizedException("O link expirou ou já foi utilizado. Solicite uma nova recuperação.");
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.refreshSession.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.passwordResetToken.updateMany({ where: { userId: reset.userId, id: { not: reset.id }, usedAt: null }, data: { usedAt: new Date() } });
    });
    return { success: true };
  }

  async changePassword(userId: string, currentPass: string, newPass: string) {
    if (!currentPass || !newPass || newPass.length < 8) {
      throw new BadRequestException("A nova senha deve ter no mínimo 8 caracteres.");
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true } });
    if (!user || !(await compare(currentPass, user.passwordHash))) {
      throw new UnauthorizedException("Sua senha atual está incorreta.");
    }
    const passwordHash = await hash(newPass, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, accessVersion: { increment: 1 } },
    });
    return { success: true, message: "Senha alterada com sucesso." };
  }

  async exportUserData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        type: true,
        createdAt: true,
        tutor: true,
        pets: {
          select: {
            id: true,
            name: true,
            species: true,
            breed: true,
            sex: true,
            size: true,
            bio: true,
            intent: true,
            city: true,
            state: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            posts: true,
            postComments: true,
            postLikes: true,
            savedPosts: true,
            followingPets: true,
          },
        },
      },
    });
    return user;
  }

  private async issueSession(userId: string, email: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accessVersion: true } });
    if (!user) throw new UnauthorizedException("Conta não encontrada.");
    const accessToken = await this.jwt.signAsync({ sub: userId, email, av: user.accessVersion }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: "15m" });
    const refreshToken = randomBytes(48).toString("base64url");
    await this.prisma.refreshSession.create({ data: { userId, tokenHash: tokenDigest(refreshToken), expiresAt: new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000) } });
    return { accessToken, refreshToken };
  }
}
