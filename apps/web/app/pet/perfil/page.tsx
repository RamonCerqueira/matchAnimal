"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PublicPetProfile } from "@/components/public-pet-profile";

function ProfileContent() { const petId = useSearchParams().get("petId"); return petId ? <PublicPetProfile key={petId} petId={petId}/> : <div className="ma-error-state"><h1>Escolha um pet para conhecer</h1><Link href="/explorar">Explorar perfis</Link></div>; }
export default function PetProfilePage() { return <AppShell title="Perfil do animal"><Suspense fallback={<p role="status">Carregando perfil…</p>}><ProfileContent/></Suspense></AppShell>; }
