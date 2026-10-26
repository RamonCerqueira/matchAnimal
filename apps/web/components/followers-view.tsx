"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  Compass,
  Heart,
  LoaderCircle,
  MapPin,
  PawPrint,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { petFeedback } from "@/lib/native-feedback";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type FollowerItem = {
  id: string;
  createdAt: string;
  targetPet: {
    id: string;
    name: string;
    species: string;
    coverPhotoUrl: string | null;
  };
  follower: {
    id: string;
    displayName: string;
    profilePhotoUrl: string | null;
    city: string | null;
    state: string | null;
    pets: Array<{
      id: string;
      name: string;
      species: string;
      breed: string | null;
      coverPhotoUrl: string | null;
    }>;
  };
};

type MyPet = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  coverPhotoUrl: string | null;
};

type FollowingItem = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  coverPhotoUrl: string | null;
  createdAt: string;
};

type FollowRequestItem = {
  id: string;
  petId: string;
  requesterId: string;
  createdAt: string;
  pet: { name: string };
  requester: { tutor: { displayName: string } | null };
};

export function FollowersView() {
  const [tab, setTab] = useState<"followers" | "following" | "requests">("followers");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [selectedPetId, setSelectedPetId] = useState<string>("ALL");

  // Dados
  const [pets, setPets] = useState<MyPet[]>([]);
  const [followers, setFollowers] = useState<FollowerItem[]>([]);
  const [following, setFollowing] = useState<FollowingItem[]>([]);
  const [requests, setRequests] = useState<FollowRequestItem[]>([]);
  const [actionBusy, setActionBusy] = useState<string>("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [followersRes, followingRes, requestsRes] = await Promise.all([
        fetch(`${api}/api/community/my-followers`, { credentials: "include" }),
        fetch(`${api}/api/community/following`, { credentials: "include" }),
        fetch(`${api}/api/community/follow-requests`, { credentials: "include" }),
      ]);

      if (!followersRes.ok || !followingRes.ok) {
        throw new Error("Não foi possível carregar seus seguidores e conexões.");
      }

      const followersData = (await followersRes.json()) as {
        pets: MyPet[];
        followers: FollowerItem[];
        totalCount: number;
      };
      const followingData = (await followingRes.json()) as FollowingItem[];
      const requestsData = requestsRes.ok ? ((await requestsRes.json()) as FollowRequestItem[]) : [];

      setPets(followersData.pets || []);
      setFollowers(followersData.followers || []);
      setFollowing(followingData || []);
      setRequests(requestsData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Ações de Solicitações
  async function handleRequest(requestId: string, accept: boolean) {
    if (actionBusy) return;
    setActionBusy(requestId);
    setError("");
    try {
      const res = await fetch(`${api}/api/community/follow-requests/${requestId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      if (!res.ok) throw new Error("Não foi possível processar a solicitação.");
      setNotice(accept ? "Solicitação aceita!" : "Solicitação recusada.");
      void petFeedback("success");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar solicitação.");
    } finally {
      setActionBusy("");
    }
  }

  // Ação de Deixar de Seguir um Pet
  async function handleUnfollow(petId: string, petName: string) {
    if (actionBusy) return;
    setActionBusy(petId);
    try {
      const res = await fetch(`${api}/api/community/pets/${petId}/follow`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Não foi possível deixar de seguir.");
      setNotice(`Você deixou de seguir ${petName}.`);
      void petFeedback("tap");
      setFollowing((prev) => prev.filter((item) => item.id !== petId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar.");
    } finally {
      setActionBusy("");
    }
  }

  // Filtros
  const filteredFollowers = followers.filter((item) => {
    const matchPet = selectedPetId === "ALL" || item.targetPet.id === selectedPetId;
    const query = search.toLowerCase();
    const matchSearch =
      !search ||
      item.follower.displayName.toLowerCase().includes(query) ||
      (item.follower.city && item.follower.city.toLowerCase().includes(query)) ||
      item.targetPet.name.toLowerCase().includes(query);
    return matchPet && matchSearch;
  });

  const filteredFollowing = following.filter((item) => {
    const query = search.toLowerCase();
    return (
      !search ||
      item.name.toLowerCase().includes(query) ||
      (item.breed && item.breed.toLowerCase().includes(query))
    );
  });

  return (
    <div className="community-layout">
      {/* Barra lateral esquerda */}
      <aside className="community-rail community-left">
        <div className="community-rail-card">
          <span className="community-rail-eyebrow">SEU ESPAÇO SOCIAL</span>
          <Link className="community-rail-link" href="/comunidade">
            <Users size={16} /> Feed da comunidade
          </Link>
          <Link className="community-rail-link community-rail-active" href="/comunidade/seguidores">
            <UserCheck size={16} /> Meus seguidores
          </Link>
          <Link className="community-rail-link" href="/comunidade/explorar">
            <Compass size={16} /> Explorar
          </Link>
          <Link className="community-rail-link" href="/grupos">
            <PawPrint size={16} /> Grupos
          </Link>
          <Link className="community-rail-link" href="/eventos">
            <CalendarDays size={16} /> Eventos pet
          </Link>
        </div>

        <div className="community-care-note">
          <ShieldAlert size={17} />
          <strong>Conexões seguras</strong>
          <p>Você pode controlar quem vê os posts dos seus pets nas configurações.</p>
          <Link href="/configuracoes">Gerenciar privacidade</Link>
        </div>
      </aside>

      {/* Área Principal */}
      <div className="community-main">
        {/* Navegação Mobile */}
        <nav className="community-local-nav" aria-label="Espaços da comunidade">
          <Link href="/comunidade">
            <Users size={16} /> Feed
          </Link>
          <Link href="/comunidade/seguidores" className="active">
            <UserCheck size={16} /> Seguidores
          </Link>
          <Link href="/comunidade/explorar">
            <Compass size={16} /> Explorar
          </Link>
          <Link href="/grupos">
            <PawPrint size={16} /> Grupos
          </Link>
        </nav>

        {/* Cabeçalho */}
        <header className="community-heading">
          <div>
            <span className="community-kicker">SUA REDE DE AMIGOS PET</span>
            <h1>
              Seguidores <em>e conexões.</em>
            </h1>
            <p>Acompanhe quem segue seus animais e os amigos que você acompanha.</p>
          </div>
          <button
            className="community-compose-cta"
            onClick={() => void loadData()}
            disabled={loading}
            title="Atualizar lista"
          >
            <RefreshCw size={15} className={loading ? "community-spin" : ""} /> Atualizar
          </button>
        </header>

        {/* Abas Superiores */}
        <nav className="community-feed-tabs" aria-label="Abas de seguidores">
          <button
            className={tab === "followers" ? "community-tab-active" : ""}
            onClick={() => {
              setTab("followers");
              setSearch("");
            }}
          >
            <Users size={15} /> Seguidores ({followers.length})
          </button>
          <button
            className={tab === "following" ? "community-tab-active" : ""}
            onClick={() => {
              setTab("following");
              setSearch("");
            }}
          >
            <UserCheck size={15} /> Seguindo ({following.length})
          </button>
          {requests.length > 0 && (
            <button
              className={tab === "requests" ? "community-tab-active" : ""}
              onClick={() => {
                setTab("requests");
                setSearch("");
              }}
            >
              <UserPlus size={15} /> Solicitações ({requests.length})
            </button>
          )}
        </nav>

        {/* Filtros e Busca */}
        <div className="followers-toolbar">
          <div className="followers-search-box">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === "followers"
                  ? "Buscar por nome, cidade ou pet…"
                  : "Buscar pet por nome ou raça…"
              }
              aria-label="Buscar seguidores"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Limpar busca">
                <X size={14} />
              </button>
            )}
          </div>

          {tab === "followers" && pets.length > 1 && (
            <div className="followers-pet-filter">
              <label htmlFor="petFilter">Filtrar por pet:</label>
              <select
                id="petFilter"
                value={selectedPetId}
                onChange={(e) => setSelectedPetId(e.target.value)}
              >
                <option value="ALL">Todos os meus pets ({followers.length})</option>
                {pets.map((p) => {
                  const count = followers.filter((f) => f.targetPet.id === p.id).length;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>

        {/* Notificações e Alertas */}
        {notice && (
          <p className="ma-action-note" role="status">
            {notice}
          </p>
        )}
        {error && (
          <div className="community-alert" role="status">
            {error}
            <button onClick={() => setError("")} aria-label="Fechar aviso">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Conteúdo Carregando */}
        {loading ? (
          <div className="community-state">
            <LoaderCircle className="community-spin" /> Carregando seus amigos e seguidores…
          </div>
        ) : null}

        {/* 1. ABA DE SEGUIDORES */}
        {!loading && tab === "followers" && (
          <div className="followers-grid">
            {filteredFollowers.length ? (
              filteredFollowers.map((item) => (
                <article key={item.id} className="follower-card">
                  <div className="follower-card-header">
                    <span
                      className="follower-avatar"
                      style={
                        item.follower.profilePhotoUrl
                          ? { backgroundImage: `url(${item.follower.profilePhotoUrl})` }
                          : undefined
                      }
                    >
                      {!item.follower.profilePhotoUrl && (
                        <span>{item.follower.displayName.charAt(0).toUpperCase()}</span>
                      )}
                    </span>

                    <div className="follower-info">
                      <strong>{item.follower.displayName}</strong>
                      {item.follower.city && (
                        <small className="follower-location">
                          <MapPin size={11} />
                          {item.follower.city}
                          {item.follower.state ? `, ${item.follower.state}` : ""}
                        </small>
                      )}
                      <div className="follower-follows-badge">
                        <span>Segue:</span>
                        <span className="follower-pet-pill">
                          {item.targetPet.coverPhotoUrl ? (
                            <img
                              src={item.targetPet.coverPhotoUrl}
                              alt={item.targetPet.name}
                              className="follower-pet-mini-thumb"
                            />
                          ) : (
                            <PawPrint size={10} />
                          )}
                          {item.targetPet.name}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Pets do Seguidor (para conhecer e retribuir) */}
                  {item.follower.pets.length > 0 && (
                    <div className="follower-pets-section">
                      <span className="follower-pets-title">Pets deste tutor:</span>
                      <div className="follower-pets-list">
                        {item.follower.pets.map((p) => (
                          <Link
                            key={p.id}
                            href={`/pet/perfil?petId=${encodeURIComponent(p.id)}`}
                            className="follower-pet-chip"
                            title={`Ver perfil de ${p.name}`}
                          >
                            {p.coverPhotoUrl ? (
                              <img src={p.coverPhotoUrl} alt={p.name} />
                            ) : (
                              <PawPrint size={12} />
                            )}
                            <span>{p.name}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  <footer className="follower-card-footer">
                    <span className="follower-since">
                      Amigo desde{" "}
                      {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
                        new Date(item.createdAt)
                      )}
                    </span>
                  </footer>
                </article>
              ))
            ) : (
              <div className="community-empty pet-empty-state">
                <Users size={40} className="empty-icon" />
                <h2>
                  {search
                    ? "Nenhum seguidor encontrado nesta busca."
                    : "Seus animais ainda não têm seguidores."}
                </h2>
                <p>
                  Publique fotos e momentos na Comunidade para que outros tutores possam conhecer e
                  acompanhar seus pets!
                </p>
                <Link href="/comunidade" className="community-compose-cta" style={{ margin: "16px auto 0" }}>
                  <Plus size={15} /> Fazer uma publicação
                </Link>
              </div>
            )}
          </div>
        )}

        {/* 2. ABA DE QUEM EU SIGO */}
        {!loading && tab === "following" && (
          <div className="followers-grid">
            {filteredFollowing.length ? (
              filteredFollowing.map((pet) => (
                <article key={pet.id} className="follower-card">
                  <div className="follower-card-header">
                    <span
                      className="follower-avatar follower-pet-avatar"
                      style={
                        pet.coverPhotoUrl
                          ? { backgroundImage: `url(${pet.coverPhotoUrl})` }
                          : undefined
                      }
                    >
                      {!pet.coverPhotoUrl && <PawPrint size={18} />}
                    </span>

                    <div className="follower-info">
                      <strong>
                        <Link href={`/pet/perfil?petId=${encodeURIComponent(pet.id)}`}>
                          {pet.name}
                        </Link>
                      </strong>
                      <small className="follower-location">
                        {pet.species === "DOG" ? "Cão" : pet.species === "CAT" ? "Gato" : "Pet"}
                        {pet.breed ? ` · ${pet.breed}` : ""}
                      </small>
                    </div>

                    <button
                      className="follower-unfollow-btn"
                      onClick={() => void handleUnfollow(pet.id, pet.name)}
                      disabled={actionBusy === pet.id}
                      title="Deixar de seguir"
                    >
                      <UserMinus size={13} /> Deixar de seguir
                    </button>
                  </div>

                  <footer className="follower-card-footer">
                    <span className="follower-since">
                      Seguindo desde{" "}
                      {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
                        new Date(pet.createdAt)
                      )}
                    </span>
                    <Link
                      href={`/pet/perfil?petId=${encodeURIComponent(pet.id)}`}
                      className="follower-view-link"
                    >
                      Ver perfil →
                    </Link>
                  </footer>
                </article>
              ))
            ) : (
              <div className="community-empty pet-empty-state">
                <Heart size={40} className="empty-icon" />
                <h2>
                  {search
                    ? "Nenhum animal encontrado nesta busca."
                    : "Você ainda não segue nenhum pet."}
                </h2>
                <p>Descubra novos focinhos no Feed ou no Explorar para acompanhar histórias reais.</p>
                <Link href="/explorar" className="community-compose-cta" style={{ margin: "16px auto 0" }}>
                  <Compass size={15} /> Explorar pets
                </Link>
              </div>
            )}
          </div>
        )}

        {/* 3. ABA DE SOLICITAÇÕES */}
        {!loading && tab === "requests" && (
          <div className="followers-grid">
            {requests.length ? (
              requests.map((req) => (
                <article key={req.id} className="follower-card request-card">
                  <div className="follower-card-header">
                    <span className="follower-avatar">
                      <Users size={18} />
                    </span>

                    <div className="follower-info">
                      <strong>{req.requester.tutor?.displayName ?? "Tutor"}</strong>
                      <small>
                        Quer seguir o perfil privado de <strong>{req.pet.name}</strong>
                      </small>
                    </div>

                    <div className="request-actions">
                      <button
                        className="request-accept-btn"
                        onClick={() => void handleRequest(req.id, true)}
                        disabled={actionBusy === req.id}
                        title="Aceitar seguidor"
                      >
                        <Check size={14} /> Aceitar
                      </button>
                      <button
                        className="request-reject-btn"
                        onClick={() => void handleRequest(req.id, false)}
                        disabled={actionBusy === req.id}
                        title="Recusar"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="community-empty pet-empty-state">
                <Check size={40} className="empty-icon" />
                <h2>Nenhuma solicitação pendente</h2>
                <p>Todas as solicitações de acompanhamento foram respondidas.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra lateral direita */}
      <aside className="community-rail community-right">
        <div className="community-rail-card">
          <span className="community-rail-eyebrow">SEUS ANIMAIS</span>
          {pets.map((p) => {
            const petFollowersCount = followers.filter((f) => f.targetPet.id === p.id).length;
            return (
              <div key={p.id} className="sidebar-pet-summary">
                <span
                  className="sidebar-pet-avatar"
                  style={p.coverPhotoUrl ? { backgroundImage: `url(${p.coverPhotoUrl})` } : undefined}
                >
                  {!p.coverPhotoUrl && <PawPrint size={14} />}
                </span>
                <div>
                  <strong>{p.name}</strong>
                  <small>{petFollowersCount} seguidor{petFollowersCount === 1 ? "" : "es"}</small>
                </div>
              </div>
            );
          })}
        </div>

        <div className="community-rail-card community-trends">
          <span className="community-rail-eyebrow">DICA MATCHANIMAL</span>
          <h3>Como ter mais conexões?</h3>
          <p>
            Publique fotos dos passeios, participe de grupos de raças e compareça a eventos locais.
          </p>
          <Link href="/eventos">
            Ver eventos próximos <CalendarDays size={13} />
          </Link>
        </div>
      </aside>
    </div>
  );
}
