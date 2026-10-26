"use client";

import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileText,
  ListTree,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import {
  AdminBadge,
  AdminFeedback,
  AdminField,
  AdminMetric,
  AdminState,
  AdminSubmit,
  amountFromForm,
  commercialApi,
  commercialBase,
  commercialJson,
  commercialRequest,
  dateBR,
  formText,
  isoDate,
  localDateInput,
  money,
  useAdminMutation,
  useAdminResource,
  type CommercialCampaign,
  type CommercialInvoice,
  type CommercialPartner,
} from "@/components/admin-commercial-core";

type CommercialOverview = {
  partners: { total: number; active: number };
  campaigns: { total: number; published: number; delivering: number };
  finance: {
    pendingCents: number;
    overdueCents: number;
    receivedCents: number;
    canceledCents: number;
    refundedCents: number;
  };
  events: { total: number; upcoming: number };
  recentInvoices: CommercialInvoice[];
};

type BillingConfig = {
  provider: string;
  configured: boolean;
  secretKeyConfigured: boolean;
  webhookConfigured: boolean;
  mode: "live" | "test";
  livePaymentsAllowed: boolean;
  currency: string;
  webhookPath: string;
  missing: string[];
  message: string;
};

const invoiceStatusLabels: Record<string, string> = {
  PENDING: "Pendente",
  PAID: "Pago",
  CANCELED: "Cancelado",
  REFUNDED: "Reembolsado",
};

const paymentMethodLabels: Record<string, string> = {
  PIX: "PIX",
  STRIPE: "Cartão (Stripe)",
  BANK_TRANSFER: "Transferência bancária",
  CASH: "Dinheiro / balcão",
  OTHER: "Outro",
};

