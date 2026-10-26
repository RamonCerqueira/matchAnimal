"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SharedPost } from "@/components/shared-post";

function PostContent() { const postId = useSearchParams().get("postId"); return postId ? <SharedPost key={postId} postId={postId}/> : <div className="ma-error-state"><h1>Continue pela comunidade</h1><Link href="/comunidade">Ver publicações</Link></div>; }
export default function SharedPostPage() { return <AppShell title="Publicação"><Suspense fallback={<p role="status">Carregando publicação…</p>}><PostContent/></Suspense></AppShell>; }
