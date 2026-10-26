"use client";

import { apiBaseUrl } from "@/lib/api-config";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import { io, type Socket } from "socket.io-client";
import {
  AlertTriangle,
  Bell,
  Bookmark,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  Heart,
  ImagePlus,
  LoaderCircle,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  PawPrint,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Share2,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { PetFriends } from "@/components/pet-friends";
import { SponsoredPlacement } from "@/components/sponsored-placement";
import { petFeedback } from "@/lib/native-feedback";

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "agora";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} d`;
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(date);
}

function formatPostText(text: string) {
  const parts = text.split(/(#[a-zA-Z0-9_À-ÿ]+)/g);
  return parts.map((part, index) => {
    if (part.startsWith("#")) {
      return (
        <span key={index} className="post-hashtag">
          {part}
        </span>
      );
    }
    return part;
  });
}

const api = apiBaseUrl;
type FeedMedia = { id: string; storageKey: string; mediaType: string; mimeType: string; sizeBytes: number };
export type FeedPost = { id: string; body: string; kind: string; visibility: string; locationLabel: string | null; createdAt: string; authorId: string; author: { id: string; tutor: { displayName: string; profilePhotoUrl: string | null } | null }; pet: { id: string; name: string; species: string; breed: string | null; coverPhotoUrl: string | null; followedByMe: boolean; followerCount: number } | null; media: FeedMedia[]; _count: { likes: number; comments: number }; likedByMe: boolean; savedByMe: boolean };
type Story = { id: string; mediaKey: string; mediaType: string; caption: string | null; expiresAt: string; pet: { name: string; coverPhotoUrl: string | null } | null; author: { tutor: { displayName: string; profilePhotoUrl: string | null } | null }; viewedByMe: boolean };
type MyPet = { id: string; name: string };
type LocalMedia = { file: File; url: string };
type PetSuggestion = { id: string; name: string; species: string; breed: string | null; city: string | null; coverPhotoUrl: string | null; followerCount: number; tutorName: string };
type TrendingHashtag = { name: string; count: number };

const mediaUrl = (key: string) => `${api}/api/community/media/${key}`;
const acceptedMedia = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"];
function mediaError(files: File[]) {
  if (files.some((file) => !acceptedMedia.includes(file.type))) return "Use fotos JPG, PNG ou WebP e vídeos MP4 ou WebM.";
  if (files.some((file) => file.size > (file.type.startsWith("video/") ? 25 : 8) * 1024 * 1024)) return "Cada foto pode ter até 8 MB e cada vídeo até 25 MB.";
  return "";
}

async function requestFeed(mode: string, search: string, pageCursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ mode, limit: "18" });
  if (search) query.set("q", search);
  if (pageCursor) query.set("cursor", pageCursor);
  const response = await fetch(`${api}/api/community/feed?${query}`, { credentials: "include", signal });
  if (!response.ok) throw new Error("Não foi possível carregar a comunidade.");
  return response.json() as Promise<{ items: FeedPost[]; nextCursor: string | null }>;
}

export function CommunityFeed({ defaultMode }: { defaultMode?: string } = {}) {
  const parameters = useSearchParams();
  const initialSearch = parameters.get("q")?.trim() ?? "";
  const initialMode = parameters.get("mode")?.trim() || defaultMode || "for-you";
  return <CommunityFeedContent key={`${initialSearch}-${initialMode}`} initialSearch={initialSearch} initialMode={initialMode} compose={parameters.get("compose") === "1"} />;
}

function CommunityFeedContent({ initialSearch, initialMode, compose }: { initialSearch: string; initialMode: string; compose: boolean }) {
  const [posts, setPosts] = useState<FeedPost[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false); const [error, setError] = useState("");
  const [body, setBody] = useState(""); const [files, setFiles] = useState<LocalMedia[]>([]); const [posting, setPosting] = useState(false); const [stories, setStories] = useState<Story[]>([]); const [activeStory, setActiveStory] = useState<Story | null>(null); const [myPets, setMyPets] = useState<MyPet[]>([]); const [petId, setPetId] = useState(""); const [visibility, setVisibility] = useState("PUBLIC"); const [searchText, setSearchText] = useState(initialSearch); const [search, setSearch] = useState(initialSearch);
  const [suggestions, setSuggestions] = useState<PetSuggestion[]>([]);
  const [trending, setTrending] = useState<TrendingHashtag[]>([]);
  const [followBusyId, setFollowBusyId] = useState("");
  const filesRef = useRef<LocalMedia[]>([]);
  const requestRef = useRef(0);
  const [momentBusy, setMomentBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (compose) requestAnimationFrame(() => { composerRef.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); composerRef.current?.focus({ preventScroll: true }); });
  }, [compose]);
  const openStory = useCallback((story: Story) => { setActiveStory(story); void fetch(`${api}/api/community/stories/${story.id}/view`, { method: "POST", credentials: "include" }); }, []);
  const stepStory = useCallback((direction: -1 | 1) => { if (!activeStory) return; const nextIndex = stories.findIndex((item) => item.id === activeStory.id) + direction; if (nextIndex < 0 || nextIndex >= stories.length) { setActiveStory(null); return; } openStory(stories[nextIndex]); }, [activeStory, openStory, stories]);

  const load = useCallback(async (reset = true, pageCursor?: string | null) => {
    const requestId = ++requestRef.current;
    try {
      const result = await requestFeed(mode, search, reset ? undefined : pageCursor);
      if (requestId !== requestRef.current) return;
      setPosts((current) => reset ? result.items : [...current, ...result.items.filter((post) => !current.some((item) => item.id === post.id))]); setCursor(result.nextCursor);
    } catch (reason) { if (requestId === requestRef.current) setError(reason instanceof TypeError ? "Não conseguimos conectar à comunidade. Tente novamente em instantes." : (reason as Error).message); } finally { if (requestId === requestRef.current) { setLoading(false); setLoadingMore(false); } }
  }, [mode, search]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestRef.current;
    void requestFeed(mode, search, undefined, controller.signal).then((result) => {
      if (controller.signal.aborted || requestId !== requestRef.current) return;
      setPosts(result.items); setCursor(result.nextCursor);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted && requestId === requestRef.current) setError(cause instanceof TypeError ? "Não conseguimos conectar à comunidade. Tente novamente em instantes." : cause instanceof Error ? cause.message : "Não foi possível carregar a comunidade.");
    }).finally(() => { if (!controller.signal.aborted && requestId === requestRef.current) { setLoading(false); setLoadingMore(false); } });
    return () => controller.abort();
  }, [mode, search]);
  useEffect(() => { let alive = true; void fetch(`${api}/api/community/stories`, { credentials: "include" }).then((response) => response.ok ? response.json() as Promise<Story[]> : []).then((result) => { if (alive) setStories(result); }).catch(() => undefined); return () => { alive = false; }; }, []);
  useEffect(() => { let alive = true; void fetch(`${api}/api/pets/mine`, { credentials: "include" }).then((response) => response.ok ? response.json() as Promise<MyPet[]> : []).then((result) => { if (alive) setMyPets(result); }).catch(() => undefined); return () => { alive = false; }; }, []);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => () => filesRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);
  useEffect(() => {
    const socket: Socket = io(`${api}/realtime`, { withCredentials: true, transports: ["websocket"], reconnectionAttempts: 10 });
    const refresh = () => { void load(true); };
    socket.on("feed:post:created", refresh); socket.on("feed:post:updated", refresh); socket.on("feed:post:deleted", refresh);
    return () => { socket.disconnect(); };
  }, [load]);

  async function publish(event: FormEvent) {
    event.preventDefault(); if (!body.trim() && !files.length || posting) return;
    setPosting(true); setError("");
    try {
      let mediaKeys: string[] = [];
      if (files.length) {
        const form = new FormData(); files.forEach(({ file }) => form.append("files", file));
        const upload = await fetch(`${api}/api/community/media`, { method: "POST", credentials: "include", body: form });
        const uploaded = await upload.json() as { key?: string; message?: string }[] | { message?: string };
        if (!upload.ok || !Array.isArray(uploaded)) throw new Error((uploaded as { message?: string }).message ?? "Não foi possível enviar os arquivos.");
        mediaKeys = uploaded.map((file) => file.key!).filter(Boolean);
      }
      const response = await fetch(`${api}/api/community/posts`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, mediaKeys, petId: petId || undefined, visibility }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Não foi possível publicar.");
      setBody(""); files.forEach((item) => URL.revokeObjectURL(item.url)); setFiles([]); setNotice("Seu momento foi publicado na comunidade."); await load(true);
    } catch (reason) { setError((reason as Error).message); } finally { setPosting(false); }
  }

  async function toggleLike(postId: string) {
    const before = posts; setPosts((all) => all.map((post) => post.id === postId ? { ...post, likedByMe: !post.likedByMe, _count: { ...post._count, likes: post._count.likes + (post.likedByMe ? -1 : 1) } } : post));
    try { const response = await fetch(`${api}/api/community/posts/${postId}/like`, { method: "POST", credentials: "include" }); if (!response.ok) throw new Error(); const result = await response.json() as { liked: boolean; count: number }; setPosts((all) => all.map((post) => post.id === postId ? { ...post, likedByMe: result.liked, _count: { ...post._count, likes: result.count } } : post)); }
    catch { setPosts(before); setError("Não foi possível atualizar a curtida."); }
  }

  async function toggleSave(postId: string) {
    try { const response = await fetch(`${api}/api/community/posts/${postId}/save`, { method: "POST", credentials: "include" }); if (!response.ok) throw new Error(); const result = await response.json() as { saved: boolean }; setPosts((all) => all.map((post) => post.id === postId ? { ...post, savedByMe: result.saved } : post)); }
    catch { setError("Não foi possível salvar a publicação."); }
  }

  async function selectFiles(event: ChangeEvent<HTMLInputElement>) { const chosen = [...(event.target.files ?? [])]; event.target.value = ""; const invalid = mediaError(chosen); if (invalid) { setError(invalid); return; } if (chosen.length + files.length > 6) { setError("Escolha até seis arquivos por publicação."); return; } setError(""); const additions = chosen.map((file) => ({ file, url: URL.createObjectURL(file) })); setFiles((current) => [...current, ...additions]); }
  async function createMoment(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (!file || momentBusy) return; const invalid = mediaError([file]); if (invalid) { setError(invalid); return; } setMomentBusy(true); setError(""); try { const form = new FormData(); form.append("files", file); const uploaded = await fetch(`${api}/api/community/media`, { method: "POST", credentials: "include", body: form }); const media = await uploaded.json() as { key?: string }[]; if (!uploaded.ok || !media[0]?.key) throw new Error("Não foi possível enviar a mídia."); const created = await fetch(`${api}/api/community/stories`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ petId: petId || undefined, mediaKey: media[0].key, mediaType: file.type.startsWith("video/") ? "VIDEO" : "IMAGE", visibility: "FOLLOWERS" }) }); if (!created.ok) throw new Error("Não foi possível publicar o momento."); const refreshed = await fetch(`${api}/api/community/stories`, { credentials: "include" }); if (refreshed.ok) setStories(await refreshed.json()); setNotice("Momento publicado. Ele ficará disponível por 24 horas."); } catch (reason) { setError((reason as Error).message); } finally { setMomentBusy(false); } }
  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch(`${api}/api/community/suggestions`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${api}/api/community/trending-hashtags`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
    ]).then(([suggData, trendData]) => {
      if (alive) {
        setSuggestions(suggData || []);
        setTrending(trendData || []);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  async function followSuggested(targetPetId: string) {
    if (followBusyId) return;
    setFollowBusyId(targetPetId);
    try {
      void petFeedback("tap");
      const res = await fetch(`${api}/api/community/pets/${targetPetId}/follow`, { method: "POST", credentials: "include" });
      if (res.ok) {
        setSuggestions((current) => current.filter((item) => item.id !== targetPetId));
        setNotice("Você agora acompanha este pet! As novidades dele estarão na aba Seguindo.");
      }
    } catch {
      setError("Não foi possível seguir este pet.");
    } finally {
      setFollowBusyId("");
    }
  }

  async function report(postId: string) { const reason = window.prompt("Conte por que você está denunciando esta publicação."); if (!reason?.trim()) return; try { const response = await fetch(`${api}/api/safety/reports`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "POST", targetId: postId, reason: reason.trim() }) }); if (!response.ok) throw new Error(); setNotice("Denúncia enviada para análise."); } catch { setError("Não foi possível enviar a denúncia. Tente novamente."); } }

  return <div className="community-layout">
    <aside className="community-rail community-left"><div className="community-rail-card"><span className="community-rail-eyebrow">SEU ESPAÇO SOCIAL</span><Link className={`community-rail-link ${mode !== "saved" ? "community-rail-active" : ""}`} href="/comunidade"><Users size={16}/> Feed da comunidade</Link><Link className="community-rail-link" href="/comunidade/seguidores"><UserCheck size={16}/> Meus seguidores</Link><Link className={`community-rail-link ${mode === "saved" ? "community-rail-active" : ""}`} href="/comunidade/salvos"><Bookmark size={16}/> Salvos</Link><Link className="community-rail-link" href="/comunidade/explorar"><Compass size={16}/> Explorar</Link><Link className="community-rail-link" href="/grupos"><PawPrint size={16}/> Grupos</Link><Link className="community-rail-link" href="/eventos"><CalendarDays size={16}/> Eventos pet</Link></div><div className="community-care-note"><ShieldAlert size={17}/><strong>Comunidade segura</strong><p>Respeito e bem-estar dos animais vêm primeiro.</p><Link href="/seguranca">Conheça nossas diretrizes</Link></div></aside>
    <div className="community-main">
      <nav className="community-local-nav" aria-label="Espaços da comunidade"><Link href="/comunidade"><Users size={16}/> Feed</Link><Link href="/comunidade/seguidores"><UserCheck size={16}/> Seguidores</Link><Link href="/comunidade/salvos"><Bookmark size={16}/> Salvos</Link><Link href="/comunidade/explorar"><Compass size={16}/> Explorar</Link><Link href="/grupos"><PawPrint size={16}/> Grupos</Link><Link href="/eventos"><CalendarDays size={16}/> Eventos</Link></nav>
      <header className="community-heading"><div><span className="community-kicker">MATCHANIMAL SOCIAL</span><h1>Comunidade <em>pet.</em></h1><p>Momentos reais, histórias e novas amizades.</p></div><button className="community-compose-cta" onClick={() => composerRef.current?.focus()}><Plus size={16}/> Publicar</button></header>
      <form className="community-search" onSubmit={(event) => { event.preventDefault(); if (searchText.trim() !== search) { setLoading(true); setCursor(null); setError(""); setSearch(searchText.trim()); } }}><Search size={16}/><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Buscar pets, tutores, raças ou hashtags" aria-label="Buscar na comunidade"/><button type="submit">Buscar</button></form>
      <section className="community-stories" aria-label="Momentos"><div className="community-section-top"><strong>Momentos</strong><span>Stories somem em 24 horas</span></div><div className="community-story-list"><label className="community-story community-story-new" tabIndex={momentBusy ? -1 : 0} role="button" aria-label={momentBusy ? "Publicando momento" : "Adicionar momento"} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.querySelector("input")?.click(); } }}><span><Plus size={19}/></span><small>{momentBusy ? "Publicando…" : "Seu momento"}<input disabled={momentBusy} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(event) => void createMoment(event)} hidden/></small></label>{stories.map((story) => <button className={`community-story ${story.viewedByMe ? "community-story-seen" : ""}`} key={story.id} onClick={() => openStory(story)}><span style={story.pet?.coverPhotoUrl ? { backgroundImage: `url(${story.pet.coverPhotoUrl})` } : story.author.tutor?.profilePhotoUrl ? { backgroundImage: `url(${story.author.tutor.profilePhotoUrl})` } : undefined}><PawPrint size={18}/></span><small>{story.pet?.name ?? story.author.tutor?.displayName ?? "Pet"}</small></button>)}</div></section>
      <form className="community-composer" id="community-composer" onSubmit={publish}><div className="composer-avatar"><PawPrint size={18}/></div><div className="composer-content"><textarea ref={composerRef} value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder="O que seu pet aprontou hoje?" aria-label="Texto da publicação"/><div className="composer-preview">{files.map(({ file, url }, index) => <span key={`${file.name}-${index}`}>{file.type.startsWith("video/") ? <video src={url} muted/> : <img src={url} alt={`Prévia ${file.name}`}/>}<button type="button" onClick={() => { URL.revokeObjectURL(url); setFiles((all) => all.filter((_, i) => i !== index)); }} aria-label={`Remover ${file.name}`}><X size={12}/></button></span>)}</div><div className="composer-footer"><div className="composer-options"><label className="composer-tool" tabIndex={0} role="button" onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.querySelector("input")?.click(); } }}><ImagePlus size={15}/> Foto ou vídeo<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple onChange={(event) => void selectFiles(event)} hidden/></label><select aria-label="Publicar em nome do animal" value={petId} onChange={(event) => { setPetId(event.target.value); if (!event.target.value && visibility === "FOLLOWERS") setVisibility("PUBLIC"); }}><option value="">Meu perfil</option>{myPets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select><select aria-label="Privacidade da publicação" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PUBLIC">Pública</option><option value="FOLLOWERS" disabled={!petId}>Seguidores</option><option value="PRIVATE">Só eu</option></select></div><button type="submit" disabled={posting || (!body.trim() && !files.length)}>{posting ? <LoaderCircle className="community-spin" size={15}/> : <Send size={14}/>} Publicar</button></div></div></form>
      <SponsoredPlacement placement="COMMUNITY_FEED"/>
      <nav className="community-feed-tabs" aria-label="Ordenar publicações">{[{ id: "for-you", label: "Para você" }, { id: "following", label: "Seguindo" }, { id: "nearby", label: "Próximos" }, { id: "saved", label: "Salvos" }].map((tab) => <button key={tab.id} aria-pressed={mode === tab.id} className={mode === tab.id ? "community-tab-active" : ""} onClick={() => { if (mode !== tab.id) { setLoading(true); setCursor(null); setError(""); setMode(tab.id); } }}>{tab.label}</button>)}</nav>
      {notice && <p className="ma-action-note" role="status">{notice}</p>}
      {error && <div className="community-alert" role="status">{error}<button onClick={() => setError("")} aria-label="Fechar aviso"><X size={14}/></button></div>}
      {loading ? <div className="community-state"><LoaderCircle className="community-spin"/> Carregando publicações…</div> : posts.length ? <div className="community-post-list">{posts.map((post) => <PostCard key={post.id} post={post} onLike={() => { void petFeedback("tap"); void toggleLike(post.id); }} onSave={() => void toggleSave(post.id)} onReport={() => void report(post.id)} onChanged={() => void load(true)}/>)}</div> : <div className="community-empty pet-empty-state"><PetFriends mood="welcome"/><h2>{mode === "saved" ? "Você ainda não salvou nenhuma publicação." : "Seu feed começa com uma história."}</h2><p>{mode === "saved" ? "Clique no ícone de salvar em qualquer post para guardá-lo aqui." : "Publique o primeiro momento ou siga um perfil para acompanhar novidades."}</p></div>}
      {cursor && !loading && <button className="community-load-more" disabled={loadingMore} onClick={() => { setLoadingMore(true); setError(""); void load(false, cursor); }}>{loadingMore ? "Carregando…" : "Carregar mais publicações"}</button>}
    </div>
    <aside className="community-rail community-right">
      {suggestions.length > 0 && (
        <div className="community-rail-card">
          <span className="community-rail-eyebrow">QUEM SEGUIR NO MATCHANIMAL</span>
          <div className="community-suggestions-list">
            {suggestions.slice(0, 4).map((sugg) => (
              <div key={sugg.id} className="community-sugg-item">
                <Link href={`/pet/perfil?petId=${encodeURIComponent(sugg.id)}`} className="community-sugg-avatar" style={sugg.coverPhotoUrl ? { backgroundImage: `url(${sugg.coverPhotoUrl})` } : undefined}>
                  {!sugg.coverPhotoUrl && <PawPrint size={14} />}
                </Link>
                <div className="community-sugg-info">
                  <Link href={`/pet/perfil?petId=${encodeURIComponent(sugg.id)}`}>
                    <strong>{sugg.name}</strong>
                  </Link>
                  <small>{sugg.breed ?? (sugg.species === "DOG" ? "Cão" : "Gato")}{sugg.city ? ` · ${sugg.city}` : ""}</small>
                </div>
                <button
                  type="button"
                  className="community-sugg-follow-btn"
                  disabled={followBusyId === sugg.id}
                  onClick={() => void followSuggested(sugg.id)}
                  title={`Seguir ${sugg.name}`}
                >
                  <Plus size={11} /> Seguir
                </button>
              </div>
            ))}
          </div>
          <Link href="/comunidade/seguidores" className="community-sugg-see-all">
            Ver todas as conexões →
          </Link>
        </div>
      )}

      {trending.length > 0 && (
        <div className="community-rail-card">
          <span className="community-rail-eyebrow">TENDÊNCIAS EM ALTA</span>
          <div className="community-trending-tags">
            {trending.map((t) => (
              <button
                key={t.name}
                type="button"
                className="community-tag-pill"
                onClick={() => {
                  setSearchText(`#${t.name}`);
                  setSearch(`#${t.name}`);
                  setMode("for-you");
                }}
              >
                <span>#{t.name}</span>
                <small>{t.count}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="community-rail-card">
        <span className="community-rail-eyebrow">SEU MATCHANIMAL</span>
        <Link className="community-mini-link" href="/comunidade/seguidores">
          <UserCheck size={15} /> Gerenciar seguidores
        </Link>
        <Link className="community-mini-link" href="/notificacoes">
          <Bell size={15} /> Notificações da rede
        </Link>
        <Link className="community-mini-link" href="/explorar">
          <Heart size={15} /> Descubra matches
        </Link>
        <Link className="community-mini-link" href="/animais">
          <PawPrint size={15} /> Seus animais
        </Link>
      </div>

      <div className="community-footer-note">MatchAnimal · amor, amizade e cuidado</div>
    </aside>
    {activeStory && <StoryViewer key={activeStory.id} story={activeStory} onClose={() => setActiveStory(null)} onNext={()=>stepStory(1)} onPrevious={()=>stepStory(-1)} />}
  </div>;
}

const QUICK_EMOJIS = ["❤️", "🐾", "🐶", "🐱", "😍", "✨", "👏"];

export function PostCard({ post, onLike, onSave, onReport, onChanged }: { post: FeedPost; onLike: () => void; onSave: () => void; onReport: () => void; onChanged: () => void }) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<{ id: string; body: string; createdAt: string; author: { tutor: { displayName: string } | null } }[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [followed, setFollowed] = useState(post.pet?.followedByMe ?? false);
  const [followerCount, setFollowerCount] = useState(post.pet?.followerCount ?? 0);
  const [followBusy, setFollowBusy] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showHeartPop, setShowHeartPop] = useState(false);

  const lastTapRef = useRef<number>(0);
  const touchStartX = useRef<number | null>(null);

  const handleMediaDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      if (!post.likedByMe) {
        onLike();
      }
      setShowHeartPop(true);
      window.setTimeout(() => setShowHeartPop(false), 850);
    }
    lastTapRef.current = now;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0 && activeMediaIndex < post.media.length - 1) {
        setActiveMediaIndex((prev) => prev + 1);
      } else if (diff < 0 && activeMediaIndex > 0) {
        setActiveMediaIndex((prev) => prev - 1);
      }
    }
    touchStartX.current = null;
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMediaIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMediaIndex((prev) => Math.min(post.media.length - 1, prev + 1));
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/comunidade/publicacao?postId=${encodeURIComponent(post.id)}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setFeedback("Link copiado para a área de transferência!");
      } else {
        setFeedback("Link: " + url);
      }
    } catch {
      setFeedback("Não foi possível copiar o link.");
    } finally {
      setMenuOpen(false);
    }
  };

  async function toggleFollow() {
    if (!post.pet || followBusy) return;
    setFollowBusy(true);
    try {
      const response = await fetch(`${api}/api/community/pets/${post.pet.id}/follow`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error();
      const result = await response.json() as { followed: boolean; requested: boolean; count: number };
      setFollowed(result.followed);
      setRequested(result.requested);
      setFollowerCount(result.count);
      setFeedback(result.requested ? "Solicitação de acompanhamento enviada." : "");
    } catch {
      setFeedback("Não foi possível atualizar o acompanhamento. Tente novamente.");
    } finally {
      setFollowBusy(false);
    }
  }

  async function loadComments() {
    setCommentsLoading(true);
    try {
      const response = await fetch(`${api}/api/community/posts/${post.id}/comments`, { credentials: "include" });
      if (!response.ok) throw new Error();
      setComments(await response.json());
    } catch {
      setFeedback("Não foi possível carregar os comentários.");
    } finally {
      setCommentsLoading(false);
    }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`${api}/api/community/posts/${post.id}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      if (!response.ok) throw new Error();
      setDraft("");
      await loadComments();
      onChanged();
    } catch {
      setFeedback("Seu comentário não foi enviado. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function sharePost() {
    setMenuOpen(false);
    const url = `${window.location.origin}/comunidade/publicacao?postId=${encodeURIComponent(post.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: `Um momento de ${post.pet?.name ?? "MatchAnimal"}`, url });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setFeedback("Link copiado para a área de transferência!");
      } else {
        setFeedback("Use o endereço: " + url);
      }
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError")) {
        setFeedback("Não foi possível compartilhar agora.");
      }
    }
  }

  const isLongText = post.body && post.body.length > 220;
  const displayText = isLongText && !expanded ? post.body.slice(0, 200) + "…" : post.body;

  return (
    <article className="community-post-card">
      <header className="community-post-head">
        <div className="community-post-avatar-wrap">
          <span
            className="community-post-avatar"
            style={
              post.pet?.coverPhotoUrl
                ? { backgroundImage: `url(${post.pet.coverPhotoUrl})` }
                : post.author.tutor?.profilePhotoUrl
                ? { backgroundImage: `url(${post.author.tutor.profilePhotoUrl})` }
                : undefined
            }
          >
            {!post.pet?.coverPhotoUrl && !post.author.tutor?.profilePhotoUrl && <PawPrint size={18} />}
          </span>
        </div>

        <div className="community-post-byline">
          <div className="community-post-author-row">
            <strong>
              {post.pet ? (
                <Link href={`/pet/perfil?petId=${encodeURIComponent(post.pet.id)}`}>{post.pet.name}</Link>
              ) : (
                post.author.tutor?.displayName ?? "Tutor MatchAnimal"
              )}
            </strong>
            {post.pet && (
              <span className="community-pet-species-badge">
                <PawPrint size={11} />
                {post.pet.species === "DOG" ? "Cão" : post.pet.species === "CAT" ? "Gato" : "Pet"}
                {post.pet.breed ? ` · ${post.pet.breed}` : ""}
              </span>
            )}
          </div>

          <div className="community-post-meta">
            <span>{formatRelativeTime(post.createdAt)}</span>
            {post.locationLabel && (
              <>
                <span>·</span>
                <span className="community-post-location-tag">
                  <MapPin size={11} />
                  {post.locationLabel}
                </span>
              </>
            )}
          </div>
        </div>

        {post.pet && (
          <button
            className={`community-follow-btn ${followed ? "is-following" : ""}`}
            onClick={() => void toggleFollow()}
            disabled={followBusy}
            title={followed ? "Deixar de seguir" : "Seguir este pet"}
          >
            {followed ? <Check size={13} /> : requested ? null : <Plus size={13} />}
            {followed ? "Seguindo" : requested ? "Solicitado" : "Seguir"}
          </button>
        )}

        <div style={{ position: "relative" }}>
          <button
            className="community-post-more-btn"
            aria-label="Opções da publicação"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal size={18} />
          </button>

          {menuOpen && (
            <div className="community-post-menu-dropdown">
              <button onClick={() => void copyLink()}>
                <Copy size={15} /> Copiar link
              </button>
              <button onClick={() => void sharePost()}>
                <Share2 size={15} /> Compartilhar
              </button>
              <button
                className="menu-danger"
                onClick={() => {
                  setMenuOpen(false);
                  onReport();
                }}
              >
                <AlertTriangle size={15} /> Denunciar
              </button>
            </div>
          )}
        </div>
      </header>

      {post.body && (
        <div className="community-post-caption">
          {formatPostText(displayText)}
          {isLongText && (
            <button
              className="community-post-readmore"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "ver menos" : "mais"}
            </button>
          )}
        </div>
      )}

      {/* Carrossel de Mídias (Imagens / Vídeos) */}
      {!!post.media.length && (
        <div
          className="community-carousel-wrap"
          onClick={handleMediaDoubleTap}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {showHeartPop && (
            <span className="community-floating-heart" aria-hidden="true">
              <Heart size={84} fill="currentColor" />
            </span>
          )}

          {post.media.length > 1 && (
            <span className="community-carousel-counter">
              {activeMediaIndex + 1} / {post.media.length}
            </span>
          )}

          {post.media.length > 1 && activeMediaIndex > 0 && (
            <button
              type="button"
              className="community-carousel-arrow arrow-prev"
              onClick={handlePrev}
              aria-label="Foto anterior"
            >
              <ChevronLeft size={20} />
            </button>
          )}

          {post.media.length > 1 && activeMediaIndex < post.media.length - 1 && (
            <button
              type="button"
              className="community-carousel-arrow arrow-next"
              onClick={handleNext}
              aria-label="Próxima foto"
            >
              <ChevronRight size={20} />
            </button>
          )}

          <div
            className="community-carousel-track"
            style={{ transform: `translateX(-${activeMediaIndex * 100}%)` }}
          >
            {post.media.map((media) => (
              <div key={media.id} className="community-carousel-slide">
                {media.mediaType === "VIDEO" ? (
                  <video
                    src={mediaUrl(media.storageKey)}
                    crossOrigin="use-credentials"
                    controls
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={mediaUrl(media.storageKey)}
                    crossOrigin="use-credentials"
                    alt={`Momento de ${post.pet?.name ?? "um pet"}`}
                    loading="lazy"
                  />
                )}
              </div>
            ))}
          </div>

          {post.media.length > 1 && (
            <div className="community-carousel-dots" onClick={(e) => e.stopPropagation()}>
              {post.media.map((_, dotIdx) => (
                <button
                  key={dotIdx}
                  type="button"
                  className={`community-carousel-dot ${dotIdx === activeMediaIndex ? "is-active" : ""}`}
                  onClick={() => setActiveMediaIndex(dotIdx)}
                  aria-label={`Ir para a foto ${dotIdx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Barra de Ações (Engajamento) */}
      <div className="community-post-actions-bar">
        <div className="community-post-actions-left">
          <button
            className={`community-action-btn ${post.likedByMe ? "is-liked" : ""}`}
            onClick={onLike}
            aria-pressed={post.likedByMe}
            title={post.likedByMe ? "Descurtir" : "Curtir"}
          >
            <Heart size={18} fill={post.likedByMe ? "currentColor" : "none"} />
            <span>{post._count.likes > 0 ? post._count.likes : "Curtir"}</span>
          </button>

          <button
            className="community-action-btn"
            onClick={() => {
              setShowComments((v) => !v);
              if (!showComments) void loadComments();
            }}
            title="Comentários"
          >
            <MessageCircle size={18} />
            <span>{post._count.comments > 0 ? post._count.comments : "Comentar"}</span>
          </button>

          <button
            className="community-action-btn"
            onClick={() => void sharePost()}
            title="Compartilhar"
          >
            <Share2 size={18} />
            <span>Compartilhar</span>
          </button>
        </div>

        <button
          className={`community-action-btn ${post.savedByMe ? "is-saved" : ""}`}
          onClick={onSave}
          aria-pressed={post.savedByMe}
          title={post.savedByMe ? "Remover dos salvos" : "Salvar publicação"}
        >
          <Bookmark size={18} fill={post.savedByMe ? "currentColor" : "none"} />
        </button>
      </div>

      {feedback && (
        <div className="community-post-feedback-alert" role="status">
          <Sparkles size={14} />
          {feedback}
        </div>
      )}

      {/* Seção de Comentários Integrada */}
      {showComments && (
        <section className="community-comments-section">
          {/* Emojis rápidos */}
          <div className="community-quick-emojis">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="community-emoji-btn"
                onClick={() => setDraft((prev) => prev + emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>

          <form className="community-comment-form" onSubmit={addComment}>
            <input
              className="community-comment-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1200}
              placeholder="Escreva um comentário carinhoso…"
              aria-label="Comentário"
            />
            <button
              className="community-comment-submit-btn"
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Enviar comentário"
            >
              {busy ? <LoaderCircle className="community-spin" size={16} /> : <Send size={15} />}
            </button>
          </form>

          <div className="community-comment-items">
            {commentsLoading ? (
              <p style={{ fontSize: "13px", color: "var(--ma-muted)", margin: "4px 0" }}>
                Carregando comentários…
              </p>
            ) : !comments.length ? (
              <p style={{ fontSize: "13px", color: "var(--ma-muted)", margin: "4px 0" }}>
                Seja o primeiro a deixar um carinho para este pet! 🐾
              </p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="community-comment-bubble">
                  <div className="community-comment-avatar">
                    {(comment.author.tutor?.displayName ?? "Tutor").charAt(0).toUpperCase()}
                  </div>
                  <div className="community-comment-body-wrap">
                    <strong>{comment.author.tutor?.displayName ?? "Tutor"}</strong>
                    <span>{comment.body}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </article>
  );
}

function StoryViewer({ story, onClose, onNext, onPrevious }: { story: Story; onClose: () => void; onNext: () => void; onPrevious: () => void }) {
  const [paused,setPaused]=useState(false);const [progress,setProgress]=useState(0);const progressRef=useRef(0);
  const dialogRef = useDialogAccessibility<HTMLDivElement>(true, onClose);
  const [manualPaused, setManualPaused] = useState(false);

  useEffect(()=>{if(paused || manualPaused || story.mediaType === "VIDEO")return;const timer=window.setInterval(()=>{const amount=Math.min(100,progressRef.current+1.34);progressRef.current=amount;setProgress(amount);if(amount>=100){window.clearInterval(timer);onNext();}},80);return()=>window.clearInterval(timer);},[paused,manualPaused,story.id,story.mediaType,onNext]);
  return <div ref={dialogRef} className="community-story-backdrop" role="dialog" tabIndex={-1} aria-modal="true" aria-label="Momento pet" onKeyDown={(event) => { if (event.key === "ArrowRight") onNext(); if (event.key === "ArrowLeft") onPrevious(); }} onClick={onClose}><button className="community-story-close" onClick={onClose} aria-label="Fechar momento"><X size={20}/></button>{story.mediaType !== "VIDEO" && <button type="button" className="community-story-pause" aria-label={manualPaused ? "Continuar momento" : "Pausar momento"} onClick={(event) => { event.stopPropagation(); setManualPaused((value) => !value); }}>{manualPaused ? <Play size={20}/> : <Pause size={20}/>}</button>}<div className="community-story-view" onClick={(event) => event.stopPropagation()} onPointerDown={()=>setPaused(true)} onPointerUp={()=>setPaused(false)} onPointerLeave={()=>setPaused(false)}><div className="story-progress"><span style={{width:`${progress}%`}}/></div><button type="button" className="story-nav story-nav-prev" aria-label="Momento anterior" onClick={(event)=>{event.stopPropagation();onPrevious();}}/><button type="button" className="story-nav story-nav-next" aria-label="Próximo momento" onClick={(event)=>{event.stopPropagation();onNext();}}/>{story.mediaType === "VIDEO" ? <video src={mediaUrl(story.mediaKey)} crossOrigin="use-credentials" autoPlay controls onEnded={onNext}/> : <img src={mediaUrl(story.mediaKey)} crossOrigin="use-credentials" alt={story.caption ?? "Momento pet"}/>}<div className="community-story-caption"><strong>{story.pet?.name ?? story.author.tutor?.displayName}</strong>{story.caption && <p>{story.caption}</p>}</div></div></div>;
}