export function AdminCommercialFinance() {
  const [now] = useState(() => Date.now());
  const invoices = useAdminResource<CommercialInvoice[]>(`${commercialBase}/invoices`);
  const overview = useAdminResource<CommercialOverview>(`${commercialBase}/overview`);
  const billingConfig = useAdminResource<BillingConfig>("/api/commercial/billing/config");
  const partners = useAdminResource<CommercialPartner[]>(`${commercialBase}/partners`);
  const campaigns = useAdminResource<CommercialCampaign[]>(`${commercialBase}/campaigns`);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [partnerFilter, setPartnerFilter] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [manualPaymentInvoice, setManualPaymentInvoice] = useState<CommercialInvoice | null>(null);
  const [ledgerInvoice, setLedgerInvoice] = useState<CommercialInvoice | null>(null);
  const [refundInvoice, setRefundInvoice] = useState<CommercialInvoice | null>(null);
  const [stripeLinkInvoice, setStripeLinkInvoice] = useState<CommercialInvoice | null>(null);
  const [releaseInvoice, setReleaseInvoice] = useState<CommercialInvoice | null>(null);
  const [cancelInvoiceTarget, setCancelInvoiceTarget] = useState<CommercialInvoice | null>(null);
  const [notice, setNotice] = useState("");

  const mutation = useAdminMutation();

  const reloadAll = () => {
    invoices.reload();
    overview.reload();
    billingConfig.reload();
  };

  const filteredInvoices = (invoices.data ?? []).filter((inv) => {
    const matchesStatus = status === "ALL" || inv.status === status;
    const matchesPartner = partnerFilter === "ALL" || inv.partnerId === partnerFilter;
    const searchString = `${inv.description} ${inv.partner?.businessName ?? ""} ${inv.id} ${inv.reference ?? ""}`.toLowerCase();
    const matchesQuery = !query || searchString.includes(query.toLowerCase());
    return matchesStatus && matchesPartner && matchesQuery;
  });

  const financeMetrics = overview.data?.finance ?? {
    receivedCents: 0,
    pendingCents: 0,
    overdueCents: 0,
    canceledCents: 0,
    refundedCents: 0,
  };

  return (
    <section className="ac-section">
      <header className="ac-section-heading">
        <div>
          <span>GESTÃO FINANCEIRA E COBRANÇAS</span>
          <h2>Financeiro & Faturas</h2>
          <p>
            Controle de pagamentos de propagandas, emissão de faturas, baixa manual de PIX e links de checkout Stripe.
          </p>
        </div>
        <div className="ac-header-actions">
          <a
            href={`${commercialApi}${commercialBase}/finance/export`}
            className="ac-button ac-button-secondary"
            download="faturas-matchanimal.csv"
          >
            <ArrowDownToLine size={16} aria-hidden="true" />
            Exportar CSV
          </a>
          <button
            type="button"
            className="ac-button"
            onClick={() => setCreateOpen(true)}
            disabled={partners.loading || !partners.data?.length}
          >
            <Plus size={18} aria-hidden="true" />
            Nova fatura
          </button>
        </div>
      </header>

      <AdminFeedback notice={notice} />

      {/* Cartões de Indicadores Financeiros */}
      <div className="ac-metrics-grid">
        <AdminMetric
          label="Total Recebido"
          value={money(financeMetrics.receivedCents)}
          hint="Faturas confirmadas (PIX, Stripe, etc.)"
          icon={<DollarSign size={20} className="ac-icon-success" aria-hidden="true" />}
        />
        <AdminMetric
          label="A Receber (Pendente)"
          value={money(financeMetrics.pendingCents)}
          hint="Faturas aguardando pagamento"
          icon={<Clock size={20} className="ac-icon-warning" aria-hidden="true" />}
        />
        <AdminMetric
          label="Faturas Vencidas"
          value={money(financeMetrics.overdueCents)}
          hint="Vencimento ultrapassado"
          icon={<AlertCircle size={20} className="ac-icon-danger" aria-hidden="true" />}
        />
        <AdminMetric
          label="Integração Stripe"
          value={billingConfig.data?.configured ? "Ativa e pronta" : "Pendente"}
          hint={billingConfig.data?.configured ? `Modo: ${billingConfig.data.mode.toUpperCase()}` : "Configurar chaves"}
          icon={<CreditCard size={20} aria-hidden="true" />}
        />
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="ac-toolbar">
        <label className="ac-search">
          <Search size={18} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar fatura"
            placeholder="Buscar por parceiro, descrição ou código..."
          />
        </label>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filtrar por status"
        >
          <option value="ALL">Todos os status</option>
          {Object.entries(invoiceStatusLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <select
          value={partnerFilter}
          onChange={(e) => setPartnerFilter(e.target.value)}
          aria-label="Filtrar por parceiro"
        >
          <option value="ALL">Todos os parceiros</option>
          {partners.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.businessName}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="ac-icon-button"
          aria-label="Atualizar dados financeiros"
          disabled={invoices.loading}
          onClick={reloadAll}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Tabela de Faturas */}
      <AdminState
        loading={invoices.loading}
        error={invoices.error}
        onRetry={reloadAll}
        empty={!filteredInvoices.length}
        emptyTitle="Nenhuma fatura encontrada"
        emptyText="As faturas geradas para campanhas publicitárias ou avulsas de parceiros aparecerão aqui."
      >
        <div className="ac-table-wrap">
          <table className="ac-table">
            <caption className="sr-only">Faturas comerciais e situação financeira</caption>
            <thead>
              <tr>
                <th scope="col">Parceiro / Descrição</th>
                <th scope="col">Valor</th>
                <th scope="col">Vencimento</th>
                <th scope="col">Status</th>
                <th scope="col">Pagamento / Método</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((inv) => {
                const isOverdue =
                  inv.status === "PENDING" && new Date(inv.dueAt).getTime() < now;
                return (
                  <tr key={inv.id}>
                    <td>
                      <div className="ac-invoice-info">
                        <strong>{inv.partner?.businessName ?? "Parceiro"}</strong>
                        <p>{inv.description}</p>
                        {inv.campaign && (
                          <small className="ac-invoice-campaign">
                            Campanha: {inv.campaign.name}
                          </small>
                        )}
                      </div>
                    </td>
                    <td>
                      <strong className="ac-amount">{money(inv.amountCents)}</strong>
                      {(inv.receivedCents ?? 0) > 0 && inv.status === "PENDING" && <small>Recebido {money(inv.receivedCents ?? 0)} · saldo {money(inv.amountCents - (inv.receivedCents ?? 0))}</small>}
                    </td>
                    <td>
                      <span className={isOverdue ? "ac-text-danger" : ""}>
                        {dateBR(inv.dueAt)}
                      </span>
                      {isOverdue && <small className="ac-overdue-tag">Vencida</small>}
                    </td>
                    <td>
                      <AdminBadge
                        tone={
                          inv.status === "PAID"
                            ? "success"
                            : inv.status === "PENDING"
                            ? isOverdue
                              ? "danger"
                              : "warning"
                            : inv.status === "CANCELED"
                            ? "neutral"
                            : "accent"
                        }
                      >
                        {invoiceStatusLabels[inv.status] ?? inv.status}
                      </AdminBadge>
                    </td>
                    <td>
                      {inv.status === "PAID" ? (
                        <div className="ac-payment-meta">
                          <span>{paymentMethodLabels[inv.method ?? ""] ?? inv.method ?? "Confirmado"}</span>
                          {inv.paidAt && <small>Em {dateBR(inv.paidAt, true)}</small>}
                          {inv.reference && <small className="ac-ref">Ref: {inv.reference}</small>}
                        </div>
                      ) : (
                        <small className="ac-text-muted">Aguardando liquidação</small>
                      )}
                    </td>
                    <td>
                      <div className="ac-row-actions">
                        <button type="button" className="ac-button ac-button-secondary ac-button-sm" onClick={() => setLedgerInvoice(inv)}><ListTree size={14} aria-hidden="true" />Extrato</button>
                        {(inv.receivedCents ?? 0) > (inv.refundedCents ?? 0) && inv.method !== "STRIPE" && <button type="button" className="ac-button ac-button-danger-ghost ac-button-sm" onClick={() => setRefundInvoice(inv)}><RotateCcw size={14} aria-hidden="true" />Registrar devolução</button>}
                        {inv.status === "PENDING" && (
                          <>
                            {!inv.stripeCheckoutId && <button
                              type="button"
                              className="ac-button ac-button-secondary ac-button-sm"
                              onClick={() => {
                                mutation.clearError();
                                setManualPaymentInvoice(inv);
                              }}
                              title="Registrar baixa manual com comprovante PIX ou transferência"
                            >
                              <Receipt size={14} aria-hidden="true" />
                              Baixa PIX
                            </button>}

                            {!inv.stripeCheckoutId && (inv.receivedCents ?? 0) === 0 && billingConfig.data?.configured && (
                              <button
                                type="button"
                                className="ac-button ac-button-secondary ac-button-sm"
                                onClick={() => {
                                  mutation.clearError();
                                  setStripeLinkInvoice(inv);
                                }}
                                title="Gerar link de checkout seguro Stripe para o parceiro"
                              >
                                <CreditCard size={14} aria-hidden="true" />
                                Link Cartão
                              </button>
                            )}

                            {(inv.receivedCents ?? 0) === 0 && !inv.stripeCheckoutId && <button
                              type="button"
                              className="ac-button ac-button-danger-ghost ac-button-sm"
                              onClick={() => {
                                mutation.clearError();
                                setCancelInvoiceTarget(inv);
                              }}
                              title="Cancelar fatura pendente"
                            >
                              <XCircle size={14} aria-hidden="true" />
                              Cancelar
                            </button>}
                            {inv.stripeCheckoutId && <button type="button" className="ac-button ac-button-danger-ghost ac-button-sm" onClick={() => setReleaseInvoice(inv)}><XCircle size={14} />Encerrar link</button>}
                          </>
                        )}
                        {inv.checkoutUrl && (
                          <a
                            href={inv.checkoutUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ac-icon-button"
                            title="Abrir página de checkout Stripe"
                          >
                            <ExternalLink size={16} aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AdminState>

      {/* Modal: Nova Fatura Avulsa */}
      {createOpen && (
        <CreateInvoiceDialog
          partners={partners.data ?? []}
          campaigns={campaigns.data ?? []}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setNotice("Fatura emitida com sucesso.");
            reloadAll();
          }}
        />
      )}

      {/* Modal: Baixa Manual PIX / Transferência */}
      {manualPaymentInvoice && (
        <ManualPaymentDialog
          invoice={manualPaymentInvoice}
          onClose={() => setManualPaymentInvoice(null)}
          onConfirmed={() => {
            setManualPaymentInvoice(null);
            setNotice(`Pagamento da fatura ${manualPaymentInvoice.id} registrado com sucesso.`);
            reloadAll();
          }}
        />
      )}
      {ledgerInvoice && <InvoiceLedgerDialog invoice={ledgerInvoice} onClose={() => setLedgerInvoice(null)} />}
      {refundInvoice && <ManualRefundDialog invoice={refundInvoice} onClose={() => setRefundInvoice(null)} onRefunded={() => { setRefundInvoice(null); setNotice("Devolução registrada no extrato."); reloadAll(); }} />}
      {releaseInvoice && <ReleaseStripeDialog invoice={releaseInvoice} onClose={() => setReleaseInvoice(null)} onReleased={() => { setReleaseInvoice(null); setNotice("Link Stripe encerrado. A fatura continua pendente."); reloadAll(); }} />}

      {/* Modal: Gerar Link Stripe Checkout */}
      {stripeLinkInvoice && (
        <StripeCheckoutDialog
          invoice={stripeLinkInvoice}
          onClose={() => setStripeLinkInvoice(null)}
          onGenerated={() => {
            reloadAll();
          }}
        />
      )}

      {/* Modal: Confirmar Cancelamento */}
      {cancelInvoiceTarget && (
        <CancelInvoiceDialog
          invoice={cancelInvoiceTarget}
          onClose={() => setCancelInvoiceTarget(null)}
          onCancelled={() => {
            setCancelInvoiceTarget(null);
            setNotice("Fatura cancelada.");
            reloadAll();
          }}
        />
      )}
    </section>
  );
}

function InvoiceLedgerDialog({ invoice, onClose }: { invoice: CommercialInvoice; onClose: () => void }) {
  const resource = useAdminResource<{ invoice: CommercialInvoice; entries: { id: string; kind: string; amountCents: number; feeCents: number; method: string; reference: string; occurredAt: string }[]; remainingCents: number; netReceivedCents: number }>(`${commercialBase}/invoices/${encodeURIComponent(invoice.id)}/ledger`);
  return <Dialog open onClose={onClose} title="Extrato da fatura" description={`${invoice.partner?.businessName ?? "Parceiro"} · ${invoice.description}`} className="ac-dialog"><AdminState loading={resource.loading} error={resource.error} onRetry={resource.reload}><div className="ac-metrics-grid"><AdminMetric label="Valor da fatura" value={money(resource.data?.invoice.amountCents ?? 0)} icon={<FileText size={18} />} /><AdminMetric label="Recebido" value={money(resource.data?.invoice.receivedCents ?? 0)} icon={<CheckCircle2 size={18} />} /><AdminMetric label="Saldo pendente" value={money(resource.data?.remainingCents ?? 0)} icon={<Clock size={18} />} /></div><p className="ac-form-note">Tarifas Stripe ainda não são conciliadas automaticamente e não entram no líquido confirmado.</p><div className="ac-table-wrap"><table className="ac-table"><thead><tr><th>Movimento</th><th>Valor</th><th>Meio / referência</th><th>Data</th></tr></thead><tbody>{resource.data?.entries.length ? resource.data.entries.map((entry) => <tr key={entry.id}><td>{entry.kind === "REFUND" ? "Reembolso" : "Recebimento"}</td><td>{entry.kind === "REFUND" ? "−" : "+"}{money(entry.amountCents)}</td><td>{paymentMethodLabels[entry.method] ?? entry.method}<small>{entry.reference}</small></td><td>{dateBR(entry.occurredAt, true)}</td></tr>) : <tr><td colSpan={4}>Nenhum pagamento registrado.</td></tr>}</tbody></table></div></AdminState><div className="ac-form-actions"><button type="button" className="ac-button ac-button-secondary" onClick={onClose}>Fechar</button></div></Dialog>;
}

function ManualRefundDialog({ invoice, onClose, onRefunded }: { invoice: CommercialInvoice; onClose: () => void; onRefunded: () => void }) {
  const mutation = useAdminMutation(); const balance = (invoice.receivedCents ?? 0) - (invoice.refundedCents ?? 0);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await mutation.run(() => commercialRequest(`${commercialBase}/invoices/${encodeURIComponent(invoice.id)}/manual-refund`, commercialJson("POST", { amountCents: amountFromForm(form.get("amount")), method: formText(form, "method"), reference: formText(form, "reference"), refundedAt: isoDate(form.get("refundedAt")) })), onRefunded); }
  return <Dialog open onClose={() => { if (!mutation.busy) onClose(); }} title="Registrar devolução" description={`${invoice.partner?.businessName ?? "Parceiro"} · Disponível para devolver: ${money(balance)}`} className="ac-dialog ac-dialog-small"><form onSubmit={(event) => void submit(event)}><p className="ac-form-note">Registre aqui uma devolução já realizada fora da Stripe. A equipe financeira continua responsável por executar o PIX ou a transferência.</p><fieldset className="ac-form-grid" disabled={mutation.busy}><AdminField label="Valor devolvido (R$)"><input name="amount" type="number" min="0.01" step="0.01" max={(balance / 100).toFixed(2)} defaultValue={(balance / 100).toFixed(2)} required /></AdminField><AdminField label="Meio da devolução"><select name="method"><option value="PIX">PIX</option><option value="BANK_TRANSFER">Transferência</option><option value="CASH">Dinheiro</option><option value="OTHER">Outro</option></select></AdminField><AdminField label="Comprovante / referência" full><input name="reference" minLength={3} maxLength={250} required /></AdminField><AdminField label="Data da devolução" full><input name="refundedAt" type="datetime-local" defaultValue={localDateInput(new Date().toISOString())} required /></AdminField></fieldset><AdminFeedback error={mutation.error} /><AdminSubmit busy={mutation.busy} label="Registrar devolução" onCancel={onClose} /></form></Dialog>;
}

function ReleaseStripeDialog({ invoice, onClose, onReleased }: { invoice: CommercialInvoice; onClose: () => void; onReleased: () => void }) {
  const mutation = useAdminMutation();
  return <Dialog open onClose={() => { if (!mutation.busy) onClose(); }} title="Encerrar link de pagamento?" description={`${invoice.partner?.businessName ?? "Parceiro"} · ${invoice.description}`} className="ac-dialog ac-dialog-small"><p className="ac-form-note">O link hospedado da Stripe será expirado. Se o pagamento já tiver sido concluído, o encerramento será recusado e a conciliação do webhook deve terminar primeiro.</p><AdminFeedback error={mutation.error} /><div className="ac-form-actions"><button type="button" className="ac-button ac-button-secondary" onClick={onClose} disabled={mutation.busy}>Voltar</button><button type="button" className="ac-button ac-button-danger-ghost" disabled={mutation.busy} onClick={() => void mutation.run(() => commercialRequest(`${commercialBase}/invoices/${encodeURIComponent(invoice.id)}/stripe-release`, commercialJson("POST", {})), onReleased)}>{mutation.busy ? "Encerrando…" : "Expirar link"}</button></div></Dialog>;
}

function CreateInvoiceDialog({
  partners,
  campaigns,
  onClose,
  onCreated,
}: {
  partners: CommercialPartner[];
  campaigns: CommercialCampaign[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const mutation = useAdminMutation();
  const [defaultDueAt] = useState(() => localDateInput(new Date(Date.now() + 7 * 86400000).toISOString()));
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "");

  const partnerCampaigns = campaigns.filter(
    (c) => c.partnerId === partnerId && (!c.invoice || c.invoice.status === "CANCELED")
  );

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await mutation.run(() => {
      const dueAt = isoDate(form.get("dueAt"));
      const amountCents = amountFromForm(form.get("amount"));
      const campaignId = formText(form, "campaignId") || null;
      const description = formText(form, "description");

      const payload = {
        partnerId,
        campaignId,
        description,
        amountCents,
        dueAt,
      };

      return commercialRequest(
        `${commercialBase}/invoices`,
        commercialJson("POST", payload)
      );
    }, onCreated);
  }

  return (
    <Dialog
      open
      onClose={() => {
        if (!mutation.busy) onClose();
      }}
      title="Emitir Nova Fatura"
      description="Gere uma fatura para cobrança de anúncios ou serviços de parceria."
      className="ac-dialog"
    >
      <form onSubmit={(e) => void submit(e)} aria-busy={mutation.busy}>
        <fieldset className="ac-form-grid" disabled={mutation.busy}>
          <AdminField label="Parceiro" full>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              required
            >
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.businessName} ({p.contactName})
                </option>
              ))}
            </select>
          </AdminField>

          {partnerCampaigns.length > 0 && (
            <AdminField
              label="Vincular a uma Campanha (opcional)"
              hint="Se selecionada, a liberação da veiculação fica atrelada à baixa desta fatura."
              full
            >
              <select name="campaignId" defaultValue="">
                <option value="">Nenhuma (Fatura avulsa / serviço)</option>
                {partnerCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({money(c.amountCents)})
                  </option>
                ))}
              </select>
            </AdminField>
          )}

          <AdminField label="Descrição da cobrança" full>
            <input
              name="description"
              required
              minLength={3}
              maxLength={250}
              placeholder="Ex.: Veiculação de Banner na Página Inicial - 30 dias"
            />
          </AdminField>

          <AdminField label="Valor em Reais (R$)">
            <input
              name="amount"
              type="text"
              required
              placeholder="Ex.: 350,00"
            />
          </AdminField>

          <AdminField label="Data de Vencimento">
            <input
              name="dueAt"
              type="datetime-local"
              defaultValue={defaultDueAt}
              required
            />
          </AdminField>
        </fieldset>

        <AdminFeedback error={mutation.error} />
        <AdminSubmit busy={mutation.busy} label="Emitir Fatura" onCancel={onClose} />
      </form>
    </Dialog>
  );
}

