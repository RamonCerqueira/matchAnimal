"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, PawPrint, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const links = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#comunidade", label: "Comunidade" },
  { href: "#seguranca", label: "Bem-estar animal" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); menuButton.current?.focus(); } };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="wordmark" href="#inicio" aria-label="MatchAnimal, início" onClick={() => setOpen(false)}>
          <span className="wordmark-icon"><PawPrint size={17} strokeWidth={2.3} /></span>
          <span>match<span>animal</span></span>
        </Link>
        <nav id="site-navigation" className={`desktop-nav ${open ? "mobile-open" : ""}`} aria-label="Navegação principal">
          {links.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>)}
          <div className="mobile-nav-cta"><Button asChild><Link href="/cadastro">Criar perfil <ArrowUpRight size={16} /></Link></Button></div>
        </nav>
        <div className="header-actions">
          <Link className="login-link" href="/entrar">Entrar</Link>
          <Button className="header-cta" asChild><Link href="/cadastro">Criar perfil <ArrowUpRight size={15} /></Link></Button>
          <button ref={menuButton} className="menu-toggle" aria-controls="site-navigation" aria-label={open ? "Fechar menu" : "Abrir menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
      </div>
    </header>
  );
}
