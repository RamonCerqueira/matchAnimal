import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { FollowersView } from "@/components/followers-view";

export default function FollowersPage() {
  return (
    <AppShell title="Meus seguidores">
      <Suspense fallback={<p className="community-state" role="status">Carregando conexões…</p>}>
        <FollowersView />
      </Suspense>
    </AppShell>
  );
}
