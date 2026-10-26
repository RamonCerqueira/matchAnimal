"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bird, Cat, Dog, Heart, LogOut, MapPin, MessageCircle, PawPrint, Search, ShieldAlert } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type AdminArea = "COMMERCIAL" | "FINANCE" | "MODERATION" | "ACCOUNTS" | "SUPPORT" | "ANALYTICS" | "TEAM" | "SETTINGS";
type Session = { accountInfo: { displayName: string; city: string; state: string }; matchCount: number; unreadCount: number; adminAreas: AdminArea[] };
const SessionContext = createContext<Session | null>(null);
export function useAppSession() { return useContext(SessionContext); }

const primaryLinks = [
  { href: "/dashboard", label: "Início", icon: Dog },
  { href: "/explorar", label: "Explorar", icon: PawPrint },
  { href: "/matches", label: "Conexões", icon: Heart },
  { href: "/comunidade", label: "Comunidade", icon: Bird },
  { href: "/configuracoes", label: "Perfil", icon: Cat },
];
const routeMatches = (href: string, pathname: string) => pathname === href || pathname === `${href}/`
  || (href === "/matches" && pathname.startsWith("/mensagens"))
  || (href === "/explorar" && pathname.startsWith("/pet/perfil"))
  || (href === "/comunidade" && ["/comunidade", "/grupos", "/eventos"].some((path) => pathname.startsWith(path)))
  || (href === "/configuracoes" && (pathname.startsWith("/configuracoes") || pathname.startsWith("/animais")));

