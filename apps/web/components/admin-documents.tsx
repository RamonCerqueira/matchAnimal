"use client";

import { useState, type FormEvent } from "react";
import { ExternalLink, FileText, RefreshCw, UploadCloud } from "lucide-react";
import { AdminBadge, AdminFeedback, AdminField, AdminState, commercialApi, commercialBase, dateBR, errorMessage, useAdminResource } from "@/components/admin-commercial-core";

type LinkKind = "partnerId" | "invoiceId" | "eventId";
type DocumentItem = { id: string; filename: string; kind: string; mimeType: string; sizeBytes: number; createdAt: string; url: string; expiresAt: string | null };
type Option = { id: string; label: string };
const kinds: Record<string, string> = { CONTRACT: "Contrato", PAYMENT_PROOF: "Comprovante de pagamento", EVENT_AUTHORIZATION: "Autorização de evento", REGISTRATION: "Cadastro", OTHER: "Outro" };
const humanSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function AdminDocuments({ canCommercial, canFinance }: { canCommercial: boolean; canFinance: boolean }) {
  const partners = useAdminResource<{ id: string; businessName: string }[]>(`${commercialBase}/partners`);
  const invoices = useAdminResource<{ id: string; description: string; partner: { businessName: string } }[]>(`${commercialBase}/invoices`, canFinance);
  const events = useAdminResource<{ id: string; title: string; startsAt: string }[]>(`${commercialBase}/events`, canCommercial);
  const [linkKind, setLinkKind] = useState<LinkKind>("partnerId");
  const [linkId, setLinkId] = useState("");
  const [docKind, setDocKind] = useState("CONTRACT");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const documentsResource = useAdminResource<DocumentItem[]>(`${commercialBase}/documents?${linkKind}=${encodeURIComponent(linkId)}`, !!linkId);
  const options: Option[] = linkKind === "partnerId" ? (partners.data ?? []).map((item) => ({ id: item.id, label: item.businessName })) : linkKind === "invoiceId" ? (invoices.data ?? []).map((item) => ({ id: item.id, label: `${item.partner.businessName} · ${item.description}` })) : (events.data ?? []).map((item) => ({ id: item.id, label: `${item.title} · ${dateBR(item.startsAt, true)}` }));

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!files?.length || !linkId || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = new FormData(); for (const file of Array.from(files)) data.append("files", file); data.append(linkKind, linkId); data.append("kind", docKind);
      const response = await fetch(`${commercialApi}${commercialBase}/documents`, { method: "POST", credentials: "include", body: data });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ? (Array.isArray(result.message) ? result.message.join(" ") : result.message) : "Não foi possível enviar os documentos.");
      setFiles(null); event.currentTarget.reset(); setNotice(`${Array.isArray(result) ? result.length : 1} documento(s) anexado(s).`); documentsResource.reload();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  const records = documentsResource.data ?? [];
  return <section className="ac-section"><header className="ac-section-heading"><div><span>REGISTROS COM ACESSO RESTRITO</span><h2>Documentos operacionais</h2><p>Contratos, comprovantes e autorizações anexados ao parceiro, à fatura ou ao evento.</p></div></header>
    <AdminFeedback notice={notice} error={error} />
    <div className="ac-form-grid"><AdminField label="Vincular documento a"><select value={linkKind} onChange={(event) => { setLinkKind(event.target.value as LinkKind); setLinkId(""); }}><option value="partnerId">Parceiro</option>{canFinance && <option value="invoiceId">Fatura</option>}{canCommercial && <option value="eventId">Evento</option>}</select></AdminField><AdminField label="Registro"><select value={linkId} onChange={(event) => setLinkId(event.target.value)}><option value="">Selecione...</option>{options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></AdminField></div>
    <form className="ac-form-grid" onSubmit={(event) => void upload(event)}><AdminField label="Categoria"><select value={docKind} onChange={(event) => setDocKind(event.target.value)}><option value="CONTRACT">Contrato</option><option value="PAYMENT_PROOF">Comprovante de pagamento</option><option value="EVENT_AUTHORIZATION">Autorização de evento</option><option value="REGISTRATION">Cadastro</option><option value="OTHER">Outro</option></select></AdminField><AdminField label="Arquivos PDF, JPG ou PNG (até 15 MB cada)" full><input type="file" accept="application/pdf,image/jpeg,image/png" multiple onChange={(event) => setFiles(event.target.files)} /></AdminField><button className="ac-button" type="submit" disabled={busy || !linkId || !files?.length}><UploadCloud size={17} />{busy ? "Enviando…" : "Anexar documentos"}</button></form>
    <div className="ac-toolbar"><strong>Arquivos vinculados</strong><button type="button" className="ac-icon-button" aria-label="Atualizar documentos" disabled={!linkId || documentsResource.loading} onClick={documentsResource.reload}><RefreshCw size={17} /></button></div>
    <AdminFeedback error={error || documentsResource.error} />
    <AdminState loading={documentsResource.loading} error={documentsResource.error} onRetry={documentsResource.reload} empty={!linkId || !documentsResource.data?.length} emptyTitle={linkId ? "Nenhum documento anexado" : "Selecione um registro"} emptyText={linkId ? "Os arquivos enviados para esse registro aparecerão aqui." : "Escolha um parceiro, fatura ou evento para anexar e consultar arquivos."}><div className="ac-audit-list">{records.map((item) => <article key={item.id}><span><FileText size={18} /></span><div><strong>{item.filename}</strong><small>{kinds[item.kind] ?? item.kind} · {humanSize(item.sizeBytes)} · {dateBR(item.createdAt, true)}</small><AdminBadge tone="accent">Restrito</AdminBadge></div><a className="ac-button ac-button-secondary" href={`${commercialApi}${item.url}`} target="_blank" rel="noreferrer"><ExternalLink size={15} />Abrir</a></article>)}</div></AdminState>
  </section>;
}
