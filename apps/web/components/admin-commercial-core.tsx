"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Inbox, LoaderCircle, RefreshCw } from "lucide-react";

export const commercialApi = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const commercialBase = "/api/commercial/admin";
export const assetUrl = (url: string) => url.startsWith("/") ? `${commercialApi}${url}` : url;
export const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export const whole = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
export function dateBR(value?: string | null, includeTime = false) { if (!value || Number.isNaN(Date.parse(value))) return "Não informado"; return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", ...(includeTime ? { timeStyle: "short" as const } : {}) }).format(new Date(value)); }
export function localDateInput(value?: string | null) { if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
export function isoDate(value: FormDataEntryValue | null) { const date = new Date(String(value ?? "")); if (Number.isNaN(date.getTime())) throw new Error("Informe uma data e hora válidas."); return date.toISOString(); }
export function formText(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }
export function amountFromForm(value: FormDataEntryValue | null) { const parsed = Number(String(value ?? "").replace(",", ".")); if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Informe um valor válido em reais."); return Math.round(parsed * 100); }
export function errorMessage(cause: unknown) { return cause instanceof TypeError ? "Não conseguimos conectar ao serviço. Tente novamente; seus dados foram mantidos." : cause instanceof Error ? cause.message : "Não foi possível concluir. Tente novamente."; }

export async function commercialRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${commercialApi}${path}`, { credentials: "include", ...options });
  const result: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === "object" && "message" in result ? result.message : null;
    throw new Error(Array.isArray(message) ? message.join(" ") : typeof message === "string" ? message : response.status === 403 ? "Sua conta não possui acesso a esta operação administrativa." : "Não foi possível carregar ou salvar estes dados.");
  }
  return result as T;
}
export const commercialJson = (method: "POST" | "PATCH", body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function useAdminResource<T>(path: string, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [completed, setCompleted] = useState<{ path: string; revision: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void commercialRequest<T>(path, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) { setData(result); setError(""); setCompleted({ path, revision }); } }).catch((cause: unknown) => { if (!controller.signal.aborted) { setError(errorMessage(cause)); setCompleted({ path, revision }); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, revision, enabled]);
  const reload = useCallback(() => { setLoading(true); setError(""); setRevision((value) => value + 1); }, []);
  return { data, loading: enabled && (loading || completed?.path !== path || completed.revision !== revision), error: enabled ? error : "", reload };
}

export function useAdminMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function run<T>(job: () => Promise<T>, onSuccess?: (result: T) => void) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { const result = await job(); onSuccess?.(result); return result; }
    catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setBusy(false); }
  }
  return { busy, error, run, clearError: () => setError("") };
}

export function AdminState({ loading, error, onRetry, children, empty, emptyTitle = "Nenhum registro ainda", emptyText = "Os registros aparecerão aqui assim que forem cadastrados." }: { loading: boolean; error: string; onRetry: () => void; children: ReactNode; empty?: boolean; emptyTitle?: string; emptyText?: string }) {
  if (loading) return <div className="ac-state" role="status"><LoaderCircle className="ac-spin" size={25} aria-hidden="true" /><span>Carregando dados…</span></div>;
  if (error) return <div className="ac-state ac-state-error" role="alert"><AlertCircle size={30} aria-hidden="true" /><h3>Não conseguimos carregar</h3><p>{error}</p><button type="button" className="ac-button ac-button-secondary" onClick={onRetry}><RefreshCw size={17} aria-hidden="true" />Tentar novamente</button></div>;
  if (empty) return <div className="ac-state"><Inbox size={32} aria-hidden="true" /><h3>{emptyTitle}</h3><p>{emptyText}</p></div>;
  return children;
}
export function AdminFeedback({ error, notice }: { error?: string; notice?: string }) { return <>{error && <p className="ac-feedback ac-feedback-error" role="alert"><AlertCircle size={18} aria-hidden="true" />{error}</p>}{notice && <p className="ac-feedback ac-feedback-success" role="status"><CheckCircle2 size={18} aria-hidden="true" />{notice}</p>}</>; }
export function AdminField({ label, hint, children, full = false }: { label: string; hint?: string; children: ReactNode; full?: boolean }) { return <label className={`ac-field ${full ? "ac-field-full" : ""}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function AdminSubmit({ busy, label = "Salvar", onCancel }: { busy: boolean; label?: string; onCancel: () => void }) { return <div className="ac-form-actions"><button type="button" className="ac-button ac-button-secondary" disabled={busy} onClick={onCancel}>Cancelar</button><button type="submit" className="ac-button" disabled={busy}>{busy && <LoaderCircle className="ac-spin" size={18} aria-hidden="true" />}{busy ? "Salvando…" : label}</button></div>; }
export function AdminBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "accent" }) { return <span className={`ac-badge ac-badge-${tone}`}>{children}</span>; }
export function AdminMetric({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon: ReactNode }) { return <article className="ac-metric"><span>{icon}</span><p>{label}</p><strong>{value}</strong>{hint && <small>{hint}</small>}</article>; }

export type CommercialPartner = { legalName?: string | null; taxId?: string | null; whatsapp?: string | null; billingContact?: string | null; billingEmail?: string | null; postalCode?: string | null; street?: string | null; addressNumber?: string | null; complement?: string | null; district?: string | null; instagram?: string | null; description?: string | null; commercialOwner?: string | null; id: string; businessName: string; contactName: string; email: string; phone: string | null; website: string | null; city: string | null; state: string | null; category: string; status: "ACTIVE" | "INACTIVE"; notes: string | null; createdAt: string; _count?: { campaigns: number; invoices: number; events?: number } };
export type CommercialAsset = { id: string; partnerId?: string | null; filename: string; storageKey: string; mimeType: string; mediaType: "IMAGE" | "VIDEO"; width: number; height: number; durationSeconds?: number | null; sizeBytes: number; createdAt: string; createdById: string; url: string; partner?: { businessName: string } | null };
export type PlacementSpec = { id: string; label: string; width: number; height: number; ratios: number[]; mediaTypes: string[]; maxImageBytes: number; maxVideoBytes: number; maxDurationSeconds: number; minWidth: number; acceptedMimeTypes: string[]; description: string };
export type CommercialCampaign = { id: string; partnerId: string; assetId: string; name: string; headline: string; body: string | null; ctaLabel: string; destinationUrl: string; placement: string; startsAt: string; endsAt: string; amountCents: number; targetCity: string | null; targetState: string | null; status: "DRAFT" | "PUBLISHED" | "PAUSED" | "ARCHIVED"; approvalStatus?: "PENDING" | "APPROVED" | "REJECTED"; approvalNote?: string | null; createdAt: string; partner?: CommercialPartner; asset?: CommercialAsset; invoice?: CommercialInvoice | null; invoices?: CommercialInvoice[]; deliveryStatus?: string; deliveryReason?: string };
export type CommercialInvoice = { id: string; partnerId: string; campaignId: string | null; description: string; amountCents: number; receivedCents?: number; refundedCents?: number; feeCents?: number; status: string; dueAt: string; paidAt: string | null; method: string | null; reference: string | null; checkoutUrl?: string | null; stripeCheckoutId?: string | null; createdAt: string; partner?: { id: string; businessName: string }; campaign?: { id: string; name: string } | null };
export type CommercialEvent = { id: string; title: string; description: string; startsAt: string; endsAt: string | null; locationLabel: string; latitude: number | null; longitude: number | null; capacity: number | null; rules: string | null; visibility: "PUBLIC" | "PRIVATE"; isCancelled: boolean; createdAt: string; partnerId?: string | null; partner?: { id: string; businessName: string } | null; _count?: { participants: number }; organizer?: { tutor: { displayName: string } | null } };
export const partnerCategories: Record<string, string> = { PET_SHOP: "Pet shop", VETERINARY: "Clínica veterinária", GROOMING: "Banho e tosa", ORGANIZATION: "ONG / organização", OTHER: "Outro" };
export const placementLabels: Record<string, string> = { HOME_BANNER: "Banner na página inicial", COMMUNITY_FEED: "Anúncio na comunidade", EXPLORE_CARD: "Card no Explorar" };
