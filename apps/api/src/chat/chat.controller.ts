import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthenticatedRequest, JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ChatService } from "./chat.service";
import { ChatGateway } from "./chat.gateway";
import { SendMessageDto } from "./dto/send-message.dto";

@Controller("chat")
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService, private readonly gateway: ChatGateway) {}
  @Get("conversations") list(@Req() req: AuthenticatedRequest) { return this.chat.listThreads(req.user.sub); }
  @Get("conversations/:threadId/messages") history(@Req() req: AuthenticatedRequest, @Param("threadId") threadId: string, @Query("before") before?: string, @Query("limit") limit?: string) { return this.chat.history(req.user.sub, threadId, before, Number(limit) || 30); }
  @Post("conversations/:threadId/messages")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async send(@Req() req: AuthenticatedRequest, @Param("threadId") threadId: string, @Body() body: SendMessageDto) { const message = await this.chat.send(req.user.sub, threadId, body.body, body.idempotencyKey); await this.gateway.publishMessage(message); return message; }
  @Post("conversations/:threadId/read") read(@Req() req: AuthenticatedRequest, @Param("threadId") threadId: string) { return this.chat.markRead(req.user.sub, threadId); }
}
