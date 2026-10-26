import { Body, Controller, Get, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import { IsBoolean, IsEmail, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { AuthenticatedRequest, JwtAuthGuard } from "./jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { isAdministrativeAccount } from "./admin-access";

const isNativeOrigin = (request: Request) => ["https://localhost", "capacitor://localhost"].includes(request.get("origin") ?? "");
const authCookieOptions = (request: Request, path: string, maxAge: number) => {
  const native = isNativeOrigin(request);
  return { httpOnly: true, secure: process.env.NODE_ENV === "production" || native, sameSite: native ? "none" as const : "lax" as const, path, maxAge };
};
const accessCookie = (response: Response, request: Request, token: string) => response.cookie("access_token", token, authCookieOptions(request, "/", 15 * 60 * 1000));
const refreshCookie = (response: Response, request: Request, token: string) => response.cookie("refresh_token", token, authCookieOptions(request, "/api/auth", 30 * 24 * 60 * 60 * 1000));
const clearCookies = (response: Response) => { response.clearCookie("access_token", { path: "/" }); response.clearCookie("refresh_token", { path: "/api/auth" }); };

class UpdateTutorSettingsDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) displayName?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(2) state?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsBoolean() publicProfile?: boolean;
  @IsOptional() @IsBoolean() notificationsEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(500) profilePhotoUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) bio?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(500) matchRadiusKm?: number;
  @IsOptional() @IsString() @MaxLength(50) preferredSpecies?: string;
  @IsOptional() @IsBoolean() notifyMessages?: boolean;
  @IsOptional() @IsBoolean() notifyMatches?: boolean;
  @IsOptional() @IsBoolean() notifyCommunity?: boolean;
  @IsOptional() @IsBoolean() notifyEvents?: boolean;
}
class ChangePasswordDto {
  @IsString() @MinLength(6) @MaxLength(72) currentPassword!: string;
  @IsString() @MinLength(8) @MaxLength(72) newPassword!: string;
}
class PasswordResetRequestDto { @IsEmail() @MaxLength(254) email!: string; }
class PasswordResetCompleteDto { @IsString() @MinLength(32) @MaxLength(200) token!: string; @IsString() @MinLength(8) @MaxLength(72) password!: string; }

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() body: RegisterDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.register(body);
    accessCookie(response, request, result.tokens.accessToken); refreshCookie(response, request, result.tokens.refreshToken);
    return { user: result.user };
  }

  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() body: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body);
    accessCookie(response, request, result.tokens.accessToken); refreshCookie(response, request, result.tokens.refreshToken);
    return { user: result.user };
  }

  @Post("refresh")
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    try {
      const result = await this.auth.refresh(request.cookies?.refresh_token as string | undefined);
      accessCookie(response, request, result.tokens.accessToken); refreshCookie(response, request, result.tokens.refreshToken);
      return { success: true };
    } catch (error) { clearCookies(response); throw error; }
  }

  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.refresh_token as string | undefined); clearCookies(response); return { success: true };
  }

  @Post("password-reset/request")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestPasswordReset(@Body() body: PasswordResetRequestDto) { return this.auth.requestPasswordReset(body.email); }

  @Post("password-reset/complete")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  completePasswordReset(@Body() body: PasswordResetCompleteDto) { return this.auth.resetPassword(body.token, body.password); }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() request: AuthenticatedRequest) {
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: {
        id: true,
        email: true,
        type: true,
        privacyConsentAt: true,
        termsAcceptedAt: true,
        tutor: {
          select: {
            displayName: true,
            city: true,
            state: true,
            latitude: true,
            longitude: true,
            isPublic: true,
            notificationOptIn: true,
            profilePhotoUrl: true,
            bio: true,
            phone: true,
            matchRadiusKm: true,
            preferredSpecies: true,
            notifyMessages: true,
            notifyMatches: true,
            notifyCommunity: true,
            notifyEvents: true,
          },
        },
      },
    });
    if (!user) return null;
    const isAdministrator = isAdministrativeAccount(user.id, user.email);
    const membership = isAdministrator ? null : await this.prisma.adminMembership.findUnique({ where: { userId: user.id }, select: { active: true, role: true } });
    const adminRole = isAdministrator ? "ADMIN" : membership?.active ? membership.role : null;
    return { ...user, adminRole, adminAreas: request.user.adminAreas ?? [], isModerator: isAdministrator || !!adminRole, isAdministrator };
  }

  @UseGuards(JwtAuthGuard)
  @Patch("me")
  async updateMe(@Req() request: AuthenticatedRequest, @Body() body: UpdateTutorSettingsDto) {
    const {
      displayName,
      city,
      state,
      latitude,
      longitude,
      publicProfile,
      notificationsEnabled,
      profilePhotoUrl,
      bio,
      phone,
      matchRadiusKm,
      preferredSpecies,
      notifyMessages,
      notifyMatches,
      notifyCommunity,
      notifyEvents,
    } = body;
    const updated = await this.prisma.tutorProfile.update({
      where: { userId: request.user.sub },
      data: {
        ...(displayName !== undefined ? { displayName: displayName.trim() } : {}),
        ...(city !== undefined ? { city: city.trim() } : {}),
        ...(state !== undefined ? { state: state.toUpperCase() } : {}),
        ...(latitude !== undefined ? { latitude } : {}),
        ...(longitude !== undefined ? { longitude } : {}),
        ...(publicProfile !== undefined ? { isPublic: publicProfile } : {}),
        ...(notificationsEnabled !== undefined ? { notificationOptIn: notificationsEnabled } : {}),
        ...(profilePhotoUrl !== undefined ? { profilePhotoUrl: profilePhotoUrl.trim() || null } : {}),
        ...(bio !== undefined ? { bio: bio.trim() || null } : {}),
        ...(phone !== undefined ? { phone: phone.trim() || null } : {}),
        ...(matchRadiusKm !== undefined ? { matchRadiusKm } : {}),
        ...(preferredSpecies !== undefined ? { preferredSpecies } : {}),
        ...(notifyMessages !== undefined ? { notifyMessages } : {}),
        ...(notifyMatches !== undefined ? { notifyMatches } : {}),
        ...(notifyCommunity !== undefined ? { notifyCommunity } : {}),
        ...(notifyEvents !== undefined ? { notifyEvents } : {}),
      },
      select: {
        displayName: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
        isPublic: true,
        notificationOptIn: true,
        profilePhotoUrl: true,
        bio: true,
        phone: true,
        matchRadiusKm: true,
        preferredSpecies: true,
        notifyMessages: true,
        notifyMatches: true,
        notifyCommunity: true,
        notifyEvents: true,
      },
    });
    if (city !== undefined || state !== undefined || latitude !== undefined || longitude !== undefined) {
      const searchCell = updated.city && updated.state ? `${updated.city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim()}:${updated.state}` : null;
      await this.prisma.pet.updateMany({ where: { ownerId: request.user.sub, isActive: true }, data: { city: updated.city, state: updated.state, latitude: updated.latitude, longitude: updated.longitude, searchCell } });
    }
    return updated;
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(@Req() request: AuthenticatedRequest, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(request.user.sub, body.currentPassword, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get("export-data")
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  async exportUserData(@Req() request: AuthenticatedRequest) {
    return this.auth.exportUserData(request.user.sub);
  }
}
