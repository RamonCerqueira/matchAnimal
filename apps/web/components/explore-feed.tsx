"use client";

import { apiBaseUrl } from "@/lib/api-config";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Filter,
  Flag,
  Heart,
  Info,
  MapPin,
  MoreVertical,
  PawPrint,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import { PetFriends } from "@/components/pet-friends";
import { ResponsibleCareNotice } from "@/components/responsible-care-notice";
import { SponsoredPlacement } from "@/components/sponsored-placement";
import { petFeedback } from "@/lib/native-feedback";

type Intent = "FRIENDSHIP" | "RESPONSIBLE_BREEDING" | "ADOPTION";

interface Profile {
  id: string;
  name: string;
  age: string;
  species: string;
  breed: string;
  sex: string;
  size: string;
  city: string;
  distance: string;
  intent: Intent;
  score: number | null;
  traits: string[];
  photo: string;
  photoUrl?: string | null;
  note: string;
  health: boolean;
}

interface ApiPet {
  id: string;
  name: string;
  species: "DOG" | "CAT" | "OTHER";
  speciesOther?: string | null;
  breed?: string | null;
  sex?: "FEMALE" | "MALE" | "UNKNOWN";
  size?: string;
  birthDate?: string | null;
  bio?: string | null;
  intent?: Intent;
  temperament?: string[];
  preferences?: string[];
  city?: string | null;
  state?: string | null;
  coverPhotoUrl?: string | null;
  approximateDistanceKm?: number | null;
  compatibility?: { score?: number | null } | null;
}

interface OwnPet {
  id: string;
  name: string;
  species: string;
  intent?: Intent;
  isPublic: boolean;
  coverPhotoUrl?: string | null;
}

interface ApiMatch {
  petA: ApiPet & { isMine: boolean };
  petB: ApiPet & { isMine: boolean };
}

const intentLabels: Record<Intent, string> = {
  FRIENDSHIP: "Amizade",
  RESPONSIBLE_BREEDING: "Relacionamento responsável",
  ADOPTION: "Disponível para adoção",
};

const speciesLabels: Record<ApiPet["species"], string> = {
  DOG: "Cão",
  CAT: "Gato",
  OTHER: "Outro",
};

const sizes: Record<string, string> = {
  SMALL: "Pequeno",
  MEDIUM: "Médio",
  LARGE: "Grande",
  EXTRA_LARGE: "Gigante",
  UNKNOWN: "Não informado",
};

const API_BASE_URL = apiBaseUrl;

function ageLabel(birthDate?: string | null): string {
  if (!birthDate) return "idade não informada";
  const date = new Date(birthDate);
  let years = new Date().getFullYear() - date.getFullYear();
  const currentMonth = new Date().getMonth();
  const birthMonth = date.getMonth();

  if (
    currentMonth < birthMonth ||
    (currentMonth === birthMonth && new Date().getDate() < date.getDate())
  ) {
    years--;
  }

  return years < 1 ? "menos de 1 ano" : `${years} ${years === 1 ? "ano" : "anos"}`;
}

function mapApiPet(pet: ApiPet): Profile {
  return {
    id: pet.id,
    name: pet.name,
    age: ageLabel(pet.birthDate),
    species: speciesLabels[pet.species] ?? pet.speciesOther ?? "Outro",
    breed: pet.breed ?? "Sem raça informada",
    sex: pet.sex === "FEMALE" ? "Fêmea" : pet.sex === "MALE" ? "Macho" : "Sexo não informado",
    size: sizes[pet.size ?? "UNKNOWN"] ?? "Não informado",
    city: [pet.city, pet.state].filter(Boolean).join(", ") || "Região não informada",
    distance: pet.approximateDistanceKm ? `~${pet.approximateDistanceKm} km` : "Região aprox.",
    intent: pet.intent ?? "FRIENDSHIP",
    score: pet.compatibility?.score ?? null,
    traits: [...new Set([...(pet.temperament ?? []), ...(pet.preferences ?? [])])],
    photo: "photo-1543466835-00a7907e9de1",
    photoUrl: pet.coverPhotoUrl,
    note: pet.bio || "Este perfil ainda não tem uma apresentação. Converse com o tutor para saber mais.",
    health: false,
  };
}

function ExplorePhoto({ source, name }: { source: string | null; name: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <>
      {source && !failed ? (
        <img
          className="explore-cover"
          src={source}
          alt={`Foto de ${name}`}
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="explore-photo-fallback">
          <PetFriends mood="friends" />
          <span>{source ? "A foto não carregou" : "Foto ainda não publicada"}</span>
        </div>
      )}
      <span className="explore-cover-shade" aria-hidden="true" />
    </>
  );
}

