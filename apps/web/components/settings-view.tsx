"use client";

import { apiBaseUrl } from "@/lib/api-config";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  Compass,
  Download,
  Eye,
  KeyRound,
  LoaderCircle,
  Lock,
  MessageSquare,
  Radio,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  User,
  UserX,
} from "lucide-react";
import { LocationPicker, type LocationSelection } from "@/components/location-picker";

type Account = {
  id: string;
  email: string;
  isAdministrator?: boolean;
  isModerator?: boolean;
  adminRole?: string | null;
  privacyConsentAt?: string | null;
  termsAcceptedAt?: string | null;
  tutor: {
    displayName: string;
    city: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
    isPublic: boolean;
    notificationOptIn: boolean;
    profilePhotoUrl: string | null;
    bio: string | null;
    phone: string | null;
    matchRadiusKm: number;
    preferredSpecies: string;
    notifyMessages: boolean;
    notifyMatches: boolean;
    notifyCommunity: boolean;
    notifyEvents: boolean;
  };
};

type BlockedUser = {
  id: string;
  displayName: string;
  city: string | null;
  state: string | null;
  profilePhotoUrl: string | null;
  blockedAt: string;
};

type SettingsTab = "profile" | "discovery" | "notifications" | "security" | "privacy";

const api = apiBaseUrl;

