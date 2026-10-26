"use client";

import { useState, type FormEvent } from "react";
import { ExternalLink, Mail, Pencil, Plus, RefreshCw, Search, Store } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { AdminBadge, AdminFeedback, AdminField, AdminState, AdminSubmit, commercialBase, commercialJson, commercialRequest, dateBR, formText, partnerCategories, useAdminMutation, useAdminResource, type CommercialPartner } from "@/components/admin-commercial-core";

export function AdminCommercialPartners() {
  const resource = useAdminResource<CommercialPartner[]>(`${commercialBase}/partners`);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [editing, setEditing] = useState<CommercialPartner | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const filtered = (resource.data ?? []).filter((partner) => (status === "ALL" || partner.status === status) && (category === "ALL" || partner.category === category) && `${partner.businessName} ${partner.legalName ?? ""} ${partner.taxId ?? ""} ${partner.contactName} ${partner.email} ${partner.city ?? ""}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  return <section className="ac-section"><header className="ac-section-heading"><div><span>RELACIONAMENTO COMERCIAL</span><h2>Parceiros</h2><p>Cadastre empresas, responsáveis e organizações que anunciam no MatchAnimal.</p></div><button className="ac-button" type="button" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={18} aria-hidden="true" />Novo parceiro</button></header>
    <AdminFeedback notice={notice} />
    <div className="ac-toolbar"><label className="ac-search"><Search size={18} aria-hidden="true" /><input aria-label="Buscar parceiro" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, documento, contato ou cidade" /></label><select aria-label="Filtrar situação do parceiro" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Todas as situações</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select><select aria-label="Filtrar categoria de parceiro" value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">Todas as categorias</option>{Object.entries(partnerCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="ac-icon-button" type="button" onClick={resource.reload} disabled={resource.loading} aria-label="Atualizar parceiros"><RefreshCw size={18} aria-hidden="true" /></button></div>
    <AdminState loading={resource.loading} error={resource.error} onRetry={resource.reload} empty={!filtered.length} emptyTitle={resource.data?.length ? "Nenhum parceiro neste filtro" : "Sua rede começa por um parceiro"} emptyText="Cadastre o negócio e seu responsável para vincular campanhas, mídias e cobranças."><div className="ac-table-wrap"><table className="ac-table"><caption className="sr-only">Parceiros comerciais cadastrados</caption><thead><tr><th scope="col">Parceiro</th><th scope="col">Contato</th><th scope="col">Categoria / região</th><th scope="col">Situação</th><th scope="col">Ação</th></tr></thead><tbody>{filtered.map((partner) => <tr key={partner.id}><td><div className="ac-person"><span><Store size={20} aria-hidden="true" /></span><div><strong>{partner.businessName}</strong><small>{partner.legalName || `Desde ${dateBR(partner.createdAt)}`}</small>{partner.taxId && <small>{partner.taxId}</small>}<small>{partner._count?.campaigns ?? 0} campanhas · {partner._count?.invoices ?? 0} cobranças · {partner._count?.events ?? 0} eventos</small></div></div></td><td><strong>{partner.contactName}</strong><a className="ac-table-link" href={`mailto:${partner.email}`}><Mail size={14} aria-hidden="true" />{partner.email}</a>{partner.phone && <a className="ac-table-link" href={`tel:${partner.phone.replace(/[^+0-9]/g, "")}`}>{partner.phone}</a>}{partner.whatsapp && <a className="ac-table-link" href={`https://wa.me/${partner.whatsapp.replace(/[^0-9]/g, "").replace(/^(?=\d{10,11}$)/, "55")}`} target="_blank" rel="noopener noreferrer">Abrir WhatsApp<ExternalLink size={13} aria-hidden="true" /></a>}</td><td><strong>{partnerCategories[partner.category] ?? partner.category}</strong><small>{[partner.city, partner.state].filter(Boolean).join(", ") || "Região não informada"}</small></td><td><AdminBadge tone={partner.status === "ACTIVE" ? "success" : "neutral"}>{partner.status === "ACTIVE" ? "Ativo" : "Inativo"}</AdminBadge></td><td><div className="ac-row-actions"><button type="button" className="ac-button ac-button-secondary" onClick={() => { setEditing(partner); setFormOpen(true); }}><Pencil size={16} aria-hidden="true" />Editar</button>{partner.website && <a href={partner.website} className="ac-icon-button" target="_blank" rel="noreferrer" aria-label={`Abrir site de ${partner.businessName}`}><ExternalLink size={17} aria-hidden="true" /></a>}</div></td></tr>)}</tbody></table></div></AdminState>
    {formOpen && <PartnerForm key={editing?.id ?? "new"} partner={editing} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); setNotice(editing ? "Dados do parceiro atualizados." : "Parceiro cadastrado."); resource.reload(); }} />}
  </section>;
}