function ManualPaymentDialog({
  invoice,
  onClose,
  onConfirmed,
}: {
  invoice: CommercialInvoice;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const mutation = useAdminMutation();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await mutation.run(() => {
      const method = formText(form, "method") as "PIX" | "BANK_TRANSFER" | "CASH" | "OTHER";
      const reference = formText(form, "reference");
      const paidAt = form.get("paidAt") ? isoDate(form.get("paidAt")) : undefined;
      const amountCents = amountFromForm(form.get("amount"));

      const payload = {
        method,
        reference,
        paidAt,
        amountCents,
      };

      return commercialRequest(
        `${commercialBase}/invoices/${encodeURIComponent(invoice.id)}/manual-payment`,
        commercialJson("POST", payload)
      );
    }, onConfirmed);
  }

  return (
    <Dialog
      open
      onClose={() => {
        if (!mutation.busy) onClose();
      }}
      title="Registrar Baixa Manual (PIX / Transferência)"
      description={`Fatura: ${invoice.description} · Saldo pendente: ${money(invoice.amountCents - (invoice.receivedCents ?? 0))}`}
      className="ac-dialog"
    >
      <form onSubmit={(e) => void submit(e)} aria-busy={mutation.busy}>
        <div className="ac-payment-summary-box">
          <p>
            <strong>Parceiro:</strong> {invoice.partner?.businessName}
          </p>
          <p>
            <strong>Já recebido:</strong> {money(invoice.receivedCents ?? 0)}
          </p>
          <p><strong>Saldo pendente:</strong> {money(invoice.amountCents - (invoice.receivedCents ?? 0))}</p>
        </div>

        <fieldset className="ac-form-grid" disabled={mutation.busy}>
          <AdminField label="Valor recebido (R$)" hint="Permite registrar uma parcela. A campanha só libera após a quitação total."><input name="amount" type="number" min="0.01" step="0.01" max={((invoice.amountCents - (invoice.receivedCents ?? 0)) / 100).toFixed(2)} defaultValue={((invoice.amountCents - (invoice.receivedCents ?? 0)) / 100).toFixed(2)} required /></AdminField>
          <AdminField label="Forma de pagamento recebida">
            <select name="method" defaultValue="PIX" required>
              <option value="PIX">PIX (Chave / QR Code)</option>
              <option value="BANK_TRANSFER">Transferência bancária (TED/DOC)</option>
              <option value="CASH">Dinheiro em mãos</option>
              <option value="OTHER">Outro meio acordado</option>
            </select>
          </AdminField>

          <AdminField
            label="Código / Comprovante de Transação"
            hint="Código E2E do PIX ou número do comprovante bancário."
            full
          >
            <input
              name="reference"
              required
              minLength={3}
              maxLength={250}
              placeholder="Ex.: E1823612020261019001 ou Comp-98212"
            />
          </AdminField>

          <AdminField label="Data do Pagamento">
            <input
              name="paidAt"
              type="datetime-local"
              defaultValue={localDateInput(new Date().toISOString())}
              required
            />
          </AdminField>
        </fieldset>

        <AdminFeedback error={mutation.error} />
        <AdminSubmit busy={mutation.busy} label="Confirmar Recebimento" onCancel={onClose} />
      </form>
    </Dialog>
  );
}

