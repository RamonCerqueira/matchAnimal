import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type AdAsset, type AdCampaign, type CommercialInvoice, type CommercialPartner } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { validateAssetForPlacement } from "./advertising-specs";
import type { CreateCampaignDto, CreateCommercialEventDto, CreateInvoiceDto, CreatePartnerDto, ManualPaymentDto, ManualRefundDto, UpdateCampaignDto, UpdateCommercialEventDto, UpdatePartnerDto } from "./commercial.dto";

const campaignInclude = { partner: true, asset: true, invoice: true, _count: { select: { interactions: true } } } satisfies Prisma.AdCampaignInclude;
const invoiceInclude = { partner: true, campaign: { select: { id: true, name: true } } } satisfies Prisma.CommercialInvoiceInclude;
const eventInclude = { partner: true, _count: { select: { participants: true } } } satisfies Prisma.PetEventInclude;
type CampaignWithDelivery = AdCampaign & { partner: CommercialPartner; asset: AdAsset; invoice: CommercialInvoice | null };

export function assertDateRange(startsAt: Date, endsAt?: Date | null) {
  if (!Number.isFinite(startsAt.getTime()) || endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt)) throw new BadRequestException("O término deve ser posterior ao início.");
}

export function assertSafeDestination(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new BadRequestException("Informe um endereço completo para o anúncio."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new BadRequestException("O destino precisa ser uma URL HTTP ou HTTPS sem credenciais.");
}

export function assertPaymentDate(value: Date, now = new Date()) {
  if (!Number.isFinite(value.getTime()) || value.getTime() > now.getTime() + 60_000) throw new BadRequestException("O pagamento precisa ter uma data válida, sem data futura.");
}

export function campaignDelivery(campaign: CampaignWithDelivery, now = new Date()) {
  if (campaign.status === "DRAFT") return { deliveryStatus: "DRAFT", deliveryReason: "Rascunho: publique a campanha quando estiver pronta." };
  if (campaign.status === "PAUSED") return { deliveryStatus: "PAUSED", deliveryReason: "Campanha pausada pela equipe." };
  if (campaign.status === "ARCHIVED") return { deliveryStatus: "ARCHIVED", deliveryReason: "Campanha arquivada." };
  if (campaign.approvalStatus !== "APPROVED") return { deliveryStatus: "REVIEW", deliveryReason: campaign.approvalNote || "A campanha aguarda aprovação dos criativos." };
  if (campaign.partner.status !== "ACTIVE") return { deliveryStatus: "INACTIVE_PARTNER", deliveryReason: "O parceiro está inativo. A entrega está suspensa." };
  try { validateAssetForPlacement(campaign.asset, campaign.placement); } catch { return { deliveryStatus: "INVALID_ASSET", deliveryReason: "A mídia não atende aos requisitos desta posição." }; }
  if (campaign.endsAt <= now) return { deliveryStatus: "EXPIRED", deliveryReason: "O período de veiculação terminou." };
  if (campaign.amountCents > 0 && (campaign.invoice?.status !== "PAID" || campaign.invoice.refundedCents > 0 || campaign.invoice.receivedCents < campaign.amountCents)) return { deliveryStatus: "PAYMENT_PENDING", deliveryReason: "Aguardando quitação integral e sem reembolsos da fatura." };
  if (campaign.startsAt > now) return { deliveryStatus: "SCHEDULED", deliveryReason: "Publicada e aguardando a data de início." };
  return { deliveryStatus: "DELIVERING", deliveryReason: "Disponível para entrega conforme posição e segmentação." };
}

function rejectNulls(value: object, keys: string[]) {
  const fields = value as Record<string, unknown>;
  if (keys.some((key) => fields[key] === null)) throw new BadRequestException("Campos obrigatórios não podem ser apagados.");
}

@Injectable()
export class CommercialService {
  constructor(private readonly prisma: PrismaService) {}

  /** Serializable retries protect billing/campaign invariants against concurrent admin actions. */
  private async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(operation, { isolationLevel: "Serializable" }); }
      catch (cause) {
        if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2034" && attempt < 2) continue;
        if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") throw new ConflictException("Este registro já possui um vínculo exclusivo. Atualize a lista e tente novamente.");
        throw cause;
      }
    }
  }

  private audit(tx: Prisma.TransactionClient, actorId: string, action: string, targetType: string, targetId: string, metadata?: Prisma.InputJsonObject) {
    return tx.adminAuditLog.create({ data: { actorId, action, targetType, targetId, metadata } });
  }

  async overview() {
    const now = new Date();
    const [partners, activePartners, campaigns, published, delivering, pending, overdue, received, canceled, refunded, events, upcoming, recentInvoices, audit] = await Promise.all([
      this.prisma.commercialPartner.count(), this.prisma.commercialPartner.count({ where: { status: "ACTIVE" } }),
      this.prisma.adCampaign.count(), this.prisma.adCampaign.count({ where: { status: "PUBLISHED" } }),
      this.prisma.adCampaign.count({ where: { status: "PUBLISHED", partner: { status: "ACTIVE" }, startsAt: { lte: now }, endsAt: { gt: now }, OR: [{ amountCents: 0 }, { invoice: { is: { status: "PAID", refundedCents: 0 } } }] } }),
      this.prisma.commercialInvoice.findMany({ where: { status: "PENDING" }, select: { amountCents: true, receivedCents: true } }),
      this.prisma.commercialInvoice.findMany({ where: { status: "PENDING", dueAt: { lt: now } }, select: { amountCents: true, receivedCents: true } }),
      this.prisma.commercialInvoice.aggregate({ _sum: { receivedCents: true } }),
      this.prisma.commercialInvoice.aggregate({ where: { status: "CANCELED" }, _sum: { amountCents: true } }),
      this.prisma.commercialInvoice.aggregate({ _sum: { refundedCents: true } }),
      this.prisma.petEvent.count(), this.prisma.petEvent.count({ where: { isCancelled: false, startsAt: { gte: now } } }),
      this.prisma.commercialInvoice.findMany({ take: 8, orderBy: { createdAt: "desc" }, include: invoiceInclude }),
      this.prisma.adminAuditLog.findMany({ take: 8, orderBy: { createdAt: "desc" } }),
    ]);
    const outstanding = (rows: { amountCents: number; receivedCents: number }[]) => rows.reduce((sum, row) => sum + Math.max(0, row.amountCents - row.receivedCents), 0);
    return { partners: { total: partners, active: activePartners }, campaigns: { total: campaigns, published, delivering }, finance: { pendingCents: outstanding(pending), overdueCents: outstanding(overdue), receivedCents: received._sum.receivedCents ?? 0, canceledCents: canceled._sum.amountCents ?? 0, refundedCents: refunded._sum.refundedCents ?? 0 }, events: { total: events, upcoming }, recentInvoices, audit };
  }

  partners() { return this.prisma.commercialPartner.findMany({ take: 200, orderBy: { createdAt: "desc" }, include: { _count: { select: { campaigns: true, invoices: true, events: true } } } }); }

  createPartner(actorId: string, input: CreatePartnerDto) {
    if (input.website) assertSafeDestination(input.website);
    return this.transaction(async (tx) => {
      const result = await tx.commercialPartner.create({ data: { ...input, email: input.email.toLowerCase() } });
      await this.audit(tx, actorId, "PARTNER_CREATED", "PARTNER", result.id, { status: result.status, category: result.category });
      return result;
    });
  }

  updatePartner(actorId: string, id: string, input: UpdatePartnerDto) {
    rejectNulls(input, ["businessName", "contactName", "email", "category", "status"]);
    if (input.website) assertSafeDestination(input.website);
    return this.transaction(async (tx) => {
      if (!await tx.commercialPartner.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException("Parceiro não encontrado.");
      const result = await tx.commercialPartner.update({ where: { id }, data: { ...input, ...(input.email ? { email: input.email.toLowerCase() } : {}) } });
      await this.audit(tx, actorId, "PARTNER_UPDATED", "PARTNER", id, { fields: Object.keys(input), status: result.status });
      return result;
    });
  }

  async campaigns() {
    const result = await this.prisma.adCampaign.findMany({ take: 200, orderBy: { createdAt: "desc" }, include: campaignInclude });
    return result.map((campaign) => ({ ...campaign, ...campaignDelivery(campaign) }));
  }

  async createCampaign(actorId: string, input: CreateCampaignDto) {
    const startsAt = new Date(input.startsAt); const endsAt = new Date(input.endsAt);
    assertDateRange(startsAt, endsAt); assertSafeDestination(input.destinationUrl);
    return this.transaction(async (tx) => {
      const [partner, asset] = await Promise.all([tx.commercialPartner.findUnique({ where: { id: input.partnerId } }), tx.adAsset.findUnique({ where: { id: input.assetId } })]);
      if (!partner) throw new NotFoundException("Parceiro não encontrado.");
      if (!asset) throw new NotFoundException("Selecione uma mídia já enviada.");
      if (asset.partnerId && asset.partnerId !== partner.id) throw new BadRequestException("A mídia pertence a outro parceiro.");
      validateAssetForPlacement(asset, input.placement);
      const campaign = await tx.adCampaign.create({ data: { ...input, startsAt, endsAt, approvalStatus: "PENDING", approvalNote: null, ...(input.amountCents > 0 ? { invoice: { create: { partnerId: input.partnerId, description: `Campanha: ${input.name}`, amountCents: input.amountCents, dueAt: startsAt } } } : {}) }, include: campaignInclude });
      await this.audit(tx, actorId, "CAMPAIGN_CREATED", "CAMPAIGN", campaign.id, { amountCents: campaign.amountCents, status: campaign.status, partnerId: campaign.partnerId, invoiceId: campaign.invoice?.id ?? null });
      return { ...campaign, ...campaignDelivery(campaign) };
    });
  }

  async reviewCampaign(actorId: string, id: string, approvalStatus: "APPROVED" | "REJECTED", approvalNote?: string) {
    const exists = await this.prisma.adCampaign.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("Campanha não encontrada.");
    if (approvalStatus === "REJECTED" && !approvalNote?.trim()) throw new BadRequestException("Informe por que o anúncio foi reprovado.");
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.adCampaign.update({ where: { id }, data: { approvalStatus, approvalNote: approvalNote?.trim() || null }, include: campaignInclude });
      await this.audit(tx, actorId, `CAMPAIGN_${approvalStatus}`, "CAMPAIGN", id, { note: updated.approvalNote });
      return updated;
    });
    return { ...result, ...campaignDelivery(result) };
  }

  updateCampaign(actorId: string, id: string, input: UpdateCampaignDto) {
    rejectNulls(input, ["partnerId", "assetId", "name", "headline", "ctaLabel", "destinationUrl", "placement", "startsAt", "endsAt", "amountCents", "status"]);
    if (input.destinationUrl) assertSafeDestination(input.destinationUrl);
    return this.transaction(async (tx) => {
      const before = await tx.adCampaign.findUnique({ where: { id }, include: campaignInclude });
      if (!before) throw new NotFoundException("Campanha não encontrada.");
      const next = { ...before, ...input, startsAt: input.startsAt ? new Date(input.startsAt) : before.startsAt, endsAt: input.endsAt ? new Date(input.endsAt) : before.endsAt };
      assertDateRange(next.startsAt, next.endsAt);
      const financialChange = next.amountCents !== before.amountCents || next.partnerId !== before.partnerId;
      if (financialChange && before.invoice && before.invoice.status !== "PENDING") throw new ConflictException("A campanha tem uma fatura finalizada. Preserve os valores e crie outra campanha para uma nova cobrança.");
      if (financialChange && before.invoice?.stripeCheckoutId) throw new ConflictException("Esta fatura tem um checkout Stripe. Cancele a fatura e crie outra campanha para alterar os valores com segurança.");
      const [partner, asset] = await Promise.all([tx.commercialPartner.findUnique({ where: { id: next.partnerId } }), tx.adAsset.findUnique({ where: { id: next.assetId } })]);
      if (!partner || !asset) throw new NotFoundException("Parceiro ou mídia não encontrado.");
      if (asset.partnerId && asset.partnerId !== partner.id) throw new BadRequestException("A mídia pertence a outro parceiro.");
      validateAssetForPlacement(asset, next.placement);
      if (financialChange && before.invoice) {
        await tx.commercialInvoice.update({ where: { id: before.invoice.id }, data: next.amountCents > 0 ? { amountCents: next.amountCents, partnerId: next.partnerId } : { status: "CANCELED" } });
      } else if (next.amountCents > 0 && !before.invoice) {
        await tx.commercialInvoice.create({ data: { partnerId: next.partnerId, campaignId: id, description: `Campanha: ${next.name}`, amountCents: next.amountCents, dueAt: next.startsAt } });
      }
      const result = await tx.adCampaign.update({ where: { id }, data: { ...input, startsAt: next.startsAt, endsAt: next.endsAt }, include: campaignInclude });
      await this.audit(tx, actorId, "CAMPAIGN_UPDATED", "CAMPAIGN", id, { fields: Object.keys(input), status: result.status, amountCents: result.amountCents });
      return { ...result, ...campaignDelivery(result) };
    });
  }

  invoices() { return this.prisma.commercialInvoice.findMany({ take: 200, orderBy: { createdAt: "desc" }, include: invoiceInclude }); }

  async invoiceLedger(id: string) {
    const invoice = await this.prisma.commercialInvoice.findUnique({ where: { id }, include: invoiceInclude });
    if (!invoice) throw new NotFoundException("Fatura não encontrada.");
    const entries = await this.prisma.financialEntry.findMany({ where: { invoiceId: id }, orderBy: { occurredAt: "asc" } });
    return { invoice, entries, remainingCents: Math.max(0, invoice.amountCents - invoice.receivedCents), netReceivedCents: invoice.receivedCents - invoice.feeCents - invoice.refundedCents };
  }

  createInvoice(actorId: string, input: CreateInvoiceDto) {
    return this.transaction(async (tx) => {
      if (!await tx.commercialPartner.findUnique({ where: { id: input.partnerId }, select: { id: true } })) throw new NotFoundException("Parceiro não encontrado.");
      if (input.campaignId) {
        const campaign = await tx.adCampaign.findUnique({ where: { id: input.campaignId }, include: { invoice: true } });
        if (!campaign || campaign.partnerId !== input.partnerId) throw new BadRequestException("A campanha precisa pertencer ao parceiro informado.");
        if (campaign.invoice) throw new ConflictException("A campanha já possui uma fatura. Não é possível duplicar a cobrança.");
        if (campaign.amountCents <= 0 || campaign.amountCents !== input.amountCents) throw new BadRequestException("O valor da fatura precisa corresponder à campanha cobrada.");
      }
      const invoice = await tx.commercialInvoice.create({ data: { ...input, dueAt: new Date(input.dueAt) }, include: invoiceInclude });
      await this.audit(tx, actorId, "INVOICE_CREATED", "INVOICE", invoice.id, { partnerId: input.partnerId, amountCents: input.amountCents, campaignId: input.campaignId ?? null });
      return invoice;
    });
  }

  manualPayment(actorId: string, id: string, input: ManualPaymentDto) {
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date(); assertPaymentDate(paidAt);
    return this.transaction(async (tx) => {
      const invoice = await tx.commercialInvoice.findUnique({ where: { id } });
      if (!invoice) throw new NotFoundException("Fatura não encontrada.");
      if (invoice.status !== "PENDING") throw new ConflictException("Apenas faturas pendentes podem receber baixa manual.");
      if (invoice.stripeCheckoutId) throw new ConflictException("Existe checkout Stripe nesta fatura. Cancele o checkout antes de registrar um pagamento externo.");
      const amountCents = input.amountCents ?? (invoice.amountCents - invoice.receivedCents);
      const remainingCents = invoice.amountCents - invoice.receivedCents;
      if (amountCents < 1 || amountCents > remainingCents) throw new BadRequestException("O pagamento deve ser maior que zero e não pode exceder o saldo pendente.");
      const nextReceivedCents = invoice.receivedCents + amountCents;
      const isSettled = nextReceivedCents >= invoice.amountCents;
      const result = await tx.commercialInvoice.update({ where: { id }, data: { receivedCents: nextReceivedCents, status: isSettled ? "PAID" : "PENDING", method: input.method, reference: input.reference, paidAt: isSettled ? paidAt : null }, include: invoiceInclude });
      await tx.financialEntry.create({ data: { invoiceId: id, kind: "PAYMENT", amountCents, method: input.method, reference: input.reference, occurredAt: paidAt, actorId } });
      await this.audit(tx, actorId, "INVOICE_MANUAL_PAYMENT", "INVOICE", id, { method: input.method, reference: input.reference, amountCents, remainingCents: remainingCents - amountCents, paidAt: paidAt.toISOString() });
      return result;
    });
  }

  manualRefund(actorId: string, id: string, input: ManualRefundDto) {
    const refundedAt = input.refundedAt ? new Date(input.refundedAt) : new Date(); assertPaymentDate(refundedAt);
    return this.transaction(async (tx) => {
      const invoice = await tx.commercialInvoice.findUnique({ where: { id } });
      if (!invoice) throw new NotFoundException("Fatura não encontrada.");
      if (invoice.stripePaymentIntentId || invoice.method === "STRIPE") throw new ConflictException("Esse pagamento foi feito pela Stripe. Registre o reembolso na Stripe; o webhook atualizará o extrato.");
      const refundBalance = invoice.receivedCents - invoice.refundedCents;
      if (refundBalance < 1) throw new ConflictException("Esta fatura não tem valor recebido disponível para reembolso.");
      const amountCents = input.amountCents ?? refundBalance;
      if (amountCents < 1 || amountCents > refundBalance) throw new BadRequestException("O reembolso não pode exceder o valor recebido ainda não devolvido.");
      const refundedCents = invoice.refundedCents + amountCents;
      const fullyRefunded = refundedCents >= invoice.receivedCents;
      const status = fullyRefunded ? invoice.receivedCents >= invoice.amountCents ? "REFUNDED" : "CANCELED" : invoice.status;
      const result = await tx.commercialInvoice.update({ where: { id }, data: { refundedCents, status }, include: invoiceInclude });
      await tx.financialEntry.create({ data: { invoiceId: id, kind: "REFUND", amountCents, method: input.method, reference: input.reference, occurredAt: refundedAt, actorId } });
      await this.audit(tx, actorId, "INVOICE_MANUAL_REFUND", "INVOICE", id, { method: input.method, reference: input.reference, amountCents, refundedAt: refundedAt.toISOString() });
      return result;
    });
  }

  cancelInvoice(actorId: string, id: string) {
    return this.transaction(async (tx) => {
      const invoice = await tx.commercialInvoice.findUnique({ where: { id } });
      if (!invoice) throw new NotFoundException("Fatura não encontrada.");
      if (invoice.status !== "PENDING") throw new ConflictException("Somente faturas pendentes podem ser canceladas. Pagamentos confirmados exigem conciliação de reembolso.");
      if (invoice.receivedCents > 0) throw new ConflictException("Esta fatura já recebeu pagamentos. Registre a devolução antes de cancelá-la.");
      if (invoice.stripeCheckoutId) throw new ConflictException("O checkout Stripe precisa ser encerrado antes do cancelamento.");
      const result = await tx.commercialInvoice.update({ where: { id }, data: { status: "CANCELED" }, include: invoiceInclude });
      await this.audit(tx, actorId, "INVOICE_CANCELED", "INVOICE", id, { amountCents: invoice.amountCents });
      return result;
    });
  }

  auditLog() { return this.prisma.adminAuditLog.findMany({ take: 200, orderBy: { createdAt: "desc" } }); }

  async exportFinance() {
    const rows = await this.prisma.commercialInvoice.findMany({ take: 10_000, orderBy: { createdAt: "desc" }, include: invoiceInclude });
    const escape = (value: unknown) => { const raw = String(value ?? ""); const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw; return `"${safe.replace(/"/g, '""')}"`; };
    const header = ["id", "parceiro", "campanha", "descricao", "valor_centavos", "moeda", "status", "vencimento", "pagamento", "metodo", "referencia"];
    return "\uFEFF" + [header, ...rows.map((row) => [row.id, row.partner.businessName, row.campaign?.name, row.description, row.amountCents, row.currency, row.status, row.dueAt.toISOString(), row.paidAt?.toISOString(), row.method, row.reference])].map((row) => row.map(escape).join(";")).join("\r\n");
  }

  events() { return this.prisma.petEvent.findMany({ take: 200, orderBy: { startsAt: "desc" }, include: eventInclude }); }

  async eventAttendees(id: string) {
    if (!await this.prisma.petEvent.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException("Evento não encontrado.");
    const participants = await this.prisma.eventParticipant.findMany({ where: { eventId: id }, orderBy: [{ status: "asc" }, { joinedAt: "asc" }], take: 1000, select: { userId: true, status: true, joinedAt: true, checkedInAt: true, user: { select: { tutor: { select: { displayName: true, city: true, state: true } } } } } });
    return participants.map(({ userId, user, ...attendance }) => ({ userId, displayName: user.tutor?.displayName ?? "Perfil sem nome", city: user.tutor?.city, state: user.tutor?.state, ...attendance }));
  }

  async checkinEvent(actorId: string, eventId: string, userId: string, checkedIn: boolean) {
    const item = await this.prisma.eventParticipant.findUnique({ where: { eventId_userId: { eventId, userId } } });
    if (!item || item.status === "WAITLIST") throw new NotFoundException("Inscrição confirmada não encontrada.");
    const result = await this.prisma.eventParticipant.update({ where: { eventId_userId: { eventId, userId } }, data: { checkedInAt: checkedIn ? item.checkedInAt ?? new Date() : null } });
    await this.prisma.adminAuditLog.create({ data: { actorId, action: checkedIn ? "EVENT_CHECKIN" : "EVENT_CHECKIN_REVERSED", targetType: "EVENT_PARTICIPANT", targetId: `${eventId}:${userId}` } });
    return result;
  }

  createEvent(actorId: string, input: CreateCommercialEventDto) {
    const startsAt = new Date(input.startsAt); const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    assertDateRange(startsAt, endsAt);
    this.validateCoordinates(input.latitude, input.longitude);
    return this.transaction(async (tx) => {
      if (input.partnerId && !await tx.commercialPartner.findUnique({ where: { id: input.partnerId }, select: { id: true } })) throw new NotFoundException("Parceiro não encontrado.");
      const event = await tx.petEvent.create({ data: { ...input, organizerId: actorId, startsAt, endsAt }, include: eventInclude });
      await this.audit(tx, actorId, "EVENT_CREATED", "EVENT", event.id, { partnerId: event.partnerId, startsAt: event.startsAt.toISOString() });
      return event;
    });
  }

  updateEvent(actorId: string, id: string, input: UpdateCommercialEventDto) {
    rejectNulls(input, ["title", "description", "startsAt", "locationLabel", "visibility", "isCancelled"]);
    return this.transaction(async (tx) => {
      const before = await tx.petEvent.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Evento não encontrado.");
      const startsAt = input.startsAt ? new Date(input.startsAt) : before.startsAt;
      const endsAt = input.endsAt === null ? null : input.endsAt ? new Date(input.endsAt) : before.endsAt;
      assertDateRange(startsAt, endsAt);
      this.validateCoordinates(input.latitude !== undefined ? input.latitude : before.latitude, input.longitude !== undefined ? input.longitude : before.longitude);
      if (input.partnerId && !await tx.commercialPartner.findUnique({ where: { id: input.partnerId }, select: { id: true } })) throw new NotFoundException("Parceiro não encontrado.");
      if (input.capacity) { const going = await tx.eventParticipant.count({ where: { eventId: id, status: "GOING" } }); if (input.capacity < going) throw new BadRequestException("O limite não pode ser menor que o número de presenças confirmadas."); }
      const event = await tx.petEvent.update({ where: { id }, data: { ...input, startsAt, endsAt }, include: eventInclude });
      await this.audit(tx, actorId, "EVENT_UPDATED", "EVENT", id, { fields: Object.keys(input), isCancelled: event.isCancelled });
      return event;
    });
  }

  private validateCoordinates(latitude?: number | null, longitude?: number | null) {
    if ((latitude != null) !== (longitude != null)) throw new BadRequestException("Informe latitude e longitude juntas ou deixe ambas vazias.");
  }
}
