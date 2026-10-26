"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Heart, LoaderCircle, MessageCircle, PawPrint, Undo2 } from "lucide-react";
import { PetFriends } from "@/components/pet-friends";
import { petFeedback } from "@/lib/native-feedback";

type Pet = { id: string; name: string; species: string; breed: string | null; coverPhotoUrl: string | null; isMine: boolean };
type Match = { id: string; createdAt: string; thread: { id: string } | null; petA: Pet; petB: Pet };
type Interest = { id: string; createdAt: string; isSuperMatch: boolean; fromPet: { id: string; name: string; species: string; breed: string | null; sex: string; size: string; birthDate: string | null; bio: string | null; intent: string; temperament: string[]; preferences: string[]; city: string | null; state: string | null; coverPhotoUrl: string | null }; toPet: { id: string; name: string; isPublic: boolean } };
const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function MatchesView() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [tab, setTab] = useState<"matches" | "interests">("matches");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let active = true;
    if (new URLSearchParams(window.location.search).get("tab") === "interesses") setTab("interests");
    Promise.all([
      fetch(`${api}/api/pets/matches`, { credentials: "include" }).then((response) => { if (!response.ok) throw new Error("Não foi possível carregar suas conexões."); return response.json() as Promise<Match[]>; }),
      fetch(`${api}/api/pets/interests/received`, { credentials: "include" }).then((response) => { if (!response.ok) throw new Error("Não foi possível carregar os interesses recebidos."); return response.json() as Promise<Interest[]>; }),
    ]).then(([matchesData, interestsData]) => { if (active) { setMatches(matchesData); setInterests(interestsData); setLoading(false); } }).catch((reason: Error) => { if (active) { setError(reason.message); setLoading(false); } });
    return () => { active = false; };
  }, []);
  async function refreshMatches() {
    const response = await fetch(`${api}/api/pets/matches`, { credentials: "include" });
    if (response.ok) setMatches(await response.json() as Match[]);
  }
  async function respond(interest: Interest, action: "like" | "pass") {
    if (busy) return;
    setBusy(interest.id); setError(""); setNotice("");
    try {
      const url = action === "like"
        ? `${api}/api/pets/${encodeURIComponent(interest.fromPet.id)}/interest`
        : `${api}/api/pets/${encodeURIComponent(interest.fromPet.id)}/pass`;
      const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromPetId: interest.toPet.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(" ") : result.message ?? "Não foi possível atualizar o interesse.");
      setInterests((all) => all.filter((item) => item.id !== interest.id));
      if (action === "pass") setNotice(`Interesse de ${interest.fromPet.name} removido.`);
      else if (result.matched) { setNotice(`Deu Match entre ${interest.toPet.name} e ${interest.fromPet.name}!`); await refreshMatches(); void petFeedback("match"); }
      else if (result.reviewRequired) setNotice("Interesse recíproco encaminhado para revisão humana e verificações de saúde e bem-estar.");
      else setNotice(`Interesse enviado para ${interest.fromPet.name}.`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(""); }
  }
  async function undo(id: string) {
    if (busy || !window.confirm("Desfazer esta conexão? A conversa entre os tutores será encerrada.")) return;
    void petFeedback("tap");
    setBusy(id); setError("");
    try {
      const response = await fetch(`${api}/api/pets/matches/${encodeURIComponent(id)}/unmatch`, { method: "POST", credentials: "include" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.message ?? "Não foi possível desfazer o match."); }
      setMatches((all) => all.filter((match) => match.id !== id));
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(""); }
  }
  if (loading) return <div className="matches-state"><LoaderCircle className="chat-spin" size={20}/> Carregando conexões…</div>;
  if (error && !matches.length) return <div className="ma-flow-error" role="alert"><Heart size={28}/><h1>Não foi possível carregar suas conexões</h1><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Tentar novamente</button></div>;
  return <section className="matches-view"><div className="matches-heading"><div><span className="chat-kicker">CONEXÕES DO SEU PET</span><h1>{tab === "interests" ? "Interesses recebidos" : "Deu Match!"}</h1><p>{tab === "interests" ? "Conheça quem demonstrou interesse e escolha se quer retribuir." : "Uma nova amizade está começando."}</p></div><Link href="/explorar">Continuar explorando <ArrowRight size={14}/></Link></div><div className="connection-tabs" role="group" aria-label="Conexões"><button aria-pressed={tab === "matches"} className={tab === "matches" ? "is-active" : ""} onClick={() => setTab("matches")}>Matches <span>{matches.length}</span></button><button aria-pressed={tab === "interests"} className={tab === "interests" ? "is-active" : ""} onClick={() => setTab("interests")}>Interesses recebidos <span>{interests.length}</span></button></div>{error && <p className="chat-error" role="alert">{error}</p>}{notice && <p className="connection-notice" role="status">{notice}</p>}{tab === "interests" ? interests.length ? <div className="received-interests">{interests.map((interest) => <article className="received-interest-card" key={interest.id}><div className="received-interest-photo" style={interest.fromPet.coverPhotoUrl ? { backgroundImage: `url(${interest.fromPet.coverPhotoUrl})` } : undefined}><PawPrint size={24}/></div><div className="received-interest-copy"><span className={interest.isSuperMatch ? "interest-badge interest-badge-super" : "interest-badge"}>{interest.isSuperMatch ? "Super Match" : "Novo interesse"}</span><h2>{interest.fromPet.name}</h2><p>{[interest.fromPet.breed, [interest.fromPet.city, interest.fromPet.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Região aproximada não informada"}</p><p>{interest.fromPet.bio || "Quer conhecer seu pet e combinar um encontro com carinho."}</p><div className="explore-traits">{[...new Set([...(interest.fromPet.temperament ?? []), ...(interest.fromPet.preferences ?? [])])].slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div><Link className="full-profile-link" href={`/pet/perfil?petId=${encodeURIComponent(interest.fromPet.id)}`}>Ver perfil completo <ArrowRight size={14}/></Link></div><div className="received-interest-actions">{interest.toPet.isPublic ? <button type="button" disabled={!!busy} onClick={() => void respond(interest, "like")}><Heart size={16}/> Retribuir interesse</button> : <Link href="/animais">Publique {interest.toPet.name} para responder</Link>}<button type="button" className="interest-pass" disabled={!!busy} onClick={() => void respond(interest, "pass")}>Passar</button></div></article>)}</div> : <div className="matches-empty pet-empty-state"><PetFriends mood="love"/><span className="pet-empty-badge"><Heart size={17}/></span><h2>Nenhum interesse novo por enquanto.</h2><p>Quando alguém demonstrar interesse em um dos seus pets, o perfil aparece aqui para você conhecer.</p><Link href="/explorar">Explorar animais <ArrowRight size={15}/></Link></div> : matches.length ? <div className="matches-grid">{matches.map((match) => { const mine = match.petA.isMine ? match.petA : match.petB; const other = match.petA.isMine ? match.petB : match.petA; return <article className="match-card" key={match.id}><div className="match-pet-pair"><div className="match-pet-image" style={mine.coverPhotoUrl ? { backgroundImage: `url(${mine.coverPhotoUrl})` } : undefined}><PawPrint size={20}/><span>{mine.name}</span></div><span className="match-heart"><Heart size={16} fill="currentColor"/></span><div className="match-pet-image" style={other.coverPhotoUrl ? { backgroundImage: `url(${other.coverPhotoUrl})` } : undefined}><PawPrint size={20}/><span>{other.name}</span></div></div><div className="match-card-copy"><strong>{mine.name} e {other.name}</strong><small>Conexão desde {new Intl.DateTimeFormat("pt-BR", { day:"2-digit", month:"short" }).format(new Date(match.createdAt))}</small><Link className="match-card-profile" href={`/pet/perfil?petId=${encodeURIComponent(other.id)}`}>Ver perfil de {other.name}<ArrowRight size={14}/></Link></div><div className="match-card-actions">{match.thread ? <Link href={`/mensagens?conversa=${encodeURIComponent(match.thread.id)}`}><MessageCircle size={14}/> Enviar mensagem</Link> : <span className="match-chat-unavailable">Conversa indisponível</span>}<button onClick={() => void undo(match.id)} disabled={busy === match.id}><Undo2 size={14}/> Desfazer</button></div></article>; })}</div> : <div className="matches-empty pet-empty-state"><PetFriends mood="love"/><span className="pet-empty-badge"><Heart size={17}/></span><h2>Tem um focinho esperando para conhecer o seu.</h2><p>Quando dois tutores demonstram interesse, a conexão aparece aqui e uma conversa fica disponível.</p><Link href="/explorar">Explorar animais <ArrowRight size={15}/></Link></div>}</section>;
}