function StripeCheckoutDialog({
  invoice,
  onClose,
  onGenerated,
}: {
  invoice: CommercialInvoice;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const mutation = useAdminMutation();
  const [checkoutUrl, setCheckoutUrl] = useState(invoice.checkoutUrl ?? "");
  const [copied, setCopied] = useState(false);

  async function generateCheckout() {
    await mutation.run(async () => {
      const res = await commercialRequest<{ url: string }>(
        `${commercialBase}/invoices/${encodeURIComponent(invoice.id)}/stripe-checkout`,
        commercialJson("POST", {})
      );
      setCheckoutUrl(res.url);
      onGenerated();
    });
  }

  function copyToClipboard() {
    if (!checkoutUrl) return;
    void navigator.clipboard.writeText(checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Link de Pagamento Stripe (Cartão)"
      description={`Parceiro: ${invoice.partner?.businessName} · Valor: ${money(invoice.amountCents)}`}
      className="ac-dialog ac-dialog-small"
    >
      <div className="ac-stripe-checkout-content">
        {checkoutUrl ? (
          <div className="ac-checkout-ready">
            <CheckCircle2 size={36} className="ac-icon-success" aria-hidden="true" />
            <h3>Link de pagamento gerado!</h3>
            <p>Envie o link abaixo para o parceiro concluir o pagamento com cartão de crédito:</p>
            <div className="ac-copy-link-box">
              <input readOnly value={checkoutUrl} aria-label="URL de checkout Stripe" />
              <button
                type="button"
                className="ac-button ac-button-secondary"
                onClick={copyToClipboard}
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
            <div className="ac-checkout-actions">
              <a
                href={checkoutUrl}
                target="_blank"
                rel="noreferrer"
                className="ac-button"
              >
                Abrir Checkout <ExternalLink size={15} aria-hidden="true" />
              </a>
              <button type="button" className="ac-button ac-button-secondary" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <div className="ac-checkout-prompt">
            <CreditCard size={36} aria-hidden="true" />
            <p>
              Ao gerar a sessão, uma URL hospedada e segura na Stripe será criada para a fatura de{" "}
              <strong>{money(invoice.amountCents)}</strong>.
            </p>
            <AdminFeedback error={mutation.error} />
            <div className="ac-form-actions">
              <button type="button" className="ac-button ac-button-secondary" onClick={onClose}>
                Voltar
              </button>
              <button
                type="button"
                className="ac-button"
                onClick={() => void generateCheckout()}
                disabled={mutation.busy}
              >
                {mutation.busy ? "Gerando na Stripe…" : "Gerar Link de Checkout"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function CancelInvoiceDialog({
  invoice,
  onClose,
  onCancelled,
}: {
  invoice: CommercialInvoice;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const mutation = useAdminMutation();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await mutation.run(() => {
      return commercialRequest(
        `${commercialBase}/invoices/${encodeURIComponent(invoice.id)}/cancel`,
        commercialJson("POST", {})
      );
    }, onCancelled);
  }

  return (
    <Dialog
      open
      onClose={() => {
        if (!mutation.busy) onClose();
      }}
      title="Cancelar Fatura?"
      description={`Tem certeza de que deseja cancelar a fatura no valor de ${money(invoice.amountCents)} para ${invoice.partner?.businessName}?`}
      className="ac-dialog ac-dialog-small"
    >
      <form onSubmit={(e) => void submit(e)} aria-busy={mutation.busy}>
        <p className="ac-form-note">
          A fatura será marcada como cancelada. Campanhas vinculadas que dependem deste pagamento não serão veiculadas.
        </p>
        <AdminFeedback error={mutation.error} />
        <AdminSubmit
          busy={mutation.busy}
          label="Sim, Cancelar Fatura"
          onCancel={onClose}
        />
      </form>
    </Dialog>
  );
}
