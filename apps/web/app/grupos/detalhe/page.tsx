"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { GroupTimeline } from "@/components/community-directory";

function GroupContent() { const groupId = useSearchParams().get("id"); return groupId ? <GroupTimeline key={groupId} groupId={groupId}/> : <div className="ma-error-state"><h1>Encontre sua comunidade</h1><Link href="/grupos">Ver grupos</Link></div>; }
export default function GroupDetailPage() { return <AppShell title="Comunidade"><Suspense fallback={<p role="status">Carregando grupo…</p>}><GroupContent/></Suspense></AppShell>; }
