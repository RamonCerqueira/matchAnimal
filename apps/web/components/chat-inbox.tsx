"use client";

import { apiBaseUrl } from "@/lib/api-config";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";
import type { ChatMessageEvent } from "@matchanimal/shared";
import Link from "next/link";
import { ArrowLeft, Ban, Check, Flag, LoaderCircle, MessageCircle, Send } from "lucide-react";
import { petFeedback } from "@/lib/native-feedback";

type Thread = { id: string; updatedAt: string; unreadCount: number; match: { petA: { id: string; name: string; ownerId: string; coverPhotoUrl: string | null }; petB: { id: string; name: string; ownerId: string; coverPhotoUrl: string | null } }; messages: Message[] };
type Message = { id: string; threadId: string; senderId: string; body: string; createdAt: string; deliveredAt?: string | null; readAt?: string | null };
const api = apiBaseUrl;

export function ChatInbox() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [currentUser, setCurrentUser] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyThreads, setBusyThreads] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [typing, setTyping] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [notice, setNotice] = useState("");
  const draftsRef = useRef<Record<string, string>>({});
  const [hasOlder, setHasOlder] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const selectedRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<Record<string, { key: string; body: string }>>({});
  const preserveScrollRef = useRef<{ height: number; top: number } | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = threads.find((thread) => thread.id === selected) ?? null;
  const busy = !!selected && !!busyThreads[selected];
  const otherPet = useMemo(() => active ? (active.match.petA.ownerId === currentUser ? active.match.petB : active.match.petA) : null, [active, currentUser]);

  const selectConversation = useCallback((threadId: string | null) => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (selectedRef.current && socketRef.current?.connected) socketRef.current.emit("chat:typing", { requestId: crypto.randomUUID(), conversationId: selectedRef.current, isTyping: false });
    selectedRef.current = threadId;
    setSelected(threadId); setMessages([]); setHasOlder(false); setTyping(false); setError(""); setNotice("");
    setDraft(threadId ? draftsRef.current[threadId] ?? "" : "");
    setLoadingMessages(!!threadId); setLoadingOlder(false); preserveScrollRef.current = null;
  }, []);

  const loadThreads = useCallback(async () => {
    const response = await fetch(`${api}/api/chat/conversations`, { credentials: "include" });
    if (!response.ok) throw new Error("Não foi possível carregar as conversas.");
    const data = await response.json() as Thread[];
    setThreads(data);
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch(`${api}/api/auth/me`, { credentials: "include" }).then((response) => response.ok ? response.json() : null),
      fetch(`${api}/api/chat/conversations`, { credentials: "include" }).then((response) => { if (!response.ok) throw new Error("Não foi possível carregar as conversas."); return response.json() as Promise<Thread[]>; }),
    ]).then(([user, result]) => { if (alive) { setCurrentUser(user?.id ?? user?.user?.id ?? ""); setThreads(result); setLoading(false); const requested = new URLSearchParams(window.location.search).get("conversa"); selectConversation(result.find((thread) => thread.id === requested)?.id ?? result[0]?.id ?? null); } }).catch((reason: Error) => { if (alive) { setError(reason.message); setLoading(false); } });
    return () => { alive = false; };
  }, [selectConversation]);

  useEffect(() => {
    const socket = io(`${api}/realtime`, { withCredentials: true, transports: ["websocket"], reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1000, timeout: 10000, auth: {} });
    let refreshingSession = false;
    socketRef.current = socket;
    socket.on("connect_error", async () => {
      if (refreshingSession) return;
      refreshingSession = true;
      try {
        const refreshed = await fetch(`${api}/api/auth/refresh`, { method: "POST", credentials: "include" });
        if (refreshed.ok && !socket.connected) socket.connect();
      } catch { /* Socket.IO continues its configured reconnect attempts. */ } finally { refreshingSession = false; }
    });
    socket.on("connect", () => {
      const threadId = selectedRef.current;
      if (threadId) socket.emit("chat:join", { requestId: crypto.randomUUID(), conversationId: threadId }, (ack: { success: boolean }) => { if (ack?.success) socket.emit("chat:read", { requestId: crypto.randomUUID(), conversationId: threadId }); });
    });
    socket.on("chat:message", (event: ChatMessageEvent) => {
      const threadId = selectedRef.current;
      const message: Message = { id: event.messageId, threadId: event.conversationId, senderId: event.senderId, body: event.content, createdAt: event.createdAt };
      if (message.threadId === threadId) {
        setMessages((all) => all.some((item) => item.id === message.id) ? all : [...all, message]);
        if (message.senderId !== currentUser) socket.emit("chat:read", { requestId: crypto.randomUUID(), conversationId: message.threadId });
      }
      void loadThreads().catch(() => setError("Não foi possível atualizar as conversas."));
    });
    socket.on("match:created", () => { void loadThreads().catch(() => setError("Não foi possível atualizar as conversas.")); });
    socket.on("chat:delivery:update", (receipt: { conversationId: string; deliveredAt: string }) => { if (receipt.conversationId === selectedRef.current) setMessages((all) => all.map((message) => ({ ...message, deliveredAt: message.deliveredAt ?? receipt.deliveredAt }))); });
    socket.on("chat:read:update", (receipt: { conversationId: string; readAt: string }) => { if (receipt.conversationId === selectedRef.current) setMessages((all) => all.map((message) => ({ ...message, readAt: message.readAt ?? receipt.readAt }))); });
    socket.on("chat:typing:update", (event: { conversationId: string; isTyping: boolean }) => { if (event.conversationId === selectedRef.current) setTyping(event.isTyping); });
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [loadThreads, currentUser]);

  useEffect(() => {
    selectedRef.current = selected;
    if (selected && socketRef.current?.connected) socketRef.current.emit("chat:join", { requestId: crypto.randomUUID(), conversationId: selected }, (ack: { success: boolean }) => { if (ack?.success) socketRef.current?.emit("chat:read", { requestId: crypto.randomUUID(), conversationId: selected }); });
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`${api}/api/chat/conversations/${encodeURIComponent(selected)}/messages`, { credentials: "include" });
        if (!response.ok) throw new Error("Esta conversa não está disponível.");
        const data = await response.json() as Message[];
        if (alive) { setMessages((current) => [...data, ...current.filter((message) => !data.some((item) => item.id === message.id))].sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt))); setHasOlder(data.length === 30); }
        await fetch(`${api}/api/chat/conversations/${encodeURIComponent(selected)}/read`, { method: "POST", credentials: "include" });
        if (alive) setThreads((all) => all.map((thread) => thread.id === selected ? { ...thread, unreadCount: 0 } : thread));
      } catch (reason) { if (alive) setError((reason as Error).message); }
      finally { if (alive) setLoadingMessages(false); }
    };
    void load();
    return () => { alive = false; };
  }, [selected]);

  useEffect(() => {
    const list = listRef.current;
    const previous = preserveScrollRef.current;
    if (!list) return;
    if (previous) {
      preserveScrollRef.current = null;
      requestAnimationFrame(() => { list.scrollTop = previous.top + (list.scrollHeight - previous.height); });
    } else list.scrollTo({ top: list.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [messages, typing]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !draft.trim() || busy) return;
    setBusyThreads((current) => ({ ...current, [selected]: true })); setError("");
    const threadId = selected; const body = draft.trim(); setDraft(""); draftsRef.current[threadId] = "";
    const idempotencyKey = retryRef.current[threadId]?.body === body ? retryRef.current[threadId].key : window.crypto.randomUUID();
    try {
      const response = await fetch(`${api}/api/chat/conversations/${encodeURIComponent(selected)}/messages`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, idempotencyKey }) });
      const message = await response.json() as Message & { message?: string };
      if (!response.ok) throw new Error(message.message ?? "Não foi possível enviar a mensagem.");
      void petFeedback("success");
      if (selectedRef.current === threadId) setMessages((all) => all.some((item) => item.id === message.id) ? all : [...all, message]);
      delete retryRef.current[threadId];
      void loadThreads().catch(() => setError("Não foi possível atualizar as conversas."));
    } catch (reason) { draftsRef.current[threadId] = body; retryRef.current[threadId] = { key: idempotencyKey, body }; if (selectedRef.current === threadId) { setDraft(body); setError((reason as Error).message); } } finally { setBusyThreads((current) => ({ ...current, [threadId]: false })); }
  }

  async function loadOlder() {
    const oldest = messages[0];
    if (!selected || !oldest || loadingOlder) return;
    const threadId = selected;
    setLoadingOlder(true);
    try {
      const response = await fetch(`${api}/api/chat/conversations/${encodeURIComponent(selected)}/messages?before=${encodeURIComponent(oldest.createdAt)}&limit=30`, { credentials: "include" });
      if (!response.ok) throw new Error("Não foi possível carregar mensagens antigas.");
      const older = await response.json() as Message[];
      if (selectedRef.current !== threadId) return;
      if (listRef.current) preserveScrollRef.current = { height: listRef.current.scrollHeight, top: listRef.current.scrollTop };
      setMessages((all) => [...older.filter((message) => !all.some((existing) => existing.id === message.id)), ...all]);
      setHasOlder(older.length === 30);
    } catch (reason) { if (selectedRef.current === threadId) setError((reason as Error).message); } finally { if (selectedRef.current === threadId) setLoadingOlder(false); }
  }

  function setTypingState(value: boolean) {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (selected && socketRef.current?.connected) socketRef.current.emit("chat:typing", { requestId: crypto.randomUUID(), conversationId: selected, isTyping: value });
    if (value) typingTimerRef.current = setTimeout(() => { if (selectedRef.current && socketRef.current?.connected) socketRef.current.emit("chat:typing", { requestId: crypto.randomUUID(), conversationId: selectedRef.current, isTyping: false }); }, 1800);
  }
  async function blockUser() {
    if (!otherPet || !window.confirm(`Bloquear o tutor de ${otherPet.name}? A conversa será encerrada e a conexão removida.`)) return;
    setSafetyBusy(true); setError("");
    try {
      const response = await fetch(`${api}/api/safety/users/${encodeURIComponent(otherPet.ownerId)}/block`, { method: "POST", credentials: "include" });
      if (!response.ok) { const result = await response.json(); throw new Error(result.message ?? "Não foi possível bloquear este usuário."); }
      selectConversation(null); await loadThreads();
    } catch (reason) { setError((reason as Error).message); } finally { setSafetyBusy(false); }
  }
  async function reportUser() {
    if (!otherPet) return;
    const reason = window.prompt("Por que você quer denunciar este perfil?", "Comportamento inadequado");
    if (!reason?.trim()) return;
    setSafetyBusy(true); setError("");
    try {
      const response = await fetch(`${api}/api/safety/reports`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "USER", targetId: otherPet.ownerId, reason: reason.trim() }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.message ?? "Não foi possível registrar a denúncia."); }
      setNotice("Denúncia enviada para análise.");
    } catch (reason) { setError((reason as Error).message); } finally { setSafetyBusy(false); }
  }

  return <section className={`chat-inbox ${selected ? "chat-inbox-open" : ""}`} aria-label="Mensagens">
    <aside className="chat-thread-list">{error && !active && <div className="ma-flow-error-inline" role="alert"><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Tentar novamente</button></div>}<header><div><span className="chat-kicker">SUAS CONEXÕES</span><h2>Mensagens</h2></div><span className="chat-total">{threads.length}</span></header>
      {loading ? <div className="chat-state"><LoaderCircle className="chat-spin" size={20}/> Carregando conversas…</div> : threads.length ? <div className="chat-thread-items">{threads.map((thread) => {
        const pet = thread.match.petA.ownerId === currentUser ? thread.match.petB : thread.match.petA;
        const last = thread.messages[0];
        return <button aria-pressed={selected === thread.id} className={`chat-thread-item ${selected === thread.id ? "chat-thread-active" : ""}`} key={thread.id} onClick={() => { if (thread.id !== selected) selectConversation(thread.id); }}><span className="chat-avatar">{pet.coverPhotoUrl ? <img crossOrigin="use-credentials" src={pet.coverPhotoUrl} alt=""/> : <MessageCircle size={17}/>}</span><span className="chat-thread-copy"><strong>{pet.name}</strong><small>{last?.body ?? "Conversa iniciada pelo match"}</small></span>{thread.unreadCount > 0 && <i className="chat-unread">{thread.unreadCount}</i>}</button>;
      })}</div> : <div className="chat-state"><span className="chat-empty-icon"><MessageCircle size={21}/></span><strong>Nenhuma conversa ainda</strong><p>Quando houver interesse mútuo, você poderá começar uma conversa por aqui.</p></div>}
    </aside>
      <div className="chat-conversation">{active && otherPet ? <><header className="chat-conversation-header"><button className="chat-back" onClick={() => selectConversation(null)} aria-label="Voltar às conversas"><ArrowLeft size={18}/></button><span className="chat-avatar chat-avatar-small">{otherPet.coverPhotoUrl ? <img crossOrigin="use-credentials" src={otherPet.coverPhotoUrl} alt=""/> : <MessageCircle size={15}/>}</span><div><Link className="chat-pet-profile" href={`/pet/perfil?petId=${encodeURIComponent(otherPet.id)}`}><strong>{otherPet.name}</strong></Link><small><i/> Conexão ativa</small></div><span className="chat-secure-label"><Check size={13}/> Conversa privada</span><div className="chat-safety-actions"><button onClick={() => void reportUser()} disabled={safetyBusy} aria-label="Denunciar tutor" title="Denunciar"><Flag size={14}/></button><button onClick={() => void blockUser()} disabled={safetyBusy} aria-label="Bloquear tutor" title="Bloquear"><Ban size={14}/></button></div></header>
      <div className="chat-message-list" ref={listRef} aria-live="polite">{hasOlder && <button className="chat-load-older" onClick={() => void loadOlder()} disabled={loadingOlder}>{loadingOlder ? "Carregando…" : "Carregar mensagens anteriores"}</button>}{loadingMessages ? <div className="chat-state" role="status"><LoaderCircle className="chat-spin" size={22}/> Carregando mensagens…</div> : messages.length ? messages.map((message) => <article key={message.id} className={`chat-message ${message.senderId === currentUser ? "chat-message-own" : ""}`}><p>{message.body}</p><time>{new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt))}{message.senderId === currentUser && (message.readAt ? " · Lida" : message.deliveredAt ? " · Entregue" : " · Enviada")}</time></article>) : <div className="chat-first-message"><span><MessageCircle size={20}/></span><strong>Um novo encontro começa com um oi.</strong><p>Conversem sobre uma apresentação segura e respeitem o tempo de cada animal.</p></div>}{typing && <div className="chat-typing">Tutor está digitando…</div>}</div>
      {notice && <p className="ma-action-note" role="status">{notice}</p>}{error && <p className="chat-error" role="alert">{error}</p>}<form className="chat-compose" onSubmit={send}><input value={draft} maxLength={4000} placeholder={`Escreva para o tutor de ${otherPet.name}…`} onChange={(event) => { setDraft(event.target.value); if (selected) draftsRef.current[selected] = event.target.value; setTypingState(true); }} onBlur={() => setTypingState(false)} aria-label="Mensagem"/><button disabled={busy || loadingMessages || !draft.trim()} aria-label="Enviar mensagem">{busy ? <LoaderCircle className="chat-spin" size={17}/> : <Send size={17}/>}</button></form>
    </> : <div className="chat-select-prompt"><span><MessageCircle size={25}/></span><h3>Uma conversa pode começar aqui.</h3><p>Escolha uma conexão para ver as mensagens.</p></div>}</div>
  </section>;
}