export function ExploreFeed() {
  const [intent, setIntent] = useState<"ALL" | Intent>("ALL");
  const [species, setSpecies] = useState("ALL");
  const [radiusKm, setRadiusKm] = useState(50);
  const [index, setIndex] = useState(0);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [ownPets, setOwnPets] = useState<OwnPet[]>([]);
  const [viewerPetId, setViewerPetId] = useState("");
  const [viewerPetIsPublic, setViewerPetIsPublic] = useState(false);
  const [matches, setMatches] = useState<Profile[]>([]);
  const [modal, setModal] = useState<Profile | null>(null);
  const [matchCelebration, setMatchCelebration] = useState<Profile | null>(null);
  const [applicationSent, setApplicationSent] = useState(false);
  const [applicationError, setApplicationError] = useState("");
  const [notice, setNotice] = useState("");
  const [careNotice, setCareNotice] = useState(false);
  const [careMutualInterest, setCareMutualInterest] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);

  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [compatibilityOpen, setCompatibilityOpen] = useState(false);
  const [hasLocation, setHasLocation] = useState<boolean | null>(null);

  const modalRef = useDialogAccessibility<HTMLElement>(Boolean(modal), () => setModal(null));
  const celebrationRef = useDialogAccessibility<HTMLElement>(Boolean(matchCelebration), () => setMatchCelebration(null));
  const router = useRouter();

  // Fecha o menu de opções ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
        setOptionsMenuOpen(false);
      }
    }
    if (optionsMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [optionsMenuOpen]);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch(`${API_BASE_URL}/api/pets/mine`, { credentials: "include" }),
      fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include" }),
      fetch(`${API_BASE_URL}/api/pets/matches`, { credentials: "include" }),
    ])
      .then(async ([petsResponse, tutorResponse, matchesResponse]) => {
        if (!petsResponse.ok) throw new Error();
        const pets = (await petsResponse.json()) as OwnPet[];
        const tutorData = tutorResponse.ok ? await tutorResponse.json() : null;
        const existingMatches = matchesResponse.ok ? ((await matchesResponse.json()) as ApiMatch[]) : [];
        if (!active) return;
        setMatches(existingMatches.map((match) => mapApiPet(match.petA.isMine ? match.petB : match.petA)));
        const tutor = tutorData?.tutor;
        setHasLocation(Boolean((tutor?.city && tutor?.state) || (Number.isFinite(tutor?.latitude) && Number.isFinite(tutor?.longitude))));
        if (Number.isFinite(tutor?.matchRadiusKm)) setRadiusKm(tutor.matchRadiusKm);
        if (tutor?.preferredSpecies === "DOG") setSpecies("Cão");
        else if (tutor?.preferredSpecies === "CAT") setSpecies("Gato");
        else if (tutor?.preferredSpecies === "OTHER") setSpecies("Outro");
        setOwnPets(pets);
        const requestedPet = new URLSearchParams(window.location.search).get("pet");
        const selectedPet = pets.find((pet) => pet.id === requestedPet) ?? pets[0];
        if (selectedPet) {
          setViewerPetId(selectedPet.id);
          setViewerPetIsPublic(selectedPet.isPublic);
        } else {
          setViewerPetId("");
          setViewerPetIsPublic(false);
          setProfiles([]);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("Não foi possível carregar seus pets. Tente novamente.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!viewerPetId) return;
    let active = true;

    const query = new URLSearchParams({ viewerPetId, radiusKm: String(radiusKm) });
    if (intent !== "ALL") query.set("intent", intent);
    if (species !== "ALL") query.set("species", species === "Cão" ? "DOG" : species === "Gato" ? "CAT" : "OTHER");
    fetch(
      `${API_BASE_URL}/api/pets/explore?${query.toString()}`,
      { credentials: "include" }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const results = (await response.json()) as ApiPet[];
        if (!active) return;
        const mapped = results.map(mapApiPet);
        setProfiles(mapped);
        setIndex(0);
      })
      .catch(() => {
        if (active) {
          setError("Não conseguimos carregar a descoberta. Confira sua conexão e tente novamente.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [viewerPetId, radiusKm, intent, species, attempt]);

  const profile = profiles.length ? profiles[index % profiles.length] : null;

  function dismissEvaluated(id: string) {
    setOptionsMenuOpen(false);
    setProfiles((all) => all.filter((item) => item.id !== id));
  }

  async function loadMoreProfiles() {
    if (!viewerPetId) {
      setNotice("Cadastre um pet para descobrir perfis reais.");
      return;
    }
    try {
      const query = new URLSearchParams({ viewerPetId, limit: "50", radiusKm: String(radiusKm) });
      if (intent !== "ALL") query.set("intent", intent);
      if (species !== "ALL") query.set("species", species === "Cão" ? "DOG" : species === "Gato" ? "CAT" : "OTHER");
      const response = await fetch(
        `${API_BASE_URL}/api/pets/explore?${query.toString()}`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Não foi possível buscar novos perfis.");
      const data = (await response.json()) as ApiPet[];
      const known = new Set(profiles.map((item) => item.id));
      const fresh = data.map(mapApiPet).filter((item) => !known.has(item.id));
      setProfiles((all) => all.concat(fresh));
      setIndex(0);
      if (!fresh.length) {
        setNotice("Você já avaliou todos os perfis disponíveis nesta região. Tente novamente mais tarde.");
      }
    } catch (err) {
      setNotice((err as Error).message);
    }
  }

  function changeIntent(value: "ALL" | Intent) {
    setLoading(true);
    setError("");
    setIntent(value);
    setIndex(0);
  }

  function changeSpecies(value: string) {
    setLoading(true);
    setError("");
    setSpecies(value);
    setIndex(0);
  }

  function openProfile(pet = profile) {
    if (!pet) return;
    router.push(`/pet/perfil?petId=${encodeURIComponent(pet.id)}`);
  }

  function resetCard() {
    pointerStart.current = null;
    const card = cardRef.current;
    if (!card) return;
    card.style.removeProperty("--swipe-x");
    card.style.removeProperty("--swipe-y");
    card.style.removeProperty("--swipe-rotation");
    delete card.dataset.swipeDirection;
    delete card.dataset.dragging;
  }

  function handlePointerStart(event: PointerEvent<HTMLElement>) {
    if (
      actionBusy ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0) ||
      (event.target as HTMLElement).closest("button,a")
    ) {
      return;
    }
    pointerStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (cardRef.current) cardRef.current.dataset.dragging = "true";
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const start = pointerStart.current;
    const card = cardRef.current;
    if (!start || !card || start.id !== event.pointerId) return;

    const x = event.clientX - start.x;
    const y = event.clientY - start.y;

    card.style.setProperty("--swipe-x", `${x * 0.6}px`);
    card.style.setProperty("--swipe-y", `${y * 0.35}px`);
    card.style.setProperty("--swipe-rotation", `${x / 35}deg`);

    card.dataset.swipeDirection =
      Math.max(Math.abs(x), Math.abs(y)) < 30
        ? ""
        : Math.abs(x) > Math.abs(y)
          ? x > 0
            ? "like"
            : "pass"
          : y > 0
            ? "profile"
            : "super";
  }

  function handlePointerEnd(event: PointerEvent<HTMLElement>) {
    const start = pointerStart.current;
    if (!start || start.id !== event.pointerId) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    resetCard();

    if (Math.max(Math.abs(x), Math.abs(y)) < 75 || actionBusy) return;

    if (Math.abs(x) > Math.abs(y)) {
      if (x < 0) void pass();
      else void like();
    } else if (y > 0) {
      openProfile();
    } else if (profile?.intent !== "ADOPTION") {
      void like(true);
    }
  }

  async function pass() {
    if (!profile || actionBusy) return;
    if (!viewerPetId) {
      setNotice("Cadastre um pet antes de avaliar perfis.");
      return;
    }
    setActionBusy(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/pets/${encodeURIComponent(profile.id)}/pass`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromPetId: viewerPetId }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Não foi possível avaliar este perfil.");
      dismissEvaluated(profile.id);
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  async function like(superMatch = false) {
    if (!profile || actionBusy) return;
    if (profile.intent === "ADOPTION") {
      setModal(profile);
      setApplicationSent(false);
      setApplicationError("");
      return;
    }

    void petFeedback("tap");


    if (!viewerPetId) {
      setNotice("Cadastre um pet antes de demonstrar interesse.");
      return;
    }

    try {
      setActionBusy(true);
      const response = await fetch(
        `${API_BASE_URL}/api/pets/${encodeURIComponent(profile.id)}/${superMatch ? "super-match" : "interest"}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromPetId: viewerPetId }),
        }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          Array.isArray(result.message) ? result.message.join(" ") : result.message ?? "Não foi possível enviar o interesse."
        );
      }
      if (result.matched) {
        void petFeedback("match");
        setMatches((old) => [profile, ...old]);
        setMatchCelebration(profile);
        setNotice(`Match com ${profile.name}!`);
      } else if (result.responsibleBreeding || result.reviewRequired) {
        setCareNotice(true);
        setCareMutualInterest(Boolean(result.mutualInterest));
        setNotice("");
      } else {
        setNotice(
          result.like?.isSuperMatch
            ? "Super Match enviado! O tutor receberá uma notificação especial."
            : "Interesse enviado. Se os dois tutores demonstrarem interesse, haverá um match."
        );
      }
      dismissEvaluated(profile.id);
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    const formData = new FormData(event.currentTarget);
    const message = String(formData.get("message") ?? "");
    const livingDetails = String(formData.get("livingDetails") ?? "");


    try {
      const response = await fetch(
        `${API_BASE_URL}/api/pets/${encodeURIComponent(modal.id)}/adoption-applications`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, livingDetails }),
        }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          Array.isArray(result.message) ? result.message.join(" ") : result.message ?? "Não foi possível enviar a candidatura."
        );
      }
      void petFeedback("success");
      setApplicationSent(true);
    } catch (err) {
      setApplicationError((err as Error).message);
    }
  }

  async function reportProfile(pet: Profile) {
    const reason = window.prompt(
      `Por que você deseja denunciar o perfil de ${pet.name}?`,
      "Informação incorreta ou comportamento inadequado"
    );
    if (!reason?.trim()) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/safety/reports`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "PET", targetId: pet.id, reason: reason.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Não foi possível enviar a denúncia.");
      setNotice("Denúncia enviada para a equipe de moderação.");
    } catch (err) {
      setNotice((err as Error).message);
    }
  }

  async function blockProfile(pet: Profile) {
    if (
      !window.confirm(
        `Bloquear o tutor de ${pet.name}? O perfil deste pet e de seu tutor serão removidos da sua descoberta.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/safety/pets/${encodeURIComponent(pet.id)}/block`, {
        method: "POST",
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Não foi possível bloquear este perfil.");
      setProfiles((all) => all.filter((item) => item.id !== pet.id));
      setIndex(0);
      setNotice(`Perfil de ${pet.name} bloqueado.`);
    } catch (err) {
      setNotice((err as Error).message);
    }
  }

  return (
    <div className="explore-page">
      <span className="sr-only" id="explore-gesture-help">
        Arraste a foto ou use as setas: esquerda para passar, direita para demonstrar interesse, cima para Super Match, baixo para ver o perfil.
      </span>

      <Dialog
        open={compatibilityOpen}
        onClose={() => setCompatibilityOpen(false)}
        title="Como ler a compatibilidade"
        description="Os fatores resumem semelhanças entre os perfis e ajudam a descobrir novas conexões."
      >
        <p>
          Espécie, objetivo, região aproximada, porte, idade e comportamento contribuem para o resultado. A pontuação não garante afinidade ou segurança.
        </p>
        <p>
          Para reprodução, não existe pontuação nem Match automático. O MatchAnimal não verifica documentos ou aprova reprodução; consultem um médico-veterinário e confirmem saúde, bem-estar e normas aplicáveis.
        </p>
      </Dialog>

      <div className="explore-heading">
        <h1 className="product-h1">
          Explore com <em>carinho.</em>
        </h1>
        <button
          className="explore-filter-button"
          aria-label="Abrir preferências"
          aria-expanded={preferencesOpen}
          title="Filtros e preferências"
          onClick={() => setPreferencesOpen((open) => !open)}
        >
          <Filter size={18} />
        </button>
      </div>

      <div className="explore-layout">
        <section className="explore-main">
          {preferencesOpen && (
            <div className="explore-preferences-panel" id="explore-filters">
              <div className="intent-tabs" role="group" aria-label="Objetivo do encontro">
                {[
                  { id: "ALL", label: "Tudo" },
                  { id: "FRIENDSHIP", label: "Amizade" },
                  { id: "RESPONSIBLE_BREEDING", label: "Relacionamento" },
                  { id: "ADOPTION", label: "Adoção" },
                ].map((item) => (
                  <button
                    key={item.id}
                    className={intent === item.id ? "intent-tab-active" : ""}
                    onClick={() => changeIntent(item.id as "ALL" | Intent)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <label className="species-select">
                <PawPrint size={14} />
                <select
                  value={species}
                  onChange={(event) => changeSpecies(event.target.value)}
                  aria-label="Filtrar espécie"
                >
                  <option value="ALL">Cães e gatos</option>
                  <option value="Cão">Cães</option>
                  <option value="Gato">Gatos</option>
                  <option value="Outro">Outras espécies</option>
                </select>
                <ChevronDown size={13} />
              </label>

              <label className="region-filter">
                <MapPin size={14} />
                <span>Até</span>
                <select
                  value={radiusKm}
                  onChange={(event) => {
                    setLoading(true);
                    setError("");
                    setRadiusKm(Number(event.target.value));
                  }}
                  aria-label="Distância máxima"
                >
                  <option value={10}>10 km</option>
                  <option value={25}>25 km</option>
                  <option value={50}>50 km</option>
                  <option value={100}>100 km</option>
                  <option value={200}>200 km</option>
                </select>
              </label>
            </div>
          )}

          {ownPets.length > 0 && (
            <label className="viewer-pet-select">
              Explorando com{" "}
              <select
                value={viewerPetId}
                onChange={(event) => {
                  setLoading(true);
                  setError("");
                  setViewerPetId(event.target.value);
                  setViewerPetIsPublic(ownPets.find((pet) => pet.id === event.target.value)?.isPublic ?? false);
                }}
              >
                {ownPets.map((pet) => (
                  <option key={pet.id} value={pet.id}>
                    {pet.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
          )}

          {viewerPetId && !viewerPetIsPublic && (
            <div className="explore-notice" role="status">
              Este perfil está privado. Você pode explorar, mas precisa publicá-lo para demonstrar interesse.
              <Link href="/animais">Gerenciar visibilidade</Link>
            </div>
          )}

          {notice && (
            <div className="explore-notice" role="status">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Dispensar aviso">
                <X size={13} />
              </button>
            </div>
          )}

          {careNotice && <ResponsibleCareNotice title={careMutualInterest ? "Interesse mútuo, com cuidado" : "Interesse registrado com cuidado"}>{careMutualInterest ? "Os dois tutores demonstraram interesse. Isso não cria Match nem recomenda reprodução. Antes de qualquer decisão, consultem um médico-veterinário, confirmem saúde e bem-estar e observem as normas aplicáveis." : "O tutor foi avisado do interesse. Isso não cria Match nem recomenda reprodução. Antes de qualquer decisão, consultem um médico-veterinário, confirmem saúde e bem-estar e observem as normas aplicáveis."}</ResponsibleCareNotice>}

          {intent === "RESPONSIBLE_BREEDING" && <ResponsibleCareNotice compact title="Encontros responsáveis começam pela saúde" />}

          {loading ? (
            <div className="home-loading" role="status">
              <span className="session-spinner" />
              Encontrando novos focinhos…
            </div>
          ) : error ? (
            <div className="ma-error-state" role="alert">
              <h2>Vamos tentar de novo?</h2>
              <p>{error}</p>
              <Button
                onClick={() => {
                  setLoading(true);
                  setError("");
                  setAttempt((value) => value + 1);
                }}
              >
                Tentar novamente
              </Button>
            </div>
          ) : profile ? (
            <>
              <article ref={cardRef} aria-busy={actionBusy} className="explore-card">
                <div
                  className="explore-photo"
                  tabIndex={0}
                  aria-describedby="explore-gesture-help"
                  onPointerDown={handlePointerStart}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerEnd}
                  onPointerCancel={resetCard}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget || actionBusy) return;
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      void pass();
                    }
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      void like();
                    }
                    if (event.key === "ArrowUp" && profile.intent !== "ADOPTION") {
                      event.preventDefault();
                      void like(true);
                    }
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      openProfile();
                    }
                  }}
                  role="group"
                  aria-label={
                    profile.photoUrl
                      ? `Foto de ${profile.name}`
                      : `Foto de ${profile.name} ainda não publicada`
                  }
                >
                  <ExplorePhoto
                    key={profile.id}
                    source={profile.photoUrl ?? null}
                    name={profile.name}
                  />

                  {/* Topo da foto: Badge de objetivo e Menu de Segurança */}
                  <div className="explore-photo-top">
                    <span className="intent-badge">
                      <span /> {intentLabels[profile.intent]}
                    </span>

                    <div className="explore-options-wrapper" ref={optionsMenuRef}>
                      <button
                        type="button"
                        className="explore-options-btn"
                        onClick={() => setOptionsMenuOpen((open) => !open)}
                        aria-label="Opções e moderação do perfil"
                        title="Opções do perfil"
                        aria-expanded={optionsMenuOpen}
                        aria-haspopup="true"
                      >
                        <MoreVertical size={18} aria-hidden="true" />
                      </button>

                      {optionsMenuOpen && (
                        <div className="explore-options-dropdown" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            className="explore-dropdown-item"
                            onClick={() => {
                              setOptionsMenuOpen(false);
                              void reportProfile(profile);
                            }}
                          >
                            <Flag size={15} aria-hidden="true" />
                            <div>
                              <strong>Denunciar perfil</strong>
                              <small>Reportar conduta ou dados falsos</small>
                            </div>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            className="explore-dropdown-item text-danger"
                            onClick={() => {
                              setOptionsMenuOpen(false);
                              void blockProfile(profile);
                            }}
                          >
                            <ShieldAlert size={15} aria-hidden="true" />
                            <div>
                              <strong>Bloquear tutor</strong>
                              <small>Não ver mais este perfil</small>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rodapé da Foto */}
                  <div className="explore-photo-bottom">
                    {profile.intent === "FRIENDSHIP" && profile.score !== null && (
                      <span className="compatibility-badge">
                        <Sparkles size={12} />
                        {profile.score}% compatível
                      </span>
                    )}
                    {profile.intent === "RESPONSIBLE_BREEDING" && (
                      <span className="breeding-review-badge">
                        <ShieldCheck size={12} /> Sem Match automático
                      </span>
                    )}
                    <h2>
                      {profile.name} <span>· {profile.age}</span>
                    </h2>
                    <div className="explore-pet-meta">
                      {profile.breed}
                      <i /> {profile.sex}
                      <i /> Porte {profile.size}
                    </div>
                  </div>

                  {/* Indicadores visuais animados de reação / gesto pet */}
                  <div className="swipe-cue swipe-cue-like" aria-hidden="true">
                    <div className="swipe-cue-icon">
                      <PawPrint size={24} />
                    </div>
                    <div className="swipe-cue-content">
                      <strong className="swipe-cue-title">Adorei! 🐾</strong>
                      <small className="swipe-cue-subtitle">Latido de carinho</small>
                    </div>
                  </div>

                  <div className="swipe-cue swipe-cue-pass" aria-hidden="true">
                    <div className="swipe-cue-icon">
                      <X size={24} strokeWidth={2.5} />
                    </div>
                    <div className="swipe-cue-content">
                      <strong className="swipe-cue-title">Passar</strong>
                      <small className="swipe-cue-subtitle">Próximo focinho</small>
                    </div>
                  </div>

                  <div className="swipe-cue swipe-cue-super" aria-hidden="true">
                    <div className="swipe-cue-icon">
                      <Sparkles size={24} />
                    </div>
                    <div className="swipe-cue-content">
                      <strong className="swipe-cue-title">Super Match! ⭐</strong>
                      <small className="swipe-cue-subtitle">Destaque especial</small>
                    </div>
                  </div>

                  <div className="swipe-cue swipe-cue-profile" aria-hidden="true">
                    <div className="swipe-cue-icon">
                      <Info size={24} />
                    </div>
                    <div className="swipe-cue-content">
                      <strong className="swipe-cue-title">Ver Perfil 🐾</strong>
                      <small className="swipe-cue-subtitle">Conhecer melhor</small>
                    </div>
                  </div>
                </div>

                {/* Botões de Ação com Rótulos e Tooltips Claros */}
                <div className="explore-actions" role="toolbar" aria-label="Ações de avaliação">
                  {profile.intent === "ADOPTION" ? (
                    <>
                      <div className="explore-action-item">
                        <button
                          type="button"
                          className="skip-action"
                          onClick={() => void pass()}
                          aria-label="Passar perfil"
                          title="Passar para o próximo pet (Seta Esquerda)"
                          disabled={actionBusy}
                        >
                          <X size={22} aria-hidden="true" />
                        </button>
                        <span className="action-hint">Passar</span>
                      </div>

                      <button
                        type="button"
                        className="adoption-action"
                        onClick={() => void like()}
                        disabled={actionBusy}
                        title="Enviar candidatura para adoção responsável"
                      >
                        Tenho interesse em adotar <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="explore-action-item">
                        <button
                          type="button"
                          className="skip-action"
                          onClick={() => void pass()}
                          aria-label="Passar perfil"
                          title="Passar para o próximo pet (Seta Esquerda)"
                          disabled={actionBusy}
                        >
                          <X size={22} aria-hidden="true" />
                        </button>
                        <span className="action-hint">Passar</span>
                      </div>

                      <div className="explore-action-item">
                        <button
                          type="button"
                          className="like-action"
                          onClick={() => void like()}
                          aria-label="Curtir perfil"
                          title="Curtir e demonstrar interesse mútuo (Seta Direita)"
                          disabled={actionBusy}
                        >
                          <Heart size={22} aria-hidden="true" />
                        </button>
                        <span className="action-hint">Curtir</span>
                      </div>

                      <div className="explore-action-item">
                        <button
                          type="button"
                          className="super-match-action"
                          onClick={() => void like(true)}
                          aria-label="Enviar Super Match"
                          title="Enviar Super Match com destaque especial (Seta Cima)"
                          disabled={actionBusy}
                        >
                          <Sparkles size={19} aria-hidden="true" />
                        </button>
                        <span className="action-hint">Super Match</span>
                      </div>

                      <div className="explore-action-item">
                        <button
                          type="button"
                          className="info-action"
                          onClick={() => setCompatibilityOpen(true)}
                          aria-label="Ver fatores de compatibilidade"
                          title="Ver cálculo de afinidade e compatibilidade"
                        >
                          <Info size={19} aria-hidden="true" />
                        </button>
                        <span className="action-hint">Afinidade</span>
                      </div>
                    </>
                  )}
                </div>

                <p className="explore-footnote">
                  {profile.intent === "ADOPTION"
                    ? "A adoção segue um processo de candidatura e avaliação do responsável."
                    : "Um match só acontece com interesse mútuo entre tutores."}
                </p>

                <div className="explore-card-body">
                  <div className="explore-location">
                    <MapPin size={14} />
                    <strong>{profile.distance}</strong>
                    <i /> {profile.city}
                  </div>

                  <p className="explore-bio">{profile.note}</p>

                  <div className="explore-traits">
                    {profile.traits.map((trait) => (
                      <span key={trait}>{trait}</span>
                    ))}
                  </div>

                  {profile.health && (
                    <div className="health-status">
                      <ShieldCheck size={14} />
                      <span>Informações de saúde declaradas pelo tutor</span>
                      <button
                        type="button"
                        aria-label="Sobre informações de saúde"
                        onClick={() =>
                          setNotice(
                            "Informações declaradas não substituem documentos ou avaliação veterinária."
                          )
                        }
                      >
                        <Info size={13} />
                      </button>
                    </div>
                  )}

                  {profile.intent === "RESPONSIBLE_BREEDING" && (
                    <div className="breeding-warning">
                      <ShieldCheck size={14} />
                      <span>
                        Compatibilidade não é calculada e o MatchAnimal não aprova reprodução. Consultem um médico-veterinário e confirmem saúde e bem-estar.
                      </span>
                    </div>
                  )}

                  <Link
                    className="full-profile-link"
                    href={`/pet/perfil?petId=${encodeURIComponent(profile.id)}`}
                  >
                    Ver perfil completo <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            </>
          ) : (
            <div className="explore-empty">
              <PetFriends mood="friends" />
              <h2>
                {ownPets.length === 0
                  ? "Seu pet ainda não entrou na roda."
                  : hasLocation === false
                    ? "Defina sua região para encontrar pets por perto."
                    : "Nenhum perfil por aqui ainda."}
              </h2>
              <p>
                {ownPets.length === 0
                  ? "Cadastre um perfil para descobrir animais reais, próximos e com objetivos parecidos."
                  : hasLocation === false
                    ? "Usamos cidade e localização aproximada para ordenar os encontros. Seu endereço nunca aparece."
                    : "Amplie o raio ou ajuste os filtros para descobrir outros animais na região."}
              </p>
              {ownPets.length === 0 ? (
                <Button onClick={() => router.push("/animais/novo")}>Cadastrar meu pet</Button>
              ) : hasLocation === false ? (
                <Button onClick={() => router.push("/configuracoes")}>Definir minha região</Button>
              ) : (
                <button type="button" onClick={() => void loadMoreProfiles()}>
                  Buscar mais perfis
                </button>
              )}
            </div>
          )}

          {!loading && !error && profile && <SponsoredPlacement placement="EXPLORE_CARD" />}
        </section>

        <aside className="explore-aside">
          <div className="aside-title">
            <h2>Compatibilidade</h2>
            <button
              type="button"
              aria-label="Como calculamos"
              onClick={() => setCompatibilityOpen(true)}
            >
              <Info size={14} />
            </button>
          </div>

          <p className="aside-intro">Uma explicação clara do que pode contribuir para uma boa conexão.</p>

          <div className="factor-list">
            {[
              { name: "Espécie compatível", value: "25%", width: "25%" },
              { name: "Objetivos em comum", value: "20%", width: "20%" },
              { name: "Proximidade aproximada", value: "20%", width: "20%" },
              { name: "Porte e idade", value: "20%", width: "20%" },
              { name: "Comportamento e interesses", value: "15%", width: "15%" },
            ].map((factor) => (
              <div className="factor" key={factor.name}>
                <div>
                  <span>{factor.name}</span>
                  <small>{factor.value}</small>
                </div>
                <i>
                  <b style={{ width: factor.width }} />
                </i>
              </div>
            ))}
          </div>

          <div className="factor-caption">
            <Info size={13} />
            <span>
              Pesos explicáveis; a pontuação ajuda a explorar, não determina a qualidade ou segurança de um encontro.
            </span>
          </div>

          <div className="aside-divider" />

          <div className="match-aside-title">
            <div>
              <Heart size={16} />
              <h3>Seus matches</h3>
            </div>
            <span>{matches.length}</span>
          </div>
          <Link className="full-profile-link" href="/matches?tab=interesses">
            Ver interesses recebidos <ArrowRight size={14} />
          </Link>

          {matches.length ? (
            <div className="mini-match-list">
              {matches.map((match) => (
                <button
                  type="button"
                  className="mini-match"
                  key={match.id}
                  onClick={() => openProfile(match)}
                  aria-label={`Ver perfil de ${match.name}`}
                >
                  <div
                    className="mini-match-photo"
                    style={{
                      backgroundImage: `url(${match.photoUrl || `https://images.unsplash.com/${match.photo}?auto=format&fit=crop&w=100&q=80`})`,
                    }}
                  />
                  <div>
                    <strong>{match.name}</strong>
                    <small>Interesse mútuo</small>
                  </div>
                  <Check size={15} />
                </button>
              ))}
            </div>
          ) : (
            <div className="match-empty-state">
              <div>
                <Heart size={17} />
              </div>
              <p>Quando o interesse é mútuo, uma nova conexão começa aqui.</p>
            </div>
          )}

          <div className="safe-reminder">
            <ShieldCheck size={16} />
            <div>
              <strong>Combine com cuidado</strong>
              <p>Conversem antes, encontrem-se em local público e protejam os dados pessoais.</p>
            </div>
          </div>
        </aside>
      </div>

      {matchCelebration && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setMatchCelebration(null)}
        >
          <section
            ref={celebrationRef}
            className="match-celebration"
            role="dialog"
            aria-modal="true"
            aria-labelledby="match-celebration-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="dialog-close"
              onClick={() => setMatchCelebration(null)}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
            <div className="match-celebration-pets">
              <span
                style={
                  ownPets.find((pet) => pet.id === viewerPetId)?.coverPhotoUrl
                    ? {
                      backgroundImage: `url(${ownPets.find((pet) => pet.id === viewerPetId)?.coverPhotoUrl})`,
                    }
                    : undefined
                }
              >
                {ownPets.find((pet) => pet.id === viewerPetId)?.name?.slice(0, 1) ?? "🐾"}
              </span>
              <i>
                <Heart size={15} fill="currentColor" />
              </i>
              <span
                style={
                  matchCelebration.photoUrl
                    ? { backgroundImage: `url(${matchCelebration.photoUrl})` }
                    : undefined
                }
              >
                {matchCelebration.name.slice(0, 1)}
              </span>
            </div>
            <div className="dialog-eyebrow">UMA NOVA CONEXÃO</div>
            <h2 id="match-celebration-title">Deu Match!</h2>
            <p>Uma nova amizade está começando.</p>
            <div className="match-celebration-names">
              {ownPets.find((pet) => pet.id === viewerPetId)?.name ?? "Seu pet"}
              <Heart size={12} />
              {matchCelebration.name}
            </div>
            <Link
              href="/mensagens"
              className="match-celebration-primary"
              onClick={() => setMatchCelebration(null)}
            >
              Enviar uma mensagem <ArrowRight size={15} />
            </Link>
            <button
              type="button"
              className="match-celebration-secondary"
              onClick={() => {
                setMatchCelebration(null);
              }}
            >
              Continuar explorando
            </button>
          </section>
        </div>
      )}

      {modal && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setModal(null)}>
          <section
            ref={modalRef}
            className="product-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="dialog-close"
              onClick={() => setModal(null)}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
            {modal.intent === "ADOPTION" ? (
              applicationSent ? (
                <div className="application-success">
                  <span>
                    <Check size={22} />
                  </span>
                  <h2 id="dialog-title">Candidatura enviada.</h2>
                  <p>
                    O responsável pelo animal receberá sua candidatura para avaliação.
                  </p>
                  <button type="button" onClick={() => setModal(null)}>
                    Entendi
                  </button>
                </div>
              ) : (
                <>
                  <div className="dialog-eyebrow">CANDIDATURA DE ADOÇÃO</div>
                  <h2 id="dialog-title">Quer conhecer {modal.name}?</h2>
                  <p className="dialog-lead">
                    A adoção não depende de curtida mútua. Conte um pouco sobre o lar que você pode oferecer.
                  </p>
                  <form className="application-form" onSubmit={(event) => void apply(event)}>
                    <label>
                      Como é sua rotina?
                      <textarea
                        name="message"
                        required
                        minLength={20}
                        maxLength={1500}
                        placeholder="Conte sobre o tempo e o cuidado que você pode oferecer..."
                      />
                    </label>
                    <label>
                      Como é o espaço onde o pet vai viver?
                      <textarea
                        name="livingDetails"
                        required
                        maxLength={1000}
                        placeholder="Conte um pouco sobre o ambiente e quem mora com você..."
                      />
                    </label>
                    <label>
                      <input type="checkbox" required /> Entendo que a candidatura será avaliada pelo responsável pelo animal.
                    </label>
                    {applicationError && (
                      <div className="form-alert" role="alert">
                        {applicationError}
                      </div>
                    )}
                    <button type="submit">
                      Enviar candidatura <ArrowRight size={15} />
                    </button>
                  </form>
                </>
              )
            ) : (
              <>
                <div className="dialog-eyebrow">COMO LER A COMPATIBILIDADE</div>
                <h2 id="dialog-title">Uma pista, não uma promessa.</h2>
                <p className="dialog-lead">
                  Os fatores exibidos resumem semelhanças de perfil. Eles não garantem afinidade, saúde ou segurança.
                </p>
                <div className="dialog-factor">
                  <PawPrint size={16} />
                  <span>Espécie, porte e idade ajudam a contextualizar a rotina.</span>
                </div>
                <div className="dialog-factor">
                  <MapPin size={16} />
                  <span>Usamos região aproximada; o endereço residencial nunca é exibido.</span>
                </div>
                <div className="dialog-factor">
                  <ShieldCheck size={16} />
                  <span>
                    Para reprodução, pontuação nunca gera recomendação automática. É necessária verificação de saúde e avaliação humana.
                  </span>
                </div>
                <button
                  type="button"
                  className="dialog-understood"
                  onClick={() => setModal(null)}
                >
                  Entendi
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
