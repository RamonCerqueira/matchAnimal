import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn } from "class-validator";
import { AuthenticatedRequest, JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ReportDto } from "./dto/report.dto";
import { SafetyService } from "./safety.service";

class ResolveReportDto { @IsIn(["RESOLVED", "DISMISSED"]) status!: "RESOLVED" | "DISMISSED"; }
class ModerateContentDto { @IsIn(["APPROVED", "REMOVED"]) status!: "APPROVED" | "REMOVED"; }

@Controller("safety")
@UseGuards(JwtAuthGuard)
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}
  @Get("blocks") listBlocks(@Req() req: AuthenticatedRequest) { return this.safety.listBlockedUsers(req.user.sub); }
  @Post("users/:userId/block") block(@Req() req: AuthenticatedRequest, @Param("userId") userId: string) { return this.safety.block(req.user.sub, userId); }
  @Delete("users/:userId/block") unblock(@Req() req: AuthenticatedRequest, @Param("userId") userId: string) { return this.safety.unblock(req.user.sub, userId); }
  @Post("pets/:petId/block") blockPet(@Req() req: AuthenticatedRequest, @Param("petId") petId: string) { return this.safety.blockPet(req.user.sub, petId); }
  @Post("reports") report(@Req() req: AuthenticatedRequest, @Body() body: ReportDto) { return this.safety.report(req.user.sub, body); }
  @Get("admin/reports") reports(@Req() req: AuthenticatedRequest, @Query("status") status?: string) { return this.safety.moderationReports(req.user.sub, req.user.email, status); }
  @Get("admin/overview") overview(@Req() req: AuthenticatedRequest) { return this.safety.adminOverview(req.user.sub, req.user.email); }
  @Patch("admin/reports/:id") resolve(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: ResolveReportDto) { return this.safety.resolveReport(req.user.sub, req.user.email, id, body.status); }
  @Patch("admin/content/:type/:id") moderate(@Req() req: AuthenticatedRequest, @Param("type") type: string, @Param("id") id: string, @Body() body: ModerateContentDto) { return this.safety.moderate(req.user.sub, req.user.email, type, id, body.status); }
}
