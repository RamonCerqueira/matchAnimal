"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Store } from "lucide-react";
import "@/app/styles/sponsored-placement.css";

export type SponsoredPlacementName = "HOME_BANNER" | "COMMUNITY_FEED" | "EXPLORE_CARD";
type Campaign = {
  id: string;
  headline: string;
  body: string | null;
  ctaLabel: string;
  destinationUrl: string;
  placement: SponsoredPlacementName;
  endsAt: string;
  partner: { businessName: string };
  asset: { id: string; url: string; mediaType: "IMAGE" | "VIDEO"; mimeType: string; width: number; height: number };
};
const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function httpsDestination(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function validCampaign(campaign: Campaign, placement: SponsoredPlacementName) {
  return campaign.placement === placement && Boolean(campaign.id && campaign.partner?.businessName && campaign.headline && campaign.ctaLabel)
    && Boolean(httpsDestination(campaign.destinationUrl)) && new Date(campaign.endsAt).getTime() > Date.now()
    && ["IMAGE", "VIDEO"].includes(campaign.asset?.mediaType) && campaign.asset.width > 0 && campaign.asset.height > 0;
}

export function SponsoredPlacement({ placement }: { placement: SponsoredPlacementName }) {
  const [result, setResult] = useState<{ placement: SponsoredPlacementName; campaigns: Campaign[] } | null>(null);
  const campaigns = result?.placement === placement ? result.campaigns : [];

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      controller?.abort();
      controller = new AbortController();
      clearTimeout(expiryTimer);
      try {
        const response = await fetch(`${api}/api/commercial/placements/${placement}`, { credentials: "include", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Placement unavailable");
        const data = await response.json() as Campaign[];
        const available = Array.isArray(data) ? data.filter((campaign) => validCampaign(campaign, placement)).slice(0, 1) : [];
        if (!active) return;
        setResult({ placement, campaigns: available });
        if (available.length) {
          const expiresIn = Math.min(...available.map((campaign) => new Date(campaign.endsAt).getTime() - Date.now()));
          expiryTimer = setTimeout(() => { if (active) void load(); }, Math.min(Math.max(expiresIn, 0) + 100, 2_147_483_647));
        }
      } catch (cause) {
        if (active && !(cause instanceof Error && cause.name === "AbortError")) setResult({ placement, campaigns: [] });
      }
    }
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { active = false; controller?.abort(); clearTimeout(expiryTimer); window.removeEventListener("focus", refreshVisible); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [placement]);

  const removeCampaign = useCallback((campaignId: string) => {
    setResult((current) => current ? { ...current, campaigns: current.campaigns.filter((campaign) => campaign.id !== campaignId) } : current);
  }, []);

  if (!campaigns.length) return null;
  return <section className={`sponsored-placement sponsored-placement-${placement.toLowerCase()}`} aria-label="Conteúdo patrocinado" data-ad-placement={placement}>
    {campaigns.map((campaign) => <SponsoredCard key={campaign.id} campaign={campaign} onUnavailable={removeCampaign}/>)}
  </section>;
}

function SponsoredCard({ campaign, onUnavailable }: { campaign: Campaign; onUnavailable: (id: string) => void }) {
  const cardRef = useRef<HTMLElement>(null);
  const impressionSent = useRef(false);
  const [mediaReady, setMediaReady] = useState(false);
  const destination = httpsDestination(campaign.destinationUrl);
  const mediaUrl = `${api}/api/commercial/media/${encodeURIComponent(campaign.asset.id)}`;

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !mediaReady || impressionSent.current || typeof IntersectionObserver === "undefined") return;
    let inView = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function updateVisibility() {
      clearTimeout(timer);
      if (!inView || document.visibilityState !== "visible" || impressionSent.current) return;
      timer = setTimeout(() => {
        impressionSent.current = true;
        void fetch(`${api}/api/commercial/campaigns/${encodeURIComponent(campaign.id)}/impression`, { method: "POST", credentials: "include", keepalive: true })
          .then((response) => { if (response.status === 404) onUnavailable(campaign.id); })
          .catch(() => { /* Optional metrics never interrupt discovery or messaging. */ });
      }, 1000);
    }
    const observer = new IntersectionObserver(([entry]) => { inView = Boolean(entry?.isIntersecting && entry.intersectionRatio >= .5); updateVisibility(); }, { threshold: [.5] });
    observer.observe(card);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => { clearTimeout(timer); observer.disconnect(); document.removeEventListener("visibilitychange", updateVisibility); };
  }, [campaign.id, mediaReady, onUnavailable]);

  function trackClick() {
    void fetch(`${api}/api/commercial/campaigns/${encodeURIComponent(campaign.id)}/click`, { method: "POST", credentials: "include", keepalive: true }).catch(() => { /* Navigation is independent of optional metrics. */ });
  }

  if (!destination) return null;
  return <article className="sponsored-card" ref={cardRef}>
    <header className="sponsored-card-header"><span className="sponsored-brand-mark" aria-hidden="true"><Store size={17}/></span><strong>{campaign.partner.businessName}</strong><span className="sponsored-label">Patrocinado</span></header>
    <div className="sponsored-card-content">
      <div className="sponsored-media" style={{ aspectRatio: `${campaign.asset.width} / ${campaign.asset.height}` }}>
        {campaign.asset.mediaType === "VIDEO" ? <video src={mediaUrl} width={campaign.asset.width} height={campaign.asset.height} muted controls playsInline preload="metadata" aria-label={`Publicidade de ${campaign.partner.businessName}`} onLoadedMetadata={() => setMediaReady(true)} onError={() => onUnavailable(campaign.id)}/> : <img src={mediaUrl} alt={campaign.headline} width={campaign.asset.width} height={campaign.asset.height} loading="lazy" decoding="async" onLoad={() => setMediaReady(true)} onError={() => onUnavailable(campaign.id)}/>}
      </div>
      <div className="sponsored-copy"><h3>{campaign.headline}</h3>{campaign.body && <p>{campaign.body}</p>}<a href={destination} target="_blank" rel="noopener noreferrer sponsored" onClick={trackClick} aria-label={`${campaign.ctaLabel} — ${campaign.partner.businessName}, abre em outra aba`}>{campaign.ctaLabel}<ArrowUpRight size={16} aria-hidden="true"/></a></div>
    </div>
  </article>;
}
