import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { CommunityFeed } from "@/components/community-feed";

export default function CommunityPage() { return <AppShell title="Comunidade"><Suspense fallback={<p className="community-state" role="status">Carregando comunidade…</p>}><CommunityFeed/></Suspense></AppShell>; }
