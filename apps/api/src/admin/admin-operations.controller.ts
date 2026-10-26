import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthenticatedRequest, JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CommercialAdminGuard } from "../commercial/commercial-admin.guard";
import { AdminOperationsService } from "./admin-operations.service";
import { AddOperationMessageDto, CreateOperationCaseDto, CreatePackageDto, SetAccountStatusDto, SetAdminRoleDto, UpdateOperationCaseDto, UpdateOperationalSettingsDto } from "./admin-operations.dto";

@Controller("commercial/admin")
@UseGuards(JwtAuthGuard, CommercialAdminGuard)
export class AdminOperationsController {
  constructor(private readonly operations: AdminOperationsService) {}
  @Get("team") team(@Req() req: AuthenticatedRequest) { return this.operations.team(req.user.sub, req.user.email); }
  @Post("team") setRole(@Req() req: AuthenticatedRequest, @Body() body: SetAdminRoleDto) { return this.operations.setRole(req.user.sub, req.user.email, body); }
  @Delete("team/:userId") removeRole(@Req() req: AuthenticatedRequest, @Param("userId") id: string) { return this.operations.removeRole(req.user.sub, req.user.email, id); }
  @Get("users") users(@Req() req: AuthenticatedRequest, @Query("q") q?: string, @Query("status") status?: string, @Query("cursor") cursor?: string, @Query("limit") limit?: string) { return this.operations.users(req.user.sub, req.user.email, { q, status, cursor, limit: Number(limit) }); }
  @Patch("users/:id/status") status(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: SetAccountStatusDto) { return this.operations.setAccountStatus(req.user.sub, req.user.email, id, body); }
  @Get("cases") cases(@Req() req: AuthenticatedRequest, @Query("kind") kind?: string, @Query("status") status?: string) { return this.operations.listCases(req.user.sub, req.user.email, kind, status); }
  @Post("cases") createCase(@Req() req: AuthenticatedRequest, @Body() body: CreateOperationCaseDto) { return this.operations.createCase(req.user.sub, req.user.email, body); }
  @Patch("cases/:id") updateCase(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdateOperationCaseDto) { return this.operations.updateCase(req.user.sub, req.user.email, id, body); }
  @Post("cases/:id/messages") message(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: AddOperationMessageDto) { return this.operations.addMessage(req.user.sub, req.user.email, id, body); }
  @Get("analytics") analytics(@Req() req: AuthenticatedRequest, @Query("days") days?: string) { return this.operations.analytics(req.user.sub, req.user.email, Number(days)); }
  @Get("settings") settings(@Req() req: AuthenticatedRequest) { return this.operations.settings(req.user.sub, req.user.email); }
  @Patch("settings") updateSettings(@Req() req: AuthenticatedRequest, @Body() body: UpdateOperationalSettingsDto) { return this.operations.updateSettings(req.user.sub, req.user.email, body); }
  @Get("packages") packages(@Req() req: AuthenticatedRequest) { return this.operations.packages(req.user.sub, req.user.email); }
  @Post("packages") createPackage(@Req() req: AuthenticatedRequest, @Body() body: CreatePackageDto) { return this.operations.createPackage(req.user.sub, req.user.email, body); }
  @Patch("packages/:id/active") active(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body("active") active: boolean) { return this.operations.setPackageActive(req.user.sub, req.user.email, id, active); }
  @Get("audit") audit(@Req() req: AuthenticatedRequest, @Query("q") q?: string, @Query("cursor") cursor?: string) { return this.operations.audit(req.user.sub, req.user.email, q, cursor); }
}