export function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  const pathname = usePathname();
  const [authReady, setAuthReady] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{ displayName: string; city: string; state: string }>({ displayName: "Seu perfil", city: "", state: "" });
  const [isModerator, setIsModerator] = useState(false);
  const [adminAreas, setAdminAreas] = useState<AdminArea[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [authError, setAuthError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    let active = true;
    async function verifySession() {
      setAuthError("");
      try {
        let response = await fetch(`${api}/api/auth/me`, { credentials: "include" });
        if (response.status === 401) {
          const refreshed = await fetch(`${api}/api/auth/refresh`, { method: "POST", credentials: "include" });
          if (refreshed.ok) response = await fetch(`${api}/api/auth/me`, { credentials: "include" });
        }
        if (!active) return;
        if (response.status === 401) { window.location.replace("/entrar"); return; }
        if (!response.ok) throw new Error("Conta indisponível");
        const account = await response.json() as { isModerator?: boolean; adminAreas?: AdminArea[]; tutor?: { displayName?: string | null; city?: string | null; state?: string | null } | null };
        setIsModerator(Boolean(account.isModerator));
        setAdminAreas(account.adminAreas ?? []);
        setAccountInfo({ displayName: account.tutor?.displayName?.trim() || "Seu perfil", city: account.tutor?.city?.trim() || "", state: account.tutor?.state?.trim() || "" });
        setAuthReady(true);
      } catch { if (active) setAuthError("Não conseguimos conectar ao MatchAnimal. Confira sua conexão e tente novamente."); }
    }
    void verifySession();
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    function refreshProfile(event: Event) {
      const detail = (event as CustomEvent<{ displayName?: string; city?: string; state?: string }>).detail;
      if (!detail) return;
      setAccountInfo((current) => ({ displayName: detail.displayName?.trim() || current.displayName, city: detail.city?.trim() ?? current.city, state: detail.state?.trim() ?? current.state }));
    }
    window.addEventListener("matchanimal:profile-updated", refreshProfile);
    return () => window.removeEventListener("matchanimal:profile-updated", refreshProfile);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    void Promise.allSettled([
      fetch(`${api}/api/notifications/unread-count`, { credentials: "include" }).then((response) => response.ok ? response.json() as Promise<{ count: number }> : null),
      fetch(`${api}/api/pets/matches`, { credentials: "include" }).then((response) => response.ok ? response.json() as Promise<unknown[]> : null),
    ]).then(([notifications, matches]) => { if (notifications.status === "fulfilled" && notifications.value) setUnreadNotifications(notifications.value.count); if (matches.status === "fulfilled" && matches.value) setMatchCount(matches.value.length); });
  }, [authReady, pathname]);

  async function logout() {
    setLoggingOut(true); setLogoutError("");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/auth/logout`, { method: "POST", credentials: "include" });
      if (!response.ok && response.status !== 401) throw new Error();
      window.location.assign(new URL("/", window.location.origin).href);
    } catch { setLogoutError("Não foi possível sair da conta. Tente novamente."); setLoggingOut(false); }
  }

  const profileInitial = accountInfo.displayName === "Seu perfil" ? <PawPrint size={18}/> : Array.from(accountInfo.displayName)[0]?.toLocaleUpperCase("pt-BR") ?? <PawPrint size={18}/>;
  const locationLabel = [accountInfo.city, accountInfo.state].filter(Boolean).join(", ") || "Sua região";
  if (!authReady) return <div className="ma-session-state" role={authError ? "alert" : "status"}><PawPrint size={30}/>{authError ? <><h1>Vamos tentar de novo?</h1><p>{authError}</p><Button onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</Button><Link href="/entrar">Voltar para entrar</Link></> : <><span className="session-spinner"/> Preparando seu cantinho…</>}</div>;

  return <SessionContext.Provider value={{ accountInfo, matchCount, unreadCount: unreadNotifications, adminAreas }}><div className="product-shell social-shell" data-page-title={title}>
    <a className="ma-skip-link" href="#main-content">Pular para o conteúdo</a>
    <header className="social-header">
      <Link className="wordmark social-wordmark" href="/dashboard" aria-label="MatchAnimal, início"><span className="wordmark-icon"><PawPrint size={17}/></span><span>match<span>animal</span></span></Link>
      <nav className="social-nav" aria-label="Navegação principal">{primaryLinks.map(({ href, label, icon: Icon }) => <Link key={href} aria-current={routeMatches(href, pathname) ? "page" : undefined} className={routeMatches(href, pathname) ? "social-nav-active" : ""} href={href}><Icon size={16}/><span>{label}</span>{label === "Conexões" && matchCount > 0 && <i>{matchCount}</i>}</Link>)}</nav>
      <div className="social-header-actions"><Link className="social-location" href="/configuracoes"><MapPin size={14}/>{locationLabel}</Link><button className="social-icon-button" onClick={() => setSearchOpen(true)} aria-label="Buscar na comunidade"><Search size={19}/></button><Link className="social-icon-button" href="/mensagens" aria-label="Mensagens"><MessageCircle size={19}/></Link><Link className="social-icon-button" href="/notificacoes" aria-label={`Notificações${unreadNotifications ? `, ${unreadNotifications} não lidas` : ""}`}><Bell size={19}/>{unreadNotifications > 0 && <i/>}</Link>{isModerator && <Link className="social-admin-link" href="/administracao" aria-label="Painel administrativo"><ShieldAlert size={19}/></Link>}<Link className="social-user-link" href="/configuracoes" aria-label="Abrir meu perfil"><span className="user-monogram">{profileInitial}</span><span className="social-user-name">{accountInfo.displayName}</span></Link><button className="social-logout" disabled={loggingOut} aria-label="Sair da conta" onClick={() => void logout()}><LogOut size={18}/></button></div>
    </header>
    {logoutError && <p className="ma-inline-error" role="alert">{logoutError}</p>}<main className="product-main" id="main-content" tabIndex={-1}><div className="product-content">{children}</div></main>
    <nav className="product-bottom-nav" aria-label="Navegação móvel">{primaryLinks.map(({ href, label, icon: Icon }) => <Link key={href} aria-current={routeMatches(href, pathname) ? "page" : undefined} className={routeMatches(href, pathname) ? "product-bottom-active" : ""} href={href}><span className="product-nav-icon"><Icon size={19}/>{label === "Conexões" && <PawPrint className="product-nav-paw" size={9}/>}</span><small>{label}</small>{label === "Conexões" && matchCount > 0 && <i>{matchCount}</i>}</Link>)}</nav>
    <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} title="O que vamos descobrir?" description="Encontre pets e histórias na comunidade."><form className="ma-search-form" role="search" action="/comunidade"><label htmlFor="community-search">Buscar na comunidade</label><input id="community-search" name="q" type="search" placeholder="Nome do pet, raça ou assunto" required maxLength={100}/><Button type="submit"><Search size={17}/>Buscar</Button></form></Dialog>
  </div></SessionContext.Provider>;
}
