"use client";

import { apiBaseUrl } from "@/lib/api-config";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, Heart, LoaderCircle, MessageCircle, PawPrint, Sparkles } from "lucide-react";

type Notification = { id: string; type: "LIKE" | "PET_LIKE" | "SUPER_MATCH" | "MATCH" | "MESSAGE" | "CONNECTION_UPDATE" | "FOLLOW"; entityId: string | null; readAt: string | null; createdAt: string; actor: { tutor: { displayName: string } | null } | null };
const api = apiBaseUrl;
const info = {
  FOLLOW: { title: "Novo seguidor pet", icon: PawPrint },
  LIKE: { title: "Curtida na sua publicação", icon: Heart },
  PET_LIKE: { title: "Alguém se interessou pelo seu pet", icon: Heart },
  SUPER_MATCH: { title: "Você recebeu um Super Match", icon: Sparkles },
  MATCH: { title: "Deu Match!", icon: Heart },
  MESSAGE: { title: "Nova mensagem", icon: MessageCircle },
  CONNECTION_UPDATE: { title: "Novo comentário ou interação", icon: MessageCircle },
};

function getNotificationHref(item: Notification): string {
  if (item.type === "FOLLOW") return "/comunidade/seguidores";
  if (item.type === "MESSAGE") return "/mensagens";
  if (item.type === "MATCH") return "/matches";
  if (item.type === "PET_LIKE" || item.type === "SUPER_MATCH") return "/matches?tab=interesses";
  if (item.type === "LIKE" || item.type === "CONNECTION_UPDATE") {
    if (item.entityId) return `/comunidade/publicacao/${encodeURIComponent(item.entityId)}`;
    return "/comunidade";
  }
  return "/explorar";
}

export function NotificationsCenter() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => { let alive = true; fetch(`${api}/api/notifications`, { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error("Não foi possível carregar suas notificações."); return response.json() as Promise<Notification[]>; }).then((data) => { if (alive) { setItems(data); setLoading(false); } }).catch((reason: Error) => { if (alive) { setError(reason.message); setLoading(false); } }); return () => { alive = false; }; }, []);
  async function mark(id?: string) {
    if (busy) return;
    setBusy(id ?? "all"); setError("");
    try {
      const response = await fetch(`${api}/api/notifications/${id ? `${encodeURIComponent(id)}/read` : "read-all"}`, { method: "PATCH", credentials: "include" });
      if (!response.ok) throw new Error("Não foi possível marcar como lida. Tente novamente.");
      setItems((all) => all.map((item) => !id || item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a notificação."); }
    finally { setBusy(""); }
  }
  const unread = items.filter((item) => !item.readAt).length;
  return <section className="notifications-center"><header className="notifications-heading"><div><span className="chat-kicker">ATUALIZAÇÕES DA SUA REDE</span><h1>Notificações</h1><p>{unread ? `${unread} não lida${unread > 1 ? "s" : ""}` : "Tudo em dia por aqui."}</p></div>{unread > 0 && <button disabled={!!busy} onClick={() => void mark()}><Check size={14}/> Marcar todas como lidas</button>}</header>{error && <div className="ma-flow-error-inline" role="alert"><p>{error}</p>{!items.length && <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>}</div>}{loading ? <div className="matches-state"><LoaderCircle className="chat-spin" size={20}/> Carregando…</div> : items.length ? <div className="notification-list">{items.map((item) => { const detail = info[item.type] ?? info.CONNECTION_UPDATE; const Icon = detail.icon; return <article className={`notification-row ${item.readAt ? "notification-read" : ""}`} key={item.id}><span className="notification-icon"><Icon size={16}/></span><div className="notification-copy"><Link className="notification-destination" href={getNotificationHref(item)}><strong>{detail.title}</strong></Link><p>{item.actor?.tutor?.displayName ? `${item.actor.tutor.displayName} interagiu com você.` : "Uma nova atividade está disponível na sua conta."}</p><time>{new Intl.DateTimeFormat("pt-BR", { dateStyle:"medium", timeStyle:"short" }).format(new Date(item.createdAt))}</time></div>{!item.readAt && <button disabled={!!busy} aria-label="Marcar como lida" onClick={() => void mark(item.id)}><Check size={15}/></button>}</article>; })}</div> : !error && <div className="matches-empty"><span><Bell size={22}/></span><h2>Suas novidades aparecem aqui.</h2><p>Você será avisado quando receber um interesse, match, curtida ou novo seguidor.</p><Link href="/explorar">Conhecer animais</Link></div>}</section>;
}
