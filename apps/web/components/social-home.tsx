"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronRight, Heart, MapPin, MessageCircle, PawPrint, Plus, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PetFriends } from "@/components/pet-friends";
import { useAppSession } from "@/components/app-shell";
import type { FeedPost } from "@/components/community-feed";
import { SponsoredPlacement } from "@/components/sponsored-placement";

type Pet = { id: string; name: string; species: string; breed?: string | null; coverPhotoUrl: string | null };
type Event = { id: string; title: string; startsAt: string; locationLabel: string };
type CompatibilityFactor = { label: string; explanation: string; points: number; maxPoints: number };
type Suggestion = { id: string; name: string; breed: string | null; species: string; city: string | null; state: string | null; coverPhotoUrl: string | null; approximateDistanceKm?: number | null; compatibility?: { score: number | null; factors: CompatibilityFactor[] } | null };
const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function SocialHome() {
  const session = useAppSession();
  const tutor = { firstName: session?.accountInfo.displayName.split(/\s+/)[0] ?? "", city: session?.accountInfo.city ?? "", state: session?.accountInfo.state ?? "" };
  const [pets, setPets] = useState<Pet[]>([]);
  const [activePetId, setActivePetId] = useState("");
  const [chats, setChats] = useState(0);
  const activity = { matches: session?.matchCount ?? 0, chats };
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eventsError, setEventsError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [recentPosts, setRecentPosts] = useState<FeedPost[]>([]);

  useEffect(() => {
    let mounted = true;

    const get = <T,>(path: string): Promise<T> => fetch(`${api}${path}`, { credentials: "include" }).then((response) => { if (!response.ok) throw new Error(); return response.json() as Promise<T>; });
    void Promise.allSettled([get<Pet[]>("/api/pets/mine"), get<unknown[]>("/api/chat/conversations"), get<Event[]>("/api/community/events"), get<{ items: FeedPost[] }>("/api/community/feed?limit=2")]).then(([ownedPets, conversations, calendar, feed]) => {
      if (!mounted) return;
      if (ownedPets.status === "rejected") { setError("Não foi possível carregar seus pets. Tente novamente para continuar."); return; }
      setError("");
      const petList = ownedPets.value;
      setPets(petList);
      setActivePetId(petList[0]?.id ?? "");
      if (conversations.status === "fulfilled") setChats(conversations.value.length);
      setEventsError(calendar.status === "rejected");
      if (calendar.status === "fulfilled") setEvents(calendar.value.slice(0, 2));
      if (feed.status === "fulfilled") setRecentPosts(feed.value.items ?? []);
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [attempt]);

  const activePet = pets.find((pet) => pet.id === activePetId) ?? pets[0] ?? null;
  const region = [tutor.city, tutor.state].filter(Boolean).join(", ");

  return <div className="social-home">
    <header className="home-greeting">
      <div><span className="home-greeting-kicker">{region ? <><MapPin size={13}/>{region}</> : <><PawPrint size={13}/>SEU UNIVERSO PET</>}</span><h1>{tutor.firstName ? `Oi, ${tutor.firstName}!` : "Oi!"} <em>Quem vai fazer novos amigos hoje?</em></h1><p>Boas conexões começam com um passeio, uma brincadeira ou um focinho curioso.</p></div>
    </header>

    {loading ? <div className="home-loading"><span className="session-spinner"/>Preparando as novidades para vocês…</div> : error ? <div className="ma-error-state" role="alert"><PawPrint size={30}/><h2>Seu cantinho está aqui.</h2><p>{error}</p><Button onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>Tentar novamente</Button></div> : !activePet ? <section className="home-onboarding"><div className="home-onboarding-art"><PetFriends mood="welcome"/></div><div className="home-onboarding-copy"><span>O PRIMEIRO PASSO É DELE</span><h2>Apresente seu pet<br/><em>à vizinhança.</em></h2><p>Crie um perfil com fotos e conte o que ele adora fazer. Vamos encontrar companhia para passeios e novas amizades.</p><div className="home-onboarding-actions"><Button asChild className="home-onboarding-primary"><Link href="/animais/novo"><Plus size={16}/> Criar perfil do meu pet</Link></Button><Link href="/comunidade">Conhecer a comunidade <ArrowRight size={15}/></Link></div></div><span className="home-onboarding-paw" aria-hidden="true"><PawPrint size={36}/></span></section> : <>
      {pets.length > 0 && <div className="home-pet-switcher"><span>Quem vem com você?</span>{pets.map((pet) => <button type="button" key={pet.id} className={pet.id === activePet.id ? "home-pet-active" : ""} onClick={() => setActivePetId(pet.id)} aria-pressed={pet.id === activePet.id}><i style={pet.coverPhotoUrl ? { backgroundImage: `url(${pet.coverPhotoUrl})` } : undefined}><PawPrint size={14}/></i>{pet.name}</button>)}<Link href="/animais/novo" aria-label="Adicionar outro pet"><Plus size={15}/></Link></div>}
      <section className="home-hero"><div className="home-hero-photo" style={activePet.coverPhotoUrl ? { backgroundImage: `linear-gradient(90deg,rgba(22,48,55,.88),rgba(22,48,55,.46) 53%,rgba(22,48,55,.05)),url(${activePet.coverPhotoUrl})` } : undefined}>{!activePet.coverPhotoUrl && <PetFriends mood="friends"/>}<span className="home-hero-badge"><Sparkles size={13}/> UM NOVO DIA, NOVAS DESCOBERTAS</span><div className="home-hero-copy"><span>O MUNDO FICA MELHOR JUNTOS</span><h2>{activePet.name} está pronto<br/>para <em>novas amizades.</em></h2><p>Descubra pets com energia e interesses parecidos, pertinho de você.</p><Link href={`/explorar?pet=${encodeURIComponent(activePet.id)}`}>Encontrar companhia <ArrowRight size={15}/></Link></div><Link href="/animais" className="home-hero-pet-link"><span className="home-hero-avatar" style={activePet.coverPhotoUrl ? { backgroundImage: `url(${activePet.coverPhotoUrl})` } : undefined}><PawPrint size={16}/></span><span><small>SEU PARCEIRINHO</small><strong>{activePet.name}</strong></span><ChevronRight size={15}/></Link></div></section>
      <SponsoredPlacement placement="HOME_BANNER"/>
      <nav className="home-social-shortcuts" aria-label="Atalhos"><Link href="/matches"><span className="home-shortcut-icon home-shortcut-coral"><Heart size={17}/></span><span><strong>{activity.matches ? `${activity.matches} ${activity.matches === 1 ? "conexão" : "conexões"}` : "Conexões"}</strong><small>Interesse mútuo</small></span><ChevronRight size={15}/></Link><Link href="/mensagens"><span className="home-shortcut-icon home-shortcut-lilac"><MessageCircle size={17}/></span><span><strong>{activity.chats ? `${activity.chats} ${activity.chats === 1 ? "conversa" : "conversas"}` : "Conversas"}</strong><small>Combine um encontro</small></span><ChevronRight size={15}/></Link><Link href="/eventos"><span className="home-shortcut-icon home-shortcut-blue"><CalendarDays size={17}/></span><span><strong>Encontros pet</strong><small>Rolês por perto</small></span><ChevronRight size={15}/></Link></nav>
      <section className="home-section"><div className="home-section-heading"><div><span>ESCOLHIDOS PARA {activePet.name.toLocaleUpperCase("pt-BR")}</span><h2>Novos focinhos por perto</h2><p>Descubra por que esses pets podem combinar.</p></div><Link href={`/explorar?pet=${encodeURIComponent(activePet.id)}`}>Ver todos <ArrowRight size={15}/></Link></div><Recommendations key={activePet.id} pet={activePet}/></section>
      {recentPosts.length > 0 && <section className="home-recent-posts"><div className="home-section-heading"><div><span>ACONTECE NA COMUNIDADE</span><h2>Pequenos momentos, boas histórias.</h2></div><Link href="/comunidade">Ver feed <ArrowRight size={15}/></Link></div><div className="home-post-grid">{recentPosts.map((post) => <Link key={post.id} href={`/comunidade/publicacao?postId=${encodeURIComponent(post.id)}`} className="home-post-preview">{post.media.find((media) => media.mediaType === "IMAGE") && <img src={`${api}/api/community/media/${post.media.find((media) => media.mediaType === "IMAGE")!.storageKey}`} alt={`Momento de ${post.pet?.name ?? post.author.tutor?.displayName ?? "um tutor"}`} loading="lazy" width={120} height={120}/>}<div><strong>{post.pet?.name ?? post.author.tutor?.displayName ?? "Na comunidade"}</strong><p>{post.body}</p><small><MessageCircle size={13}/>{post._count.comments} comentários</small></div><ArrowRight size={17}/></Link>)}</div></section>}
      <section className="home-community-row"><div className="home-community-copy"><span>UM LUGAR PARA TODO MUNDO</span><h2>Histórias, passeios<br/>e <em>patinhas amigas.</em></h2><p>Compartilhe um momento ou descubra o próximo encontro da comunidade.</p><div><Link href="/comunidade"><UsersRound size={15}/> Abrir comunidade</Link><Link href="/comunidade?compose=1"><Plus size={15}/> Compartilhar momento</Link></div></div><div className="home-event-preview"><div className="home-event-title"><CalendarDays size={16}/><span>PRÓXIMOS ENCONTROS</span><Link href="/eventos">Ver agenda <ArrowRight size={13}/></Link></div>{events.length ? events.map((event) => <Link className="home-event-card" href="/eventos" key={event.id}><span className="home-event-date"><b>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(new Date(event.startsAt))}</b><small>{new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(event.startsAt)).replace(".", "")}</small></span><span className="home-event-info"><strong>{event.title}</strong><small><MapPin size={12}/>{event.locationLabel}</small></span><ChevronRight size={15}/></Link>) : <div className="home-no-events"><p>{eventsError ? "Não conseguimos carregar a agenda agora." : "Ainda não há passeios marcados por perto."}</p><Link href="/eventos">Descobrir encontros pet <ArrowRight size={13}/></Link></div>}</div></section>
    </>}
    <footer className="home-care-note"><ShieldCheck size={17}/><p>Compatibilidade ajuda a descobrir. Um encontro bom também respeita o tempo e o bem-estar dos animais.</p><Link href="/seguranca">Nosso cuidado <ArrowRight size={13}/></Link></footer>
  </div>;
}

function Recommendations({ pet }: { pet: Pet }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let mounted = true;

    void fetch(`${api}/api/pets/explore?viewerPetId=${encodeURIComponent(pet.id)}&limit=3&radiusKm=50`, { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error(); return await response.json() as Suggestion[]; }).then((items) => { if (mounted) { setSuggestions(items); setError(false); } }).catch(() => { if (mounted) setError(true); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [pet.id, attempt]);
  if (loading) return <div className="home-recommendation-loading"><span className="session-spinner"/>Encontrando companhia para {pet.name}…</div>;
  if (error) return <div className="ma-error-state" role="alert"><p>Não foi possível carregar as sugestões.</p><Button variant="outline" onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>Tentar novamente</Button></div>;
  if (!suggestions.length) return <div className="home-recommendation-empty"><PetFriends mood="friends"/><div><strong>Tem espaço para um novo amigo por aqui.</strong><p>Quando aparecerem perfis compatíveis na sua região, eles vão estar neste cantinho.</p><Link href={`/explorar?pet=${encodeURIComponent(pet.id)}`}>Explorar com mais filtros <ArrowRight size={14}/></Link></div></div>;
  return <div className="home-recommendation-grid">{suggestions.map((candidate) => {
    const bestFactor = candidate.compatibility?.factors.filter((factor) => factor.maxPoints > 0).reduce((best, factor) => !best || factor.points / factor.maxPoints > best.points / best.maxPoints ? factor : best, undefined as CompatibilityFactor | undefined);
    const where = candidate.approximateDistanceKm ? `~${candidate.approximateDistanceKm} km` : [candidate.city, candidate.state].filter(Boolean).join(", ") || "Perto de você";
    return <Link href={`/pet/perfil?petId=${encodeURIComponent(candidate.id)}`} className="home-recommendation-card" key={candidate.id}><div className="home-recommendation-photo" style={candidate.coverPhotoUrl ? { backgroundImage: `url(${candidate.coverPhotoUrl})` } : undefined}>{!candidate.coverPhotoUrl && <PawPrint size={24}/>} {candidate.compatibility?.score != null && <span className="home-affinity"><Sparkles size={12}/>{candidate.compatibility.score}% afinidade</span>}<span className="home-photo-heart" aria-hidden="true"><ArrowRight size={16}/></span></div><div className="home-recommendation-copy"><div><strong>{candidate.name}</strong><span>{where}</span></div><small>{candidate.breed ?? candidate.species}</small>{bestFactor && <p><Sparkles size={12}/>{bestFactor.explanation}</p>}</div></Link>;
  })}</div>;
}
