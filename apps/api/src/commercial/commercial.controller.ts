import { BadRequestException, Body, Controller, Get, Header, Headers, Param, Patch, Post, RawBodyRequest, Req, Res, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { Response } from "express";
import { AuthenticatedRequest, JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CommercialAdminGuard } from "./commercial-admin.guard";
import { CommercialService } from "./commercial.service";
import { StripeBillingService } from "./stripe-billing.service";
import {
  CreateCampaignDto,
  CreateCommercialEventDto,
  CreateInvoiceDto,
  CreatePartnerDto,
  ManualPaymentDto,
  ManualRefundDto,
  UpdateCampaignDto,
  UpdateCommercialEventDto,
  UpdatePartnerDto,
} from "./commercial.dto";

class ReviewCommercialCampaignDto { @IsIn(["APPROVED", "REJECTED"]) approvalStatus!: "APPROVED" | "REJECTED"; @IsOptional() @IsString() @MinLength(5) @MaxLength(1000) note?: string; }

@Controller("commercial")
export class CommercialController {
  constructor(
    private readonly commercial: CommercialService,
    private readonly stripeBilling: StripeBillingService
  ) {}

  @Get("admin/overview")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  overview() {
    return this.commercial.overview();
  }

  @Get("admin/partners")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  partners() {
    return this.commercial.partners();
  }

  @Post("admin/partners")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  createPartner(@Req() req: AuthenticatedRequest, @Body() body: CreatePartnerDto) {
    return this.commercial.createPartner(req.user.sub, body);
  }

  @Patch("admin/partners/:id")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  updatePartner(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdatePartnerDto) {
    return this.commercial.updatePartner(req.user.sub, id, body);
  }

  @Get("admin/campaigns")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  campaigns() {
    return this.commercial.campaigns();
  }

  @Post("admin/campaigns")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  createCampaign(@Req() req: AuthenticatedRequest, @Body() body: CreateCampaignDto) {
    return this.commercial.createCampaign(req.user.sub, body);
  }

  @Patch("admin/campaigns/:id")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  updateCampaign(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdateCampaignDto) {
    return this.commercial.updateCampaign(req.user.sub, id, body);
  }

  @Patch("admin/campaigns/:id/review")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  reviewCampaign(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: ReviewCommercialCampaignDto) {
    if (body.approvalStatus === "REJECTED" && !body.note?.trim()) throw new BadRequestException("Informe por que o anúncio foi reprovado.");
    return this.commercial.reviewCampaign(req.user.sub, id, body.approvalStatus, body.note);
  }

  @Get("admin/invoices")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  invoices() {
    return this.commercial.invoices();
  }

  @Post("admin/invoices")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  createInvoice(@Req() req: AuthenticatedRequest, @Body() body: CreateInvoiceDto) {
    return this.commercial.createInvoice(req.user.sub, body);
  }

  @Post("admin/invoices/:id/manual-payment")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  manualPayment(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: ManualPaymentDto) {
    return this.commercial.manualPayment(req.user.sub, id, body);
  }

  @Post("admin/invoices/:id/manual-refund")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  manualRefund(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: ManualRefundDto) {
    return this.commercial.manualRefund(req.user.sub, id, body);
  }

  @Get("admin/invoices/:id/ledger")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  invoiceLedger(@Param("id") id: string) { return this.commercial.invoiceLedger(id); }

  @Post("admin/invoices/:id/cancel")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  cancelInvoice(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.commercial.cancelInvoice(req.user.sub, id);
  }

  @Post("admin/invoices/:id/stripe-checkout")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  stripeCheckout(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.stripeBilling.checkout(req.user.sub, id);
  }

  @Post("admin/invoices/:id/stripe-release")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  stripeRelease(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.stripeBilling.releaseCheckout(req.user.sub, id);
  }

  @Get("admin/events")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  events() {
    return this.commercial.events();
  }

  @Get("admin/events/:id/attendees")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  eventAttendees(@Param("id") id: string) { return this.commercial.eventAttendees(id); }

  @Post("admin/events/:id/attendees/:userId/checkin")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  checkinEvent(@Req() req: AuthenticatedRequest, @Param("id") eventId: string, @Param("userId") userId: string, @Body("checkedIn") checkedIn: boolean) {
    return this.commercial.checkinEvent(req.user.sub, eventId, userId, checkedIn);
  }

  @Post("admin/events")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  createEvent(@Req() req: AuthenticatedRequest, @Body() body: CreateCommercialEventDto) {
    return this.commercial.createEvent(req.user.sub, body);
  }

  @Patch("admin/events/:id")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  updateEvent(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdateCommercialEventDto) {
    return this.commercial.updateEvent(req.user.sub, id, body);
  }

  @Get("admin/audit")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  auditLog() {
    return this.commercial.auditLog();
  }

  @Get("admin/finance/export")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", "attachment; filename=\"faturas-matchanimal.csv\"")
  async exportFinance(@Res() res: Response) {
    const csv = await this.commercial.exportFinance();
    res.send(csv);
  }

  @Get("billing/config")
  @UseGuards(JwtAuthGuard, CommercialAdminGuard)
  billingConfig() {
    return this.stripeBilling.config();
  }

  @Post("billing/stripe/webhook")
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature?: string
  ) {
    const rawBody = req.rawBody ?? (Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {})));
    return this.stripeBilling.webhook(rawBody, signature);
  }
}
