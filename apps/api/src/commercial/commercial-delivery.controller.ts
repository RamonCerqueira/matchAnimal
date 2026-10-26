import { BadRequestException, Controller, Get, Header, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AdPlacement } from "../generated/prisma/client";
import { AuthenticatedRequest, JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CommercialDeliveryService } from "./commercial-delivery.service";

const placements = new Set<string>(["HOME_BANNER", "COMMUNITY_FEED", "EXPLORE_CARD"]);

@Controller("commercial")
@UseGuards(JwtAuthGuard)
export class CommercialDeliveryController {
  constructor(private readonly delivery: CommercialDeliveryService) {}

  @Get("placements/:placement")
  @Header("Cache-Control", "private, no-store")
  list(@Req() request: AuthenticatedRequest, @Param("placement") placement: string) {
    if (!placements.has(placement)) throw new BadRequestException("Espaço de anúncio inválido.");
    return this.delivery.placements(request.user.sub, placement as AdPlacement);
  }

  @Post("campaigns/:campaignId/impression")
  @HttpCode(204)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async impression(@Req() request: AuthenticatedRequest, @Param("campaignId") campaignId: string) {
    await this.delivery.recordInteraction(request.user.sub, campaignId, "IMPRESSION");
  }

  @Post("campaigns/:campaignId/click")
  @HttpCode(204)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async click(@Req() request: AuthenticatedRequest, @Param("campaignId") campaignId: string) {
    await this.delivery.recordInteraction(request.user.sub, campaignId, "CLICK");
  }
}