export function SettingsView() {
  const [account, setAccount] = useState<Account | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [location, setLocation] = useState<LocationSelection | null>(null);

  // Form states
  const [displayName, setDisplayName] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [matchRadiusKm, setMatchRadiusKm] = useState(50);
  const [preferredSpecies, setPreferredSpecies] = useState("ALL");
  const [isPublic, setIsPublic] = useState(true);
  const [notificationOptIn, setNotificationOptIn] = useState(true);
  const [notifyMessages, setNotifyMessages] = useState(true);
  const [notifyMatches, setNotifyMatches] = useState(true);
  const [notifyCommunity, setNotifyCommunity] = useState(true);
  const [notifyEvents, setNotifyEvents] = useState(true);

  // Security password change states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Privacy & Blocked users
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [exportingData, setExportingData] = useState(false);

  // General feedback
  const [busy, setBusy] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    return fetch(`${api}/api/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar sua conta. Tente novamente.");
        const result = (await response.json()) as Account;
        setAccount(result);
        if (result.tutor) {
          setDisplayName(result.tutor.displayName ?? "");
          setProfilePhotoUrl(result.tutor.profilePhotoUrl ?? null);
          setBio(result.tutor.bio ?? "");
          setPhone(result.tutor.phone ?? "");
          setMatchRadiusKm(result.tutor.matchRadiusKm ?? 50);
          setPreferredSpecies(result.tutor.preferredSpecies ?? "ALL");
          setIsPublic(result.tutor.isPublic ?? true);
          setNotificationOptIn(result.tutor.notificationOptIn ?? true);
          setNotifyMessages(result.tutor.notifyMessages ?? true);
          setNotifyMatches(result.tutor.notifyMatches ?? true);
          setNotifyCommunity(result.tutor.notifyCommunity ?? true);
          setNotifyEvents(result.tutor.notifyEvents ?? true);
        }
        setError("");
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Load blocked users when opening privacy tab
  const loadBlockedUsers = useCallback(() => {
    setLoadingBlocks(true);
    fetch(`${api}/api/safety/blocks`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return [];
        return (await res.json()) as BlockedUser[];
      })
      .then((data) => setBlockedUsers(data))
      .catch(() => setBlockedUsers([]))
      .finally(() => setLoadingBlocks(false));
  }, []);

  useEffect(() => {
    if (activeTab === "privacy") {
      loadBlockedUsers();
    }
  }, [activeTab, loadBlockedUsers]);

  // Avatar photo upload handler
  async function handleAvatarUpload(file: File) {
    if (!file) return;
    setUploadingPhoto(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("files", file);

      const res = await fetch(`${api}/api/community/media`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message ?? "Falha ao enviar foto. Tente uma imagem JPG ou PNG menor que 8MB.");
      }

      const uploadedFiles = (await res.json()) as Array<{ url: string }>;
      if (uploadedFiles?.[0]?.url) {
        setProfilePhotoUrl(uploadedFiles[0].url);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Save settings
  async function saveAllSettings(event?: FormEvent) {
    if (event) event.preventDefault();
    if (!account || busy) return;
    setBusy(true);
    setSaved(false);
    setError("");

    const payload = {
      displayName: displayName.trim(),
      profilePhotoUrl: profilePhotoUrl ? profilePhotoUrl.trim() : null,
      bio: bio.trim() || null,
      phone: phone.trim() || null,
      city: location?.city ?? account.tutor.city,
      state: location?.state ?? account.tutor.state,
      ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}),
      matchRadiusKm,
      preferredSpecies,
      publicProfile: isPublic,
      notificationsEnabled: notificationOptIn,
      notifyMessages,
      notifyMatches,
      notifyCommunity,
      notifyEvents,
    };

    try {
      const response = await fetch(`${api}/api/auth/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          Array.isArray(result.message) ? result.message.join(" ") : result.message ?? "Não foi possível salvar as configurações."
        );
      }

      setAccount({ ...account, tutor: { ...account.tutor, ...result } });
      window.dispatchEvent(
        new CustomEvent("matchanimal:profile-updated", {
          detail: {
            displayName: payload.displayName,
            city: payload.city,
            state: payload.state,
            profilePhotoUrl: payload.profilePhotoUrl,
          },
        })
      );
      setLocation(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Change password handler
  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (passwordBusy) return;
    setPasswordMessage(null);

    if (newPassword.length < 8) {
      setPasswordMessage({ type: "error", text: "A nova senha deve ter no mínimo 8 caracteres." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "A nova senha e a confirmação não coincidem." });
      return;
    }

    setPasswordBusy(true);
    try {
      const res = await fetch(`${api}/api/auth/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          Array.isArray(data?.message) ? data.message.join(" ") : data?.message ?? "Falha ao alterar senha."
        );
      }

      setPasswordMessage({ type: "success", text: "Sua senha foi alterada com sucesso!" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMessage({ type: "error", text: (err as Error).message });
    } finally {
      setPasswordBusy(false);
    }
  }

  // Unblock user handler
  async function handleUnblock(userId: string) {
    try {
      const res = await fetch(`${api}/api/safety/users/${userId}/block`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
      }
    } catch {
      // silently ignore or reload
    }
  }

  // LGPD Data Export
  async function handleExportData() {
    setExportingData(true);
    try {
      const res = await fetch(`${api}/api/auth/export-data`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Não foi possível gerar a exportação no momento.");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `matchanimal-dados-${account?.tutor.displayName?.replace(/\s+/g, "_").toLowerCase() ?? "usuario"}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExportingData(false);
    }
  }

  if (loading) {
    return (
      <div className="profile-loading" role="status">
        <span className="session-spinner" /> Carregando suas preferências…
      </div>
    );
  }

  if (!account) {
    return (
      <div className="ma-flow-error" role="alert">
        <ShieldCheck size={28} />
        <h1>Suas configurações não carregaram</h1>
        <p>{error}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const monogram = (displayName || account.email || "M").charAt(0).toUpperCase();

  return (
    <div className="settings-elevated-view">
      {/* Header Banner */}
      <header className="settings-header-banner">
        <div className="product-eyebrow">
          <span>
            <ShieldCheck size={13} />
          </span>{" "}
          CONFIGURAÇÕES E PREFERÊNCIAS
        </div>
        <h1 className="product-h1">
          Suas escolhas, <em>no seu controle.</em>
        </h1>
        <p className="product-lead">
          Personalize sua experiência no MatchAnimal, ajuste seus critérios de encontros e controle sua privacidade.
        </p>

        {(account.isAdministrator ?? account.isModerator) && (
          <div className="account-access-summary" style={{ marginTop: 14 }}>
            <ShieldCheck size={20} />
            <strong>Acesso Administrativo ({account.adminRole ?? "Painel"})</strong>
            <Link href="/administracao">Abrir painel administrativo</Link>
          </div>
        )}
      </header>

      {/* Modern Navigation Tabs */}
      <nav className="settings-tabs-nav" aria-label="Abas de configurações">
        <button
          type="button"
          className={`settings-tab-btn ${activeTab === "profile" ? "is-active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          <span className="settings-tab-icon">
            <User size={16} />
          </span>
          Meu Perfil
        </button>

        <button
          type="button"
          className={`settings-tab-btn ${activeTab === "discovery" ? "is-active" : ""}`}
          onClick={() => setActiveTab("discovery")}
        >
          <span className="settings-tab-icon">
            <Compass size={16} />
          </span>
          Match & Descoberta
        </button>

        <button
          type="button"
          className={`settings-tab-btn ${activeTab === "notifications" ? "is-active" : ""}`}
          onClick={() => setActiveTab("notifications")}
        >
          <span className="settings-tab-icon">
            <Bell size={16} />
          </span>
          Notificações
        </button>

        <button
          type="button"
          className={`settings-tab-btn ${activeTab === "security" ? "is-active" : ""}`}
          onClick={() => setActiveTab("security")}
        >
          <span className="settings-tab-icon">
            <Lock size={16} />
          </span>
          Segurança & Senha
        </button>

        <button
          type="button"
          className={`settings-tab-btn ${activeTab === "privacy" ? "is-active" : ""}`}
          onClick={() => setActiveTab("privacy")}
        >
          <span className="settings-tab-icon">
            <Shield size={16} />
          </span>
          Privacidade & LGPD
        </button>
      </nav>

      {/* TAB 1: MEU PERFIL */}
      {activeTab === "profile" && (
        <section className="settings-panel">
          <div className="settings-section-card">
            <h2>
              <User size={20} /> Perfil do Tutor
            </h2>
            <p className="section-subtext">
              Essas informações aparecem quando outros tutores visitam sua página na comunidade ou interagem com seus animais.
            </p>

            {/* Avatar upload */}
            <div className="settings-avatar-row">
              <div className="settings-avatar-preview">
                {profilePhotoUrl ? (
                  <img src={profilePhotoUrl} alt={`Foto de ${displayName || "perfil"}`} />
                ) : (
                  <span>{monogram}</span>
                )}
              </div>

              <div className="settings-avatar-actions">
                <strong>Foto de Perfil</strong>
                <p className="settings-field-hint">
                  Mostre quem cuida com tanto carinho dos pets. Formatos aceitos: JPG, PNG ou WebP.
                </p>
                <div className="settings-avatar-btns">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleAvatarUpload(file);
                    }}
                  />
                  <button
                    type="button"
                    className="settings-avatar-upload-btn"
                    disabled={uploadingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingPhoto ? <LoaderCircle className="settings-spin" size={15} /> : <Upload size={15} />}
                    {uploadingPhoto ? "Enviando..." : "Alterar foto"}
                  </button>
                  {profilePhotoUrl && (
                    <button
                      type="button"
                      className="settings-avatar-remove-btn"
                      onClick={() => setProfilePhotoUrl(null)}
                    >
                      <Trash2 size={15} /> Remover foto
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="settings-field">
              <label htmlFor="displayName">
                Nome para exibição <small>visível na comunidade</small>
              </label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                minLength={2}
                maxLength={80}
                placeholder="Ex.: Mariana Silva"
                required
              />
            </div>

            <div className="settings-field">
              <label htmlFor="userBio">
                Sobre você (Bio) <small>{bio.length}/500</small>
              </label>
              <textarea
                id="userBio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                placeholder="Conte sobre sua rotina com pets, parques que frequenta, raças com as quais convive ou histórias marcantes..."
              />
              <p className="settings-field-hint">
                Uma breve apresentação ajuda a criar conexões mais sinceras com outros amantes de animais.
              </p>
            </div>

            <div className="settings-field">
              <label htmlFor="userPhone">
                WhatsApp ou Telefone para contato <small>privacidade garantida</small>
              </label>
              <input
                id="userPhone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={30}
                placeholder="Ex.: (11) 98765-4321"
              />
              <p className="settings-field-hint">
                Seu número só poderá ser visualizado por tutores que tiverem match mútuo com você para combinar passeios ou adoções.
              </p>
            </div>

            <div className="settings-field">
              <label htmlFor="userEmail">
                E-mail principal da conta <small>identificador seguro</small>
              </label>
              <input id="userEmail" value={account.email} readOnly disabled />
            </div>

            <div className="settings-location">
              <h3>Região aproximada do tutor</h3>
              <p>
                Sua cidade e estado são fundamentais para encontrar tutores e pets próximos. Seu endereço exato nunca é divulgado.
              </p>
              <LocationPicker
                initial={{
                  city: account.tutor.city ?? undefined,
                  state: account.tutor.state ?? undefined,
                  latitude: account.tutor.latitude ?? undefined,
                  longitude: account.tutor.longitude ?? undefined,
                }}
                onSelect={setLocation}
              />
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: MATCH & DESCOBERTA */}
      {activeTab === "discovery" && (
        <section className="settings-panel">
          <div className="settings-section-card">
            <h2>
              <Compass size={20} /> Preferências do Radar de Match
            </h2>
            <p className="section-subtext">
              Defina como o algoritmo de busca e exploração sugere novos perfis de pets para você interagir.
            </p>

            {/* Raio slider */}
            <div className="settings-range-box">
              <div className="settings-range-header">
                <strong>Raio máximo de distância para encontros</strong>
                <span className="settings-range-value">{matchRadiusKm} km</span>
              </div>
              <input
                type="range"
                className="settings-range-slider"
                min={5}
                max={200}
                step={5}
                value={matchRadiusKm}
                onChange={(e) => setMatchRadiusKm(Number(e.target.value))}
              />
              <div className="settings-range-marks">
                <span>5 km (vizinhos)</span>
                <span>50 km (cidade)</span>
                <span>100 km</span>
                <span>200 km (região metropolitana)</span>
              </div>
              <p className="settings-field-hint">
                Mostraremos animais dentro deste raio a partir da sua região cadastrada no perfil.
              </p>
            </div>

            {/* Espécies de preferência */}
            <div className="settings-field">
              <label>
                Espécies de maior interesse no radar <small>selecione seu foco</small>
              </label>
              <div className="settings-chips-group">
                {[
                  { id: "ALL", label: "🐾 Todos os pets" },
                  { id: "DOG", label: "🐶 Cães" },
                  { id: "CAT", label: "🐱 Gatos" },
                  { id: "OTHER", label: "🦜 Aves & Outros" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`settings-chip-btn ${preferredSpecies === item.id ? "is-selected" : ""}`}
                    onClick={() => setPreferredSpecies(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="settings-field-hint">
                Você ainda poderá alternar filtros na tela Explorar sempre que desejar ver novas espécies.
              </p>
            </div>

            <div className="settings-export-box" style={{ background: "#f0f7f4", borderColor: "#cde3d6" }}>
              <div className="settings-export-info">
                <strong>Sintonia e Afinidade no MatchAnimal</strong>
                <p>
                  Nossos algoritmos levam em consideração porte, temperamento com outros animais, nível de energia e vacinação em dia para indicar os melhores parceiros de passeio e amizade.
                </p>
              </div>
              <Sparkles size={24} style={{ color: "var(--ma-teal)" }} />
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: NOTIFICAÇÕES */}
      {activeTab === "notifications" && (
        <section className="settings-panel">
          <div className="settings-section-card">
            <h2>
              <Bell size={20} /> Central de Avisos e Alertas
            </h2>
            <p className="section-subtext">
              Escolha quais notificações você deseja receber para acompanhar o que acontece com seus pets.
            </p>

            {/* Master toggle */}
            <div className="settings-switch-card" style={{ background: "#f5f9f5", border: "1.5px solid #bddcc9" }}>
              <div className="settings-switch-info">
                <strong>Notificações no MatchAnimal (Master)</strong>
                <small>Permitir que a plataforma envie avisos sonoros e visuais em tempo real.</small>
              </div>
              <label className="settings-switch-input">
                <input
                  type="checkbox"
                  checked={notificationOptIn}
                  onChange={(e) => setNotificationOptIn(e.target.checked)}
                />
                <span className="settings-switch-slider" />
              </label>
            </div>

            {/* Granular toggles */}
            <div className="settings-switch-card">
              <div className="settings-switch-info">
                <strong>
                  <MessageSquare size={15} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                  Mensagens no Chat
                </strong>
                <small>Receba alertas imediatos quando outros tutores enviarem mensagens privadas para você.</small>
              </div>
              <label className="settings-switch-input">
                <input
                  type="checkbox"
                  disabled={!notificationOptIn}
                  checked={notificationOptIn && notifyMessages}
                  onChange={(e) => setNotifyMessages(e.target.checked)}
                />
                <span className="settings-switch-slider" />
              </label>
            </div>

            <div className="settings-switch-card">
              <div className="settings-switch-info">
                <strong>
                  <Radio size={15} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                  Novos Matches & Curtidas
                </strong>
                <small>Saiba na hora quando um pet curtir seu perfil de volta ou demonstrar interesse de afinidade.</small>
              </div>
              <label className="settings-switch-input">
                <input
                  type="checkbox"
                  disabled={!notificationOptIn}
                  checked={notificationOptIn && notifyMatches}
                  onChange={(e) => setNotifyMatches(e.target.checked)}
                />
                <span className="settings-switch-slider" />
              </label>
            </div>

            <div className="settings-switch-card">
              <div className="settings-switch-info">
                <strong>
                  <User size={15} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                  Atividades na Comunidade
                </strong>
                <small>Avisos sobre novos seguidores, comentários e curtidas nas suas publicações do feed social.</small>
              </div>
              <label className="settings-switch-input">
                <input
                  type="checkbox"
                  disabled={!notificationOptIn}
                  checked={notificationOptIn && notifyCommunity}
                  onChange={(e) => setNotifyCommunity(e.target.checked)}
                />
                <span className="settings-switch-slider" />
              </label>
            </div>

            <div className="settings-switch-card">
              <div className="settings-switch-info">
                <strong>
                  <Sparkles size={15} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                  Eventos Pet & Feiras Locais
                </strong>
                <small>Fique sabendo de feiras de adoção, encontros em parques e palestras de veterinários na sua cidade.</small>
              </div>
              <label className="settings-switch-input">
                <input
                  type="checkbox"
                  disabled={!notificationOptIn}
                  checked={notificationOptIn && notifyEvents}
                  onChange={(e) => setNotifyEvents(e.target.checked)}
                />
                <span className="settings-switch-slider" />
              </label>
            </div>
          </div>
        </section>
      )}

      {/* TAB 4: SEGURANÇA & SENHA */}
      {activeTab === "security" && (
        <section className="settings-panel">
          <form className="settings-section-card" onSubmit={(e) => void handleChangePassword(e)}>
            <h2>
              <KeyRound size={20} /> Alterar Senha de Acesso
            </h2>
            <p className="section-subtext">
              Recomendamos o uso de senhas fortes com números, letras e símbolos para manter sua conta e seus pets protegidos.
            </p>

            <div className="settings-field">
              <label htmlFor="currentPassword">Senha Atual</label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Digite sua senha atual"
                required
              />
            </div>

            <div className="settings-field">
              <label htmlFor="newPassword">
                Nova Senha <small>mínimo de 8 caracteres</small>
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha segura"
                minLength={8}
                required
              />
            </div>

            <div className="settings-field">
              <label htmlFor="confirmPassword">Confirmar Nova Senha</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                minLength={8}
                required
              />
            </div>

            {passwordMessage && (
              <p
                className={passwordMessage.type === "error" ? "settings-error" : "settings-saved"}
                role={passwordMessage.type === "error" ? "alert" : "status"}
              >
                {passwordMessage.type === "error" ? <ShieldAlert size={16} /> : <Check size={16} />}
                {passwordMessage.text}
              </p>
            )}

            <button
              type="submit"
              className="ma-button ma-button-primary"
              disabled={passwordBusy || !currentPassword || !newPassword}
              style={{ alignSelf: "flex-start", marginTop: 4 }}
            >
              {passwordBusy ? <LoaderCircle className="settings-spin" size={16} /> : <KeyRound size={16} />}
              Atualizar Senha
            </button>
          </form>

          <div className="settings-section-card">
            <h2>
              <ShieldCheck size={20} /> Integridade e Sessões Ativas
            </h2>
            <p className="section-subtext">
              Sua conta utiliza autenticação criptografada com tokens seguros HttpOnly (JWT com rotação de refresh). Ao alterar sua senha, outras sessões antigas são invalidadas automaticamente por precaução.
            </p>
          </div>
        </section>
      )}

      {/* TAB 5: PRIVACIDADE & LGPD */}
      {activeTab === "privacy" && (
        <section className="settings-panel">
          <div className="settings-section-card">
            <h2>
              <Eye size={20} /> Visibilidade do Tutor
            </h2>
            <p className="section-subtext">
              Decida como outros membros da comunidade podem encontrar ou interagir com você.
            </p>

            <div className="settings-switch-card">
              <div className="settings-switch-info">
                <strong>Perfil Público na Comunidade</strong>
                <small>
                  Seu nome, bio e foto ficam visíveis nas postagens e comentários públicos. Se desmarcado, apenas tutores conectados verão seus dados.
                </small>
              </div>
              <label className="settings-switch-input">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                <span className="settings-switch-slider" />
              </label>
            </div>

            <p className="settings-note">
              <ShieldCheck size={15} />
              Os perfis dos seus animais continuam com controles próprios de visibilidade na aba &ldquo;Meus Pets&rdquo;.
            </p>
          </div>

          {/* Blocked users */}
          <div className="settings-section-card">
            <h2>
              <UserX size={20} /> Usuários Bloqueados
            </h2>
            <p className="section-subtext">
              Pessoas que você bloqueou não conseguem ver suas publicações, enviar mensagens nem encontrar seus animais no radar.
            </p>

            {loadingBlocks ? (
              <div className="settings-empty-notice">
                <LoaderCircle className="settings-spin" size={16} /> Carregando lista de bloqueios...
              </div>
            ) : blockedUsers.length === 0 ? (
              <div className="settings-empty-notice">
                <ShieldCheck size={16} /> Você não possui nenhum usuário bloqueado.
              </div>
            ) : (
              <div className="settings-blocked-list">
                {blockedUsers.map((blocked) => (
                  <div key={blocked.id} className="settings-blocked-item">
                    <div className="settings-blocked-profile">
                      <div className="settings-blocked-avatar">
                        {blocked.profilePhotoUrl ? (
                          <img src={blocked.profilePhotoUrl} alt={blocked.displayName} />
                        ) : (
                          blocked.displayName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <strong>{blocked.displayName}</strong>
                        {blocked.city && (
                          <small style={{ display: "block", color: "var(--ma-muted)" }}>
                            {blocked.city}, {blocked.state}
                          </small>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="settings-unblock-btn"
                      onClick={() => void handleUnblock(blocked.id)}
                    >
                      Desbloquear
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* LGPD Data Portability */}
          <div className="settings-section-card">
            <h2>
              <Download size={20} /> Portabilidade e Seus Dados (LGPD)
            </h2>
            <p className="section-subtext">
              Em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018), você pode baixar um arquivo estruturado em JSON com todo o seu histórico no MatchAnimal.
            </p>

            <div className="settings-export-box">
              <div className="settings-export-info">
                <strong>Exportar Meus Dados Pessoais</strong>
                <p>
                  Inclui cadastro de tutor, animais registrados, termos aceitos, consentimentos e histórico público.
                </p>
              </div>
              <button
                type="button"
                className="settings-export-btn"
                disabled={exportingData}
                onClick={() => void handleExportData()}
              >
                {exportingData ? <LoaderCircle className="settings-spin" size={16} /> : <Download size={16} />}
                {exportingData ? "Gerando..." : "Baixar Dados (JSON)"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Global Bottom Sticky Action Bar (for tabs with general settings) */}
      {(activeTab === "profile" || activeTab === "discovery" || activeTab === "notifications" || activeTab === "privacy") && (
        <div className="settings-bottom-actions">
          <div className="settings-feedback-row">
            {error && (
              <span className="settings-feedback-row is-error">
                <ShieldAlert size={16} /> {error}
              </span>
            )}
            {saved && (
              <span className="settings-feedback-row is-success">
                <Check size={16} /> Suas configurações foram salvas com sucesso!
              </span>
            )}
            {!error && !saved && (
              <span style={{ color: "var(--ma-muted)", fontSize: 13 }}>
                Lembre-se de salvar suas alterações para aplicá-las ao seu perfil.
              </span>
            )}
          </div>

          <button
            type="button"
            className="ma-button ma-button-primary"
            disabled={busy}
            onClick={() => void saveAllSettings()}
            style={{ minWidth: 180 }}
          >
            {busy ? <LoaderCircle className="settings-spin" size={16} /> : <Save size={16} />}
            {busy ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      )}
    </div>
  );
}
