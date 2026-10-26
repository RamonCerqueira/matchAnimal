import { Controller, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { AuthenticatedRequest, JwtAuthGuard } from "../auth/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Query("before") before?: string) { return this.notifications.list(req.user.sub, before); }
  @Get("unread-count") unread(@Req() req: AuthenticatedRequest) { return this.notifications.unreadCount(req.user.sub); }
  @Patch(":id/read") read(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.notifications.markRead(req.user.sub, id); }
  @Patch("read-all") readAll(@Req() req: AuthenticatedRequest) { return this.notifications.markAllRead(req.user.sub); }
}
