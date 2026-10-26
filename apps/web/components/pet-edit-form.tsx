"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, LoaderCircle, PawPrint, Save, ShieldCheck } from "lucide-react";
import { apiBaseUrl } from "@/lib/api-config";
import { petTemperamentTraits } from "@/components/pet-form";

type Pet = {
  id: string; name: string; species: "DOG" | "CAT" | "OTHER"; speciesOther: string | null; breed: string | null;
  sex: "FEMALE" | "MALE" | "UNKNOWN"; size: "SMALL" | "MEDIUM" | "LARGE" | "EXTRA_LARGE" | "UNKNOWN";
  birthDate: string | null; bio: string | null; intent: "FRIENDSHIP" | "RESPONSIBLE_BREEDING" | "ADOPTION";
  temperament: string[]; isPublic: boolean;
};

export function PetEditForm({ petId: providedPetId }: { petId?: string }) {
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [customTrait, setCustomTrait] = useState("");

  useEffect(() => {
    let active = true;
    const petId = providedPetId ?? new URLSearchParams(window.location.search).get("petId");
    if (!petId) {
      setError("Escolha um animal na tela Meus animais para editar o perfil.");
      setLoading(false);
      return () => { active = false; };
    }
    fetch(`${apiBaseUrl}/api/pets/mine`, { credentials: "include" })
      .then(async (response) => {
        const pets = await response.json().catch(() => null) as Pet[] | null;
        if (!response.ok || !Array.isArray(pets)) throw new Error("Não foi possível carregar seus animais.");
        const current = pets.find((item) => item.id === petId);
        if (!current) throw new Error("Esse animal não está na sua conta.");
        if (active) setPet(current);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o perfil."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [providedPetId]);

  function update<K extends keyof Pet>(key: K, value: Pet[K]) {
    setPet((current) => current ? { ...current, [key]: value } : current);
    setSaved(false);
  }

  function toggleTrait(trait: string) {
    if (!pet) return;
    const selected = pet.temperament.includes(trait);
    if (!selected && pet.temperament.length >= 8) return;
    update("temperament", selected ? pet.temperament.filter((item) => item !== trait) : [...pet.temperament, trait]);
  }

  function addTrait() {
    const trait = customTrait.trim().replace(/\s+/g, " ");
    if (!pet || !trait || trait.length > 50 || pet.temperament.length >= 8) return;
    if (pet.temperament.some((item) => item.toLocaleLowerCase("pt-BR") === trait.toLocaleLowerCase("pt-BR"))) return;
    update("temperament", [...pet.temperament, trait]);
    setCustomTrait("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!pet || saving) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const response = await fetch(`${apiBaseUrl}/api/pets/${encodeURIComponent(pet.id)}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pet, birthDate: pet.birthDate?.slice(0, 10) || null, speciesOther: pet.species === "OTHER" ? pet.speciesOther : null }),
      });
      const result = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(" ") : result.message ?? "Não foi possível salvar as alterações.");
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar as alterações."); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="profile-loading"><span className="session-spinner" /> Carregando perfil do animal…</div>;
  if (!pet) return <div className="ma-flow-error" role="alert"><PawPrint size={28} /><h1>Não encontramos esse perfil</h1><p>{error}</p><Link href="/animais">Voltar para meus animais</Link></div>;

  return <div className="pet-create-layout"><main className="pet-create-main pet-edit-main">
    <Link href="/animais" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Meus animais</Link>
    <div className="product-eyebrow"><span><PawPrint size={16} aria-hidden="true" /></span> PERFIL DO SEU COMPANHEIRO</div>
    <h1 className="product-h1">Editar <em>{pet.name}.</em></h1>
    <p className="product-lead">Atualize as informações que ajudam outros tutores a conhecer melhor seu animal.</p>
    <form className="product-form pet-edit-form" onSubmit={(event) => void save(event)}>
      <section className="form-section"><div className="form-section-heading"><span>01</span><div><h2>Informações do perfil</h2><p>Você pode alterar estes dados quando quiser.</p></div></div>
        <div className="form-grid">
          <label className="app-field" htmlFor="edit-pet-name">Nome<input id="edit-pet-name" value={pet.name} maxLength={40} minLength={2} required onChange={(event) => update("name", event.target.value)} /></label>
          <label className="app-field" htmlFor="edit-pet-species">Espécie<select id="edit-pet-species" value={pet.species} onChange={(event) => update("species", event.target.value as Pet["species"])}><option value="DOG">Cão</option><option value="CAT">Gato</option><option value="OTHER">Outra espécie</option></select></label>
          {pet.species === "OTHER" && <label className="app-field" htmlFor="edit-pet-species-other">Qual espécie?<input id="edit-pet-species-other" value={pet.speciesOther ?? ""} maxLength={40} minLength={2} required onChange={(event) => update("speciesOther", event.target.value)} /></label>}
          <label className="app-field" htmlFor="edit-pet-breed">Raça<input id="edit-pet-breed" value={pet.breed ?? ""} maxLength={60} onChange={(event) => update("breed", event.target.value || null)} /></label>
          <label className="app-field" htmlFor="edit-pet-size">Porte<select id="edit-pet-size" value={pet.size} onChange={(event) => update("size", event.target.value as Pet["size"])}><option value="UNKNOWN">Prefiro não informar</option><option value="SMALL">Pequeno</option><option value="MEDIUM">Médio</option><option value="LARGE">Grande</option><option value="EXTRA_LARGE">Gigante</option></select></label>
          <label className="app-field" htmlFor="edit-pet-sex">Sexo<select id="edit-pet-sex" value={pet.sex} onChange={(event) => update("sex", event.target.value as Pet["sex"])}><option value="UNKNOWN">Prefiro não informar</option><option value="FEMALE">Fêmea</option><option value="MALE">Macho</option></select></label>
          <label className="app-field" htmlFor="edit-pet-birth-date">Nascimento<input id="edit-pet-birth-date" type="date" max={new Date().toISOString().slice(0, 10)} value={pet.birthDate?.slice(0, 10) ?? ""} onChange={(event) => update("birthDate", event.target.value || null)} /></label>
          <label className="app-field full" htmlFor="edit-pet-bio">Sobre {pet.name}<textarea id="edit-pet-bio" rows={4} maxLength={700} value={pet.bio ?? ""} onChange={(event) => update("bio", event.target.value || null)} /></label>
        </div>
      </section>
      <section className="form-section"><div className="form-section-heading"><span>02</span><div><h2>Personalidade e objetivo</h2><p>Escolha até 8 características e atualize o que vocês procuram.</p></div></div>
        <div className="trait-options">{petTemperamentTraits.map((trait) => { const selected = pet.temperament.includes(trait); return <label key={trait} className={`trait-option ${selected ? "trait-selected" : ""}`}><input type="checkbox" checked={selected} disabled={!selected && pet.temperament.length >= 8} onChange={() => toggleTrait(trait)} />{selected && <Check size={15} aria-hidden="true" />} {trait}</label>; })}{pet.temperament.filter((trait) => !petTemperamentTraits.includes(trait)).map((trait) => <label key={trait} className="trait-option trait-selected"><input type="checkbox" checked onChange={() => toggleTrait(trait)} /><Check size={15} aria-hidden="true" />{trait}</label>)}</div>
        <div className="pet-custom-trait"><label className="app-field" htmlFor="edit-pet-custom-trait">Outra característica<input id="edit-pet-custom-trait" value={customTrait} maxLength={50} placeholder="Ex.: gosta de água" onChange={(event) => setCustomTrait(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTrait(); } }} /></label><button className="pet-add-trait" type="button" onClick={addTrait} disabled={!customTrait.trim() || pet.temperament.length >= 8}>Adicionar</button></div>
        <div className="form-grid pet-edit-selects"><label className="app-field" htmlFor="edit-pet-intent">O que procuram?<select id="edit-pet-intent" value={pet.intent} onChange={(event) => update("intent", event.target.value as Pet["intent"])}><option value="FRIENDSHIP">Amizade</option><option value="RESPONSIBLE_BREEDING">Relacionamento responsável</option><option value="ADOPTION">Adoção</option></select></label></div>
      </section>
      <label className="visibility-toggle"><input type="checkbox" checked={pet.isPublic} onChange={(event) => update("isPublic", event.target.checked)} /><span className="toggle-ui" aria-hidden="true" /><span><strong>Deixar o perfil visível na descoberta</strong><small>A localização exibida é aproximada; o endereço residencial não é compartilhado.</small></span></label>
      {error && <p className="form-alert" role="alert">{error}</p>}{saved && <p className="inline-success" role="status"><Check size={18} aria-hidden="true" /> Perfil atualizado com sucesso.</p>}
      <div className="form-submit-row pet-form-actions"><Link href="/animais">Cancelar</Link><button type="submit" disabled={saving}>{saving ? <LoaderCircle className="form-spinner" size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}{saving ? "Salvando…" : "Salvar alterações"}</button></div>
    </form>
    <div className="photo-tip"><ShieldCheck size={18} aria-hidden="true" /><p>Para trocar ou reorganizar as fotos, use “Gerenciar fotos” no cartão do animal.</p></div>
  </main></div>;
}
