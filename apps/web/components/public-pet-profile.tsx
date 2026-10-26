"use client";

import { apiBaseUrl } from "@/lib/api-config";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, MapPin, PawPrint, ShieldCheck, Users } from "lucide-react";

type PetDetails = { id: string; name: string; species: string; speciesOther: string | null; breed: string | null; sex: string; size: string; birthDate: string | null; bio: string | null; intent: string; temperament: string[]; city: string | null; state: string | null; coverPhotoUrl: string | null; photos?: Array<{ id: string; altText: string | null; sortOrder: number; url: string }> };
type SocialSummary = { followerCount: number; postCount: number; followedByMe: boolean; isOwner: boolean };
const api = apiBaseUrl;
const translations: Record<string, string> = { DOG: "Cão", CAT: "Gato", OTHER: "Outra espécie", FEMALE: "Fêmea", MALE: "Macho", UNKNOWN: "Não informado", SMALL: "Pequeno", MEDIUM: "Médio", LARGE: "Grande", EXTRA_LARGE: "Gigante", FRIENDSHIP: "Amizade", RESPONSIBLE_BREEDING: "Relacionamento responsável", ADOPTION: "Disponível para adoção" };

export function PublicPetProfile({ petId }: { petId: string }) {
  const [pet, setPet] = useState<PetDetails | null>(null);
  const [social, setSocial] = useState<SocialSummary | null>(null);
  const [followRequested, setFollowRequested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const [followError, setFollowError] = useState("");

  useEffect(() => {
    let active = true;

    void fetch(`${api}/api/pets/${encodeURIComponent(petId)}`, { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error(); const result = await response.json() as PetDetails; if (active) setPet(result); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [petId]);
  useEffect(() => {
    let active = true;

    void fetch(`${api}/api/community/pets/${encodeURIComponent(petId)}/social`, { credentials: "include" }).then((response) => response.ok ? response.json() as Promise<SocialSummary> : null).then((result) => { if (active && result) setSocial(result); }).catch(() => undefined);
    return () => { active = false; };
  }, [petId]);

  async function toggleFollow() {
    if (!social || followBusy) return;
    setFollowBusy(true); setFollowError("");
    try {
      const response = await fetch(`${api}/api/community/pets/${encodeURIComponent(petId)}/follow`, { method: "POST", credentials: "include" });
      const result = await response.json() as { followed: boolean; requested: boolean; count: number; message?: string };
      if (!response.ok) throw new Error(result.message ?? "Não foi possível atualizar o acompanhamento.");
      setSocial({ ...social, followedByMe: result.followed, followerCount: result.count }); setFollowRequested(result.requested);
    } catch (cause) { setFollowError(cause instanceof Error ? cause.message : "Não foi possível seguir este perfil. Tente novamente."); }
    finally { setFollowBusy(false); }
  }

  if (loading) return <div className="profile-loading"><span className="session-spinner"/> Carregando perfil...</div>;
  if (error || !pet) return <div className="profile-error"><PawPrint size={24}/><h1>Este perfil não está disponível.</h1><p>Ele pode ter sido removido ou estar privado.</p><Link href="/explorar">Voltar para Explorar <ArrowRight size={14}/></Link></div>;
  const age = pet.birthDate ? (() => { const date = new Date(pet.birthDate!); let years = new Date().getFullYear() - date.getFullYear(); if (new Date().getMonth() < date.getMonth() || (new Date().getMonth() === date.getMonth() && new Date().getDate() < date.getDate())) years--; return years < 1 ? "Menos de 1 ano" : `${years} ${years === 1 ? "ano" : "anos"}`; })() : "Idade não informada";
  const gallery = pet.photos?.length ? pet.photos : pet.coverPhotoUrl ? [{ id: "cover", altText: null, sortOrder: 0, url: pet.coverPhotoUrl }] : [];

  return <div className="public-pet-profile">
    <Link href="/explorar" className="back-link"><ArrowLeft size={15}/> Voltar para Explorar</Link>
    <div className="public-pet-grid">
      <div className="public-pet-gallery"><div className="public-pet-image" role="img" aria-label={`Foto de ${pet.name}`}>{gallery.length ? <img crossOrigin="use-credentials" src={gallery[Math.min(activePhoto, gallery.length - 1)].url} alt={gallery[Math.min(activePhoto, gallery.length - 1)].altText || `Foto ${activePhoto + 1} de ${pet.name}`} /> : <div className="pet-image-placeholder"><PawPrint size={35}/><span>Fotos em análise ou ainda não adicionadas</span></div>}<span className="public-intent-tag">{translations[pet.intent] ?? pet.intent}</span>{gallery.length > 0 && <span className="public-gallery-count">{Math.min(activePhoto + 1, gallery.length)} / {gallery.length}</span>}</div>{gallery.length > 1 && <div className="public-pet-thumbnails" aria-label="Galeria de fotos">{gallery.map((image, index) => <button type="button" key={image.id} className={index === activePhoto ? "public-pet-thumbnail-active" : ""} onClick={() => setActivePhoto(index)} aria-label={`Ver foto ${index + 1} de ${pet.name}`} aria-pressed={index === activePhoto}><img crossOrigin="use-credentials" src={image.url} alt="" /></button>)}</div>}</div>
      <section className="public-pet-copy">
        <div className="product-eyebrow"><span><PawPrint size={13}/></span> UM PERFIL DA COMUNIDADE</div>
        <div className="public-name-row"><h1>{pet.name}</h1></div>
        <p className="public-breed">{pet.breed || pet.speciesOther || translations[pet.species]}</p>
        {social && <div className="pet-social-strip"><span><Users size={14}/><strong>{social.followerCount}</strong> seguidores</span><span><strong>{social.postCount}</strong> publicações</span>{!social.isOwner && <button onClick={() => void toggleFollow()} disabled={followBusy}>{social.followedByMe ? "Seguindo" : followRequested ? "Solicitação enviada" : "Seguir"}</button>}</div>}
        {followError && <p className="settings-error" role="alert">{followError}</p>}
        <div className="public-info-grid"><div><PawPrint size={15}/><span>ESPÉCIE</span><strong>{pet.species === "OTHER" ? pet.speciesOther || "Outra espécie" : translations[pet.species] || "Outro"}</strong></div><div><CalendarDays size={15}/><span>IDADE</span><strong>{age}</strong></div><div><PawPrint size={15}/><span>SEXO</span><strong>{translations[pet.sex] || "Não informado"}</strong></div><div><PawPrint size={15}/><span>PORTE</span><strong>{translations[pet.size] || "Não informado"}</strong></div></div>
        <div className="public-region"><MapPin size={15}/><div><span>REGIÃO APROXIMADA</span><strong>{[pet.city, pet.state].filter(Boolean).join(", ") || "Não informada"}</strong></div></div>
        {pet.bio && <div className="public-bio"><span>UM POUCO SOBRE {pet.name.toLocaleUpperCase("pt-BR")}</span><p>{pet.bio}</p></div>}
        {pet.temperament?.length > 0 && <div className="explore-traits">{pet.temperament.map((trait) => <span key={trait}>{trait}</span>)}</div>}
        <div className="public-care-note"><ShieldCheck size={17}/><p>Informações do perfil são declaradas pelo tutor. Confirme saúde e rotina diretamente antes de combinar um encontro.</p></div>
        <Link className="public-contact-link" href="/explorar">Conhecer mais pets <ArrowRight size={15}/></Link>
      </section>
    </div>
  </div>;
}
