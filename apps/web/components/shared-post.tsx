"use client";

import { apiBaseUrl } from "@/lib/api-config";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, PawPrint } from "lucide-react";
import { PostCard, type FeedPost } from "@/components/community-feed";

const api = apiBaseUrl;
type PostAction = "like" | "save" | "report";
type ActionResult = { message?: string | string[]; liked?: boolean; count?: number; saved?: boolean };

async function requestPost(postId: string, signal?: AbortSignal) {
  const response = await fetch(`${api}/api/community/posts/${encodeURIComponent(postId)}`, { credentials: "include", signal });
  if (!response.ok) throw new Error("Esta publicação não está disponível para sua conta.");
  return response.json() as Promise<FeedPost>;
}

export function SharedPost({ postId }: { postId: string }) {
  return <SharedPostContent key={postId} postId={postId} />;
}

function SharedPostContent({ postId }: { postId: string }) {
  const [post, setPost] = useState<FeedPost | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await requestPost(postId, signal);
      if (signal?.aborted) return;
      setPost(result); setError("");
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof TypeError ? "Não conseguimos conectar à comunidade. Tente novamente em instantes." : cause instanceof Error ? cause.message : "Não foi possível carregar a publicação.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [postId]);

  useEffect(() => {
    const controller = new AbortController();
    void requestPost(postId, controller.signal).then((result) => { if (!controller.signal.aborted) setPost(result); }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof TypeError ? "Não conseguimos conectar à comunidade. Tente novamente em instantes." : cause instanceof Error ? cause.message : "Não foi possível carregar a publicação.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [postId]);

  async function request(action: PostAction, reason?: string) {
    if (!post || pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const path = action === "report" ? "/api/safety/reports" : `/api/community/posts/${encodeURIComponent(postId)}/${action}`;
      const response = await fetch(`${api}${path}`, { method: "POST", credentials: "include", ...(action === "report" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "POST", targetId: postId, reason }) } : {}) });
      const result = await response.json().catch(() => ({})) as ActionResult;
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(" ") : result.message ?? "Não foi possível concluir esta ação. Tente novamente.");
      if (action === "like" && typeof result.liked === "boolean" && typeof result.count === "number") {
        const liked = result.liked; const count = result.count;
        setPost((current) => current ? { ...current, likedByMe: liked, _count: { ...current._count, likes: count } } : current);
        setNotice(liked ? "Curtida adicionada." : "Curtida removida.");
      } else if (action === "save" && typeof result.saved === "boolean") {
        const saved = result.saved;
        setPost((current) => current ? { ...current, savedByMe: saved } : current);
        setNotice(saved ? "Publicação salva." : "Publicação removida dos salvos.");
      } else if (action === "report") setNotice("Denúncia enviada para análise.");
      else await load();
    } catch (cause) { setError(cause instanceof TypeError ? "Não conseguimos conectar ao serviço. Tente novamente em instantes." : cause instanceof Error ? cause.message : "Não foi possível concluir esta ação."); }
    finally { pending.current = false; setBusy(false); }
  }

  function report() {
    if (busy) return;
    const reason = window.prompt("Conte por que você está denunciando esta publicação.");
    if (reason?.trim()) void request("report", reason.trim());
  }

  if (loading && !post) return <div className="community-state" role="status"><LoaderCircle className="community-spin" aria-hidden="true" /> Carregando publicação…</div>;
  if (!post) return <div className="community-empty"><span><PawPrint size={26} aria-hidden="true" /></span><h2>Publicação indisponível</h2><p role="alert">{error}</p><button type="button" onClick={() => { setLoading(true); setError(""); void load(); }}>Tentar novamente</button><Link className="community-back-link" href="/comunidade">Voltar à comunidade</Link></div>;
  return <div className="shared-post-page"><Link href="/comunidade" className="community-back-link"><ArrowLeft size={18} aria-hidden="true" /> Voltar à comunidade</Link>{error && <p className="community-alert" role="alert">{error}</p>}{notice && <p className="ma-action-note" role="status">{notice}</p>}{busy && <p className="community-state" role="status"><LoaderCircle className="community-spin" size={18} aria-hidden="true" /> Atualizando publicação…</p>}<fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0" aria-label="Publicação compartilhada" aria-busy={busy}><PostCard post={post} onLike={() => void request("like")} onSave={() => void request("save")} onReport={report} onChanged={() => void load()} /></fieldset></div>;
}
