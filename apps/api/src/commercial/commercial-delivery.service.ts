import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac } from "node:crypto";
import type { AdAsset, AdInteractionKind, AdPlacement, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type CampaignViewerRegion = { city: string | null; state: string | null };
export type CampaignEligibility = {
  status: string;
  approvalStatus: string;
  startsAt: Date;
  endsAt: Date;
  amountCents: number;
  targetCity: string | null;
  targetState: string | null;
  partner: { status: string };
  invoice: { status: string; amountCents: number } | null;
};

function normalizedRegion(value: string | null) {
  return value?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR") ?? "";
}

/** One eligibility rule for delivery, protected media and interaction recording. */
export function isCampaignEligible(campaign: CampaignEligibility, viewer: CampaignViewerRegion, now: Date): boolean {
  const currentTime = now.getTime();
  const startsAt = campaign.startsAt.getTime();
  const endsAt = campaign.endsAt.getTime();
  if (!Number.isFinite(currentTime) || !Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return false;
  if (campaign.status !== "PUBLISHED" || campaign.approvalStatus !== "APPROVED" || campaign.partner.status !== "ACTIVE") return false;
  if (startsAt > currentTime || endsAt <= currentTime || endsAt <= startsAt) return false;
  if (!Number.isSafeInteger(campaign.amountCents) || campaign.amountCents < 0) return false;
  if (campaign.amountCents > 0 && (campaign.invoice?.status !== "PAID" || campaign.invoice.amountCents !== campaign.amountCents)) return false;

  const targetState = normalizedRegion(campaign.targetState);
  const targetCity = normalizedRegion(campaign.targetCity);
  if (targetState && targetState !== normalizedRegion(viewer.state)) return false;
  // A city without its UF is ambiguous; never broaden an invalid target.
  if (targetCity && (!targetState || targetCity !== normalizedRegion(viewer.city))) return false;
  return true;
}

const campaignSelect = {
  id: true, headline: true, body: true, ctaLabel: true, destinationUrl: true, placement: true,
  status: true, approvalStatus: true, startsAt: true, endsAt: true, amountCents: true, targetCity: true, targetState: true,
  partner: { select: { status: true, businessName: true } },
  invoice: { select: { status: true, amountCents: true } },
  asset: true,
} satisfies Prisma.AdCampaignSelect;

export type SponsoredCampaign = {
  id: string;
  headline: string;
  body: string | null;
  ctaLabel: string;
  destinationUrl: string;
  placement: AdPlacement;
  endsAt: string;
  partner: { businessName: string };
  asset: { id: string; url: string; mediaType: string; mimeType: string; width: number; height: number; durationSeconds: number | null };
};

@Injectable()
export class CommercialDeliveryService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private async viewerRegion(userId: string, client: Prisma.TransactionClient = this.prisma): Promise<CampaignViewerRegion> {
    const tutor = await client.tutorProfile.findUnique({ where: { userId }, select: { city: true, state: true } });
    return { city: tutor?.city ?? null, state: tutor?.state ?? null };
  }

  private candidateWhere(now: Date, viewer: CampaignViewerRegion): Prisma.AdCampaignWhereInput {
    const state = viewer.state?.trim();
    return {
      status: "PUBLISHED", startsAt: { lte: now }, endsAt: { gt: now }, partner: { status: "ACTIVE" },
      AND: [
        { OR: [{ amountCents: 0 }, { invoice: { is: { status: "PAID", refundedCents: 0 } } }] },
        { OR: [{ targetState: null }, { targetState: "" }, ...(state ? [{ targetState: { equals: state, mode: "insensitive" as const } }] : [])] },
      ],
    };
  }

  async placements(userId: string, placement: AdPlacement): Promise<SponsoredCampaign[]> {
    const viewer = await this.viewerRegion(userId);
    const now = new Date();
    const result: SponsoredCampaign[] = [];
    const batchSize = 24;
    let cursor: string | undefined;
    // Filter exact invoice amount and normalized city with the same pure rule used
    // by tracking. Paging prevents invalid historical records from hiding later ads.
    do {
      const campaigns = await this.prisma.adCampaign.findMany({
        where: { ...this.candidateWhere(now, viewer), placement },
        select: campaignSelect, orderBy: [{ startsAt: "desc" }, { id: "asc" }], take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const campaign of campaigns) {
        if (!isCampaignEligible(campaign, viewer, new Date())) continue;
        result.push({
          id: campaign.id, headline: campaign.headline, body: campaign.body, ctaLabel: campaign.ctaLabel,
          destinationUrl: campaign.destinationUrl, placement: campaign.placement, endsAt: campaign.endsAt.toISOString(),
          partner: { businessName: campaign.partner.businessName },
          asset: { id: campaign.asset.id, url: `/api/commercial/media/${campaign.asset.id}`, mediaType: campaign.asset.mediaType, mimeType: campaign.asset.mimeType, width: campaign.asset.width, height: campaign.asset.height, durationSeconds: campaign.asset.durationSeconds },
        });
      }
      cursor = campaigns.length === batchSize ? campaigns.at(-1)?.id : undefined;
    } while (cursor);
    if (!result.length) return [];
    // Daily deterministic rotation gives every eligible campaign an opportunity,
    // while returning a single identifiable placement and persisting no viewer id.
    const rotation = createHash("sha256").update("matchanimal:ad-rotation:v1\0").update(userId).update("\0").update(now.toISOString().slice(0, 10)).update("\0").update(placement).digest().readUInt32BE(0);
    return [result[rotation % result.length]];
  }

  async findVisibleAsset(userId: string, assetId: string): Promise<AdAsset | null> {
    const viewer = await this.viewerRegion(userId);
    const campaigns = await this.prisma.adCampaign.findMany({
      where: { ...this.candidateWhere(new Date(), viewer), assetId }, select: campaignSelect,
    });
    const campaign = campaigns.find((candidate) => isCampaignEligible(candidate, viewer, new Date()));
    return campaign?.asset ?? null;
  }

  async recordInteraction(userId: string, campaignId: string, kind: AdInteractionKind): Promise<void> {
    const secret = this.config.get<string>("AD_TRACKING_SECRET") || this.config.get<string>("JWT_ACCESS_SECRET");
    if (!secret?.trim()) throw new ServiceUnavailableException("O registro de interações está temporariamente indisponível.");
    await this.prisma.$transaction(async (transaction) => {
      const viewer = await this.viewerRegion(userId, transaction);
      const campaign = await transaction.adCampaign.findUnique({ where: { id: campaignId }, select: campaignSelect });
      const now = new Date();
      if (!campaign || !isCampaignEligible(campaign, viewer, now)) throw new NotFoundException("Este anúncio não está disponível.");
      const dateKey = now.toISOString().slice(0, 10);
      const day = new Date(`${dateKey}T00:00:00.000Z`);
      const visitorHash = createHmac("sha256", secret).update("matchanimal:ads:v1\0").update(userId).update("\0").update(dateKey).digest("hex");
      // The database unique key performs atomic per-person/day/kind deduplication.
      // Neither the user id nor IP/address is persisted in commercial metrics.
      await transaction.adInteraction.createMany({ data: [{ campaignId, kind, day, visitorHash }], skipDuplicates: true });
    });
  }
}
