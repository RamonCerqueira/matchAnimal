import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import Stripe from "stripe";
import { Prisma, type CommercialInvoice } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class StripeBillingService {
  private readonly logger = new Logger(StripeBillingService.name);
  constructor(private readonly prisma: PrismaService) {}

  config() {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    const webhookConfigured = !!process.env.STRIPE_WEBHOOK_SECRET?.trim();
    const secretKeyConfigured = !!key && /^(sk|rk)_(test|live)_/.test(key);
    const mode = key && /^(sk|rk)_live_/.test(key) ? "live" : "test";
    const livePaymentsAllowed = process.env.STRIPE_ALLOW_LIVE_PAYMENTS === "true";
    const configured = secretKeyConfigured && webhookConfigured && (mode !== "live" || livePaymentsAllowed);
    const missing = [!secretKeyConfigured ? "STRIPE_SECRET_KEY" : null, !webhookConfigured ? "STRIPE_WEBHOOK_SECRET" : null, mode === "live" && !livePaymentsAllowed ? "STRIPE_ALLOW_LIVE_PAYMENTS" : null].filter((value): value is string => !!value);
    return { provider: "stripe", configured, secretKeyConfigured, webhookConfigured, mode, livePaymentsAllowed, currency: "BRL", webhookPath: "/api/commercial/billing/stripe/webhook", missing, message: configured ? "Checkout habilitado; a baixa depende do pagamento confirmado pelo webhook." : "Configure as variáveis indicadas no backend. Nenhum checkout será simulado." };
  }

  private client() {
    if (!this.config().configured) throw new ServiceUnavailableException("Stripe não configurado. Consulte a configuração de cobrança; a fatura continua pendente.");
    return new Stripe(process.env.STRIPE_SECRET_KEY!.trim(), { maxNetworkRetries: 1, timeout: 12_000 });
  }

  private returnUrl() {
    const base = process.env.STRIPE_CHECKOUT_RETURN_URL?.trim() || `${(process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",")[0].trim().replace(/\/$/, "")}/administracao`;
    let url: URL;
    try { url = new URL(base); } catch { throw new ServiceUnavailableException("Configure STRIPE_CHECKOUT_RETURN_URL com uma URL válida."); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new ServiceUnavailableException("URL de retorno de cobrança inválida.");
    if (this.config().mode === "live" && url.protocol !== "https:") throw new ServiceUnavailableException("O checkout de produção exige URL de retorno HTTPS.");
    return url;
  }

  async checkout(actorId: string, invoiceId: string) {
    const stripe = this.client();
    let createdSession: Stripe.Checkout.Session | null = null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        // A row lock spans the provider call so amount/cancellation cannot change under an open checkout.
        await tx.$queryRaw`SELECT id FROM "CommercialInvoice" WHERE id = ${invoiceId} FOR UPDATE`;
        const invoice = await tx.commercialInvoice.findUnique({ where: { id: invoiceId }, include: { partner: true } });
        if (!invoice) throw new NotFoundException("Fatura não encontrada.");
        if (invoice.status !== "PENDING") throw new ConflictException("O checkout está disponível somente para faturas pendentes.");
        if (invoice.receivedCents > 0) throw new ConflictException("Esta fatura já recebeu um pagamento parcial. Gere o checkout somente para faturas sem recebimentos prévios.");
        if (invoice.stripeCheckoutId) {
          const previous = await stripe.checkout.sessions.retrieve(invoice.stripeCheckoutId);
          if (previous.payment_status === "paid") throw new ConflictException("A Stripe já confirmou este pagamento. Aguarde a conciliação do webhook.");
          if (previous.status === "open" && previous.url) return { url: previous.url };
          if (previous.status !== "expired") throw new ConflictException("O pagamento deste checkout ainda está em processamento. Aguarde a confirmação.");
        }
        const success = this.returnUrl(); success.searchParams.set("payment", "success"); success.searchParams.set("invoiceId", invoice.id);
        const cancel = this.returnUrl(); cancel.searchParams.set("payment", "canceled"); cancel.searchParams.set("invoiceId", invoice.id);
        createdSession = await stripe.checkout.sessions.create({
          mode: "payment", locale: "pt-BR", allowed_payment_method_types: ["card"], customer_email: invoice.partner.billingEmail || invoice.partner.email,
          client_reference_id: invoice.id, metadata: { invoiceId: invoice.id, partnerId: invoice.partnerId },
          payment_intent_data: { metadata: { invoiceId: invoice.id, partnerId: invoice.partnerId } },
          line_items: [{ quantity: 1, price_data: { currency: "brl", unit_amount: invoice.amountCents, product_data: { name: invoice.description } } }],
          success_url: success.toString(), cancel_url: cancel.toString(),
        }, { idempotencyKey: `invoice:${invoice.id}:${invoice.updatedAt.getTime()}` });
        if (!createdSession.url) throw new ServiceUnavailableException("A Stripe não retornou uma URL de checkout. A fatura continua pendente.");
        await tx.commercialInvoice.update({ where: { id: invoice.id }, data: { stripeCheckoutId: createdSession.id, checkoutUrl: createdSession.url } });
        await tx.adminAuditLog.create({ data: { actorId, action: "STRIPE_CHECKOUT_CREATED", targetType: "INVOICE", targetId: invoice.id, metadata: { checkoutId: createdSession.id, amountCents: invoice.amountCents, mode: this.config().mode } } });
        return { url: createdSession.url };
      }, { timeout: 30_000, maxWait: 10_000 });
    } catch (cause) {
      // A failed DB commit must not leave a newly created checkout available for accidental payment.
      const orphan = createdSession as Stripe.Checkout.Session | null;
      if (orphan?.status === "open") await stripe.checkout.sessions.expire(orphan.id).catch(() => this.logger.error(`Revisar checkout não persistido ${orphan.id}.`));
      if (cause instanceof Stripe.errors.StripeError) throw new BadRequestException(`A Stripe não disponibilizou o checkout: ${cause.message}`);
      throw cause;
    }
  }

  /** Expire the hosted link before a manual write to avoid receiving two payments. */
  async releaseCheckout(actorId: string, invoiceId: string) {
    const current = await this.prisma.commercialInvoice.findUnique({ where: { id: invoiceId } });
    if (!current?.stripeCheckoutId) return;
    const stripe = this.client();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CommercialInvoice" WHERE id = ${invoiceId} FOR UPDATE`;
      const invoice = await tx.commercialInvoice.findUnique({ where: { id: invoiceId } });
      if (!invoice?.stripeCheckoutId) return;
      if (invoice.status !== "PENDING") throw new ConflictException("A fatura já foi finalizada.");
      const session = await stripe.checkout.sessions.retrieve(invoice.stripeCheckoutId);
      if (session.payment_status === "paid" || session.status === "complete") throw new ConflictException("Este checkout já foi concluído. Aguarde a conciliação do webhook antes de alterar a fatura.");
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
      await tx.commercialInvoice.update({ where: { id: invoiceId }, data: { stripeCheckoutId: null, checkoutUrl: null } });
      await tx.adminAuditLog.create({ data: { actorId, action: "STRIPE_CHECKOUT_EXPIRED_BY_ADMIN", targetType: "INVOICE", targetId: invoiceId, metadata: { checkoutId: session.id } } });
    }, { timeout: 30_000, maxWait: 10_000 });
  }

  async webhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody || !signature) throw new BadRequestException("Payload original e assinatura Stripe são obrigatórios.");
    const stripe = this.client();
    let event: Stripe.Event;
    try { event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!.trim()); }
    catch { throw new BadRequestException("Assinatura Stripe inválida."); }
    if (event.livemode !== (this.config().mode === "live")) throw new BadRequestException("O evento Stripe não pertence ao modo de cobrança configurado.");
    try {
      await this.prisma.$transaction(async (tx) => {
        // The event ID and financial change commit together. Failed processing remains retryable.
        await tx.stripeWebhookEvent.create({ data: { eventId: event.id, type: event.type } });
        if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
          const session = event.data.object;
          if (session.payment_status === "paid") await this.settleSession(tx, session, event.id);
        } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
          const session = event.data.object;
          await tx.commercialInvoice.updateMany({ where: { stripeCheckoutId: session.id, status: "PENDING" }, data: { checkoutUrl: null } });
          if (session.metadata?.invoiceId) await tx.adminAuditLog.create({ data: { actorId: "stripe:webhook", action: event.type === "checkout.session.expired" ? "STRIPE_CHECKOUT_EXPIRED" : "STRIPE_PAYMENT_FAILED", targetType: "INVOICE", targetId: session.metadata.invoiceId, metadata: { eventId: event.id, checkoutId: session.id } } });
        } else if (event.type === "charge.refunded") {
          const charge = event.data.object;
          const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
          const invoice = intentId ? await tx.commercialInvoice.findUnique({ where: { stripePaymentIntentId: intentId } }) : null;
          if (invoice) {
            const fullRefund = charge.refunded && charge.amount_refunded >= invoice.amountCents;
            const refundDelta = Math.max(0, charge.amount_refunded - invoice.refundedCents);
            if (refundDelta > 0) {
              await tx.commercialInvoice.update({ where: { id: invoice.id }, data: { refundedCents: charge.amount_refunded, ...(fullRefund && invoice.status === "PAID" ? { status: "REFUNDED" } : {}) } });
              await tx.financialEntry.create({ data: { invoiceId: invoice.id, kind: "REFUND", amountCents: refundDelta, method: "STRIPE", reference: charge.id, occurredAt: new Date(charge.created * 1000), actorId: "stripe:webhook" } });
            }
            await tx.adminAuditLog.create({ data: { actorId: "stripe:webhook", action: fullRefund ? "STRIPE_PAYMENT_REFUNDED" : "STRIPE_PARTIAL_REFUND_REQUIRES_REVIEW", targetType: "INVOICE", targetId: invoice.id, metadata: { eventId: event.id, chargeId: charge.id, refundedCents: charge.amount_refunded } } });
          }
        }
      }, { isolationLevel: "Serializable", timeout: 20_000 });
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002" && await this.prisma.stripeWebhookEvent.findUnique({ where: { eventId: event.id } })) return { received: true, duplicate: true };
      throw cause;
    }
    return { received: true, duplicate: false };
  }

  private async settleSession(tx: Prisma.TransactionClient, session: Stripe.Checkout.Session, eventId: string) {
    const invoiceId = session.metadata?.invoiceId;
    if (!invoiceId || session.client_reference_id !== invoiceId) throw new BadRequestException("Checkout sem referência de fatura válida.");
    const invoice: CommercialInvoice | null = await tx.commercialInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException("Fatura do checkout não encontrada.");
    const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (session.amount_total !== invoice.amountCents || session.currency?.toLowerCase() !== "brl" || session.metadata?.partnerId !== invoice.partnerId || invoice.stripeCheckoutId !== session.id || !intentId) {
      await tx.adminAuditLog.create({ data: { actorId: "stripe:webhook", action: "STRIPE_PAYMENT_REQUIRES_REVIEW", targetType: "INVOICE", targetId: invoice.id, metadata: { eventId, checkoutId: session.id, amountCents: session.amount_total, currency: session.currency, paymentIntentId: intentId ?? null } } });
      return;
    }
    if (invoice.status === "PAID" && invoice.stripePaymentIntentId === intentId) return;
    if (invoice.status !== "PENDING") {
      await tx.adminAuditLog.create({ data: { actorId: "stripe:webhook", action: "STRIPE_PAYMENT_ON_FINALIZED_INVOICE", targetType: "INVOICE", targetId: invoice.id, metadata: { eventId, checkoutId: session.id, status: invoice.status } } });
      return;
    }
    await tx.commercialInvoice.update({ where: { id: invoice.id }, data: { status: "PAID", receivedCents: invoice.amountCents, paidAt: new Date(), method: "STRIPE", reference: intentId, stripePaymentIntentId: intentId, checkoutUrl: null } });
    await tx.financialEntry.create({ data: { invoiceId: invoice.id, kind: "PAYMENT", amountCents: invoice.amountCents, feeCents: 0, method: "STRIPE", reference: intentId, occurredAt: new Date(), actorId: "stripe:webhook" } });
    await tx.adminAuditLog.create({ data: { actorId: "stripe:webhook", action: "STRIPE_PAYMENT_CONFIRMED", targetType: "INVOICE", targetId: invoice.id, metadata: { eventId, checkoutId: session.id, paymentIntentId: intentId, amountCents: invoice.amountCents } } });
  }
}
