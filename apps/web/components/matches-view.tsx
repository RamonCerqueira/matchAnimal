"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Heart, LoaderCircle, MessageCircle, PawPrint, Undo2 } from "lucide-react";
import { PetFriends } from "@/components/pet-friends";
import { petFeedback } from "@/lib/native-feedback";

type Pet = { id: string; name: string; species: string; breed: string | null; coverPhotoUrl: string | null; isMine: boolean };
type Match = { id: string; createdAt: string; thread: { id: string } | null; petA: Pet; petB: Pet };
const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function MatchesView() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`${api}/api/pets/matches`, { credentials: "include" }).then((response) => { if (!response.ok) throw new Error("Não foi possível carregar seus matches."); return response.json() as Promise<Match[]>; }),
    ]).then(([data]) => { if (active) { setMatches(data); setLoading(false); } }).catch((reason: Error) => { if (active) { setError(reason.message); setLoading(false); } });
    return () => { active = false; };
  }, []);
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
  if (!matches.length) return <div className="matches-empty pet-empty-state"><PetFriends mood="love"/><span className="pet-empty-badge"><Heart size={17}/></span><h2>Tem um focinho esperando para conhecer o seu.</h2><p>Quando dois tutores demonstram interesse, a conexão aparece aqui e uma conversa fica disponível.</p><Link href="/explorar">Explorar animais <ArrowRight size={15}/></Link></div>;
  return <section className="matches-view"><div className="matches-heading"><div><span className="chat-kicker">CONEXÕES RECÍPROCAS</span><h1>Deu Match!</h1><p>Uma nova amizade está começando.</p></div><Link href="/explorar">Continuar explorando <ArrowRight size={14}/></Link></div>{error && <p className="chat-error" role="alert">{error}</p>}<div className="matches-grid">{matches.map((match) => { const mine = match.petA.isMine ? match.petA : match.petB; const other = match.petA.isMine ? match.petB : match.petA; return <article className="match-card" key={match.id}><div className="match-pet-pair"><div className="match-pet-image" style={mine.coverPhotoUrl ? { backgroundImage: `url(${mine.coverPhotoUrl})` } : undefined}><PawPrint size={20}/><span>{mine.name}</span></div><span className="match-heart"><Heart size={16} fill="currentColor"/></span><div className="match-pet-image" style={other.coverPhotoUrl ? { backgroundImage: `url(${other.coverPhotoUrl})` } : undefined}><PawPrint size={20}/><span>{other.name}</span></div></div><div className="match-card-copy"><strong>{mine.name} e {other.name}</strong><small>Conexão desde {new Intl.DateTimeFormat("pt-BR", { day:"2-digit", month:"short" }).format(new Date(match.createdAt))}</small><Link className="match-card-profile" href={`/pet/perfil?petId=${encodeURIComponent(other.id)}`}>Ver perfil de {other.name}<ArrowRight size={14}/></Link></div><div className="match-card-actions">{match.thread ? <Link href={`/mensagens?conversa=${encodeURIComponent(match.thread.id)}`}><MessageCircle size={14}/> Enviar mensagem</Link> : <span className="match-chat-unavailable">Conversa indisponível</span>}<button onClick={() => void undo(match.id)} disabled={busy === match.id}><Undo2 size={14}/> Desfazer</button></div></article>; })}</div></section>;
}
