import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { CommunityFeed } from "@/components/community-feed";

export default function SavedPostsPage() {
  return (
    <AppShell title="Publicações salvas">
      <Suspense fallback={<p className="community-state" role="status">Carregando itens salvos…</p>}>
        <CommunityFeed defaultMode="saved" />
      </Suspense>
    </AppShell>
  );
}