function PartnerForm({ partner, onClose, onSaved }: { partner: CommercialPartner | null; onClose: () => void; onSaved: () => void }) {
  const mutation = useAdminMutation();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const optional = (key: string) => formText(form, key) || null;
    const payload = { businessName: formText(form, "businessName"), contactName: formText(form, "contactName"), email: formText(form, "email"), phone: optional("phone"), website: optional("website"), city: optional("city"), state: optional("state")?.toUpperCase() ?? null, category: formText(form, "category"), status: formText(form, "status"), notes: optional("notes"), legalName: optional("legalName"), taxId: optional("taxId"), whatsapp: optional("whatsapp"), billingContact: optional("billingContact"), billingEmail: optional("billingEmail"), postalCode: optional("postalCode"), street: optional("street"), addressNumber: optional("addressNumber"), complement: optional("complement"), district: optional("district"), instagram: optional("instagram"), description: optional("description"), commercialOwner: optional("commercialOwner") };
    await mutation.run(() => commercialRequest(`${commercialBase}/partners${partner ? `/${encodeURIComponent(partner.id)}` : ""}`, commercialJson(partner ? "PATCH" : "POST", payload)), onSaved);
  }
  return <Dialog open onClose={() => { if (!mutation.busy) onClose(); }} title={partner ? "Ficha do parceiro" : "Novo parceiro"} description="Organize os dados do negócio e os contatos da parceria. Os campos com * são obrigatórios; os demais podem ser completados depois. Contatos e dados comerciais ficam restritos à administração." className="ac-dialog ac-dialog-wide">
    <form onSubmit={(event) => void submit(event)} aria-busy={mutation.busy}>
      <fieldset className="ac-partner-form" disabled={mutation.busy}>
        <section aria-labelledby="partner-business"><h3 id="partner-business">1. Identidade do negócio</h3><p>Como a empresa é conhecida e quais serviços oferece.</p><div className="ac-form-grid">
          <AdminField label="Nome comercial *" full><input name="businessName" defaultValue={partner?.businessName} minLength={2} maxLength={160} required autoComplete="organization" placeholder="Ex.: Pet da Vila" /></AdminField>
          <AdminField label="Razão social"><input name="legalName" defaultValue={partner?.legalName ?? ""} maxLength={180} /></AdminField>
          <AdminField label="Documento empresarial" hint="Informe o identificador da empresa. O cadastro não realiza consulta cadastral externa."><input name="taxId" defaultValue={partner?.taxId ?? ""} maxLength={32} placeholder="CNPJ ou registro da organização" /></AdminField>
          <AdminField label="Categoria"><select name="category" defaultValue={partner?.category ?? "PET_SHOP"}>{Object.entries(partnerCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></AdminField>
          <AdminField label="Situação" hint="Inativar suspende a exibição dos anúncios deste parceiro."><select name="status" defaultValue={partner?.status ?? "ACTIVE"}><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option></select></AdminField>
          <AdminField label="Apresentação e serviços" full><textarea name="description" defaultValue={partner?.description ?? ""} maxLength={2000} rows={3} placeholder="Especialidades, serviços e diferenciais do negócio" /></AdminField>
        </div></section>
        <section aria-labelledby="partner-contact"><h3 id="partner-contact">2. Contatos e presença digital</h3><p>Tenha um contato comercial e um contato financeiro identificados.</p><div className="ac-form-grid">
          <AdminField label="Responsável comercial *"><input name="contactName" defaultValue={partner?.contactName} minLength={2} maxLength={100} required autoComplete="name" /></AdminField>
          <AdminField label="E-mail comercial *"><input name="email" type="email" defaultValue={partner?.email} maxLength={254} required autoComplete="email" /></AdminField>
          <AdminField label="Telefone"><input name="phone" type="tel" defaultValue={partner?.phone ?? ""} maxLength={30} autoComplete="tel" placeholder="(71) 3333-0000" /></AdminField>
          <AdminField label="WhatsApp" hint="Inclua DDD e código do país para contatos internacionais."><input name="whatsapp" type="tel" defaultValue={partner?.whatsapp ?? ""} maxLength={30} placeholder="+55 71 99999-0000" /></AdminField>
          <AdminField label="Responsável financeiro"><input name="billingContact" defaultValue={partner?.billingContact ?? ""} maxLength={100} /></AdminField>
          <AdminField label="E-mail financeiro"><input name="billingEmail" type="email" defaultValue={partner?.billingEmail ?? ""} maxLength={254} /></AdminField>
          <AdminField label="Site"><input name="website" type="url" defaultValue={partner?.website ?? ""} placeholder="https://" maxLength={2000} /></AdminField>
          <AdminField label="Instagram" hint="Somente o nome do perfil, sem @ ou link."><input name="instagram" defaultValue={partner?.instagram ?? ""} maxLength={30} pattern="[A-Za-z0-9_.]+" placeholder="petdavila" /></AdminField>
        </div></section>
        <section aria-labelledby="partner-address"><h3 id="partner-address">3. Endereço do estabelecimento</h3><p>Informe o endereço comercial. Esses dados não aparecem automaticamente nos anúncios.</p><div className="ac-form-grid">
          <AdminField label="CEP"><input name="postalCode" defaultValue={partner?.postalCode ?? ""} maxLength={9} pattern="[0-9]{5}-?[0-9]{3}" placeholder="40000-000" autoComplete="postal-code" /></AdminField>
          <AdminField label="Bairro"><input name="district" defaultValue={partner?.district ?? ""} maxLength={100} /></AdminField>
          <AdminField label="Rua / avenida"><input name="street" defaultValue={partner?.street ?? ""} maxLength={180} autoComplete="address-line1" /></AdminField>
          <AdminField label="Número"><input name="addressNumber" defaultValue={partner?.addressNumber ?? ""} maxLength={30} placeholder="123 ou s/n" /></AdminField>
          <AdminField label="Complemento" full><input name="complement" defaultValue={partner?.complement ?? ""} maxLength={100} autoComplete="address-line2" /></AdminField>
          <AdminField label="Cidade"><input name="city" defaultValue={partner?.city ?? ""} maxLength={100} autoComplete="address-level2" /></AdminField>
          <AdminField label="Estado"><select name="state" defaultValue={partner?.state ?? ""} autoComplete="address-level1"><option value="">Selecione</option>{"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ").map((uf) => <option key={uf} value={uf}>{uf}</option>)}</select></AdminField>
        </div></section>
        <section aria-labelledby="partner-operation"><h3 id="partner-operation">4. Gestão da parceria</h3><p>Informações internas para a equipe acompanhar o relacionamento.</p><div className="ac-form-grid">
          <AdminField label="Responsável interno pela parceria" full><input name="commercialOwner" defaultValue={partner?.commercialOwner ?? ""} maxLength={100} placeholder="Nome da pessoa da equipe MatchAnimal" /></AdminField>
          <AdminField label="Observações e condições comerciais" full><textarea name="notes" defaultValue={partner?.notes ?? ""} maxLength={2000} rows={4} placeholder="Acordos, próximos contatos e orientações para a equipe" /></AdminField>
        </div></section>
      </fieldset>
      <AdminFeedback error={mutation.error} /><AdminSubmit busy={mutation.busy} label={partner ? "Salvar alterações" : "Cadastrar parceiro"} onCancel={onClose} />
    </form>
  </Dialog>;
}
