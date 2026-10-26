"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Activity,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  CreditCard,
  DollarSign,
  FileImage,
  FileText,
  Heart,
  MapPin,
  Megaphone,
  LifeBuoy,
  Settings2,
  PawPrint,
  RefreshCw,
  ShieldAlert,
  Store,
  Users,
} from "lucide-react";
import { AdminOperations } from "@/components/admin-operations";
import { useAppSession } from "@/components/app-shell";
import { ModerationPanel } from "@/components/moderation-panel";
import { AdminCommercialPartners } from "@/components/admin-commercial-partners";
import { AdminCommercialCampaigns } from "@/components/admin-commercial-campaigns";
import { AdminCommercialEvents } from "@/components/admin-commercial-events";
import { AdminCommercialMedia } from "@/components/admin-commercial-media";
import { AdminCommercialFinance } from "@/components/admin-commercial-finance";
import { AdminDocuments } from "@/components/admin-documents";
import {
  money,
  useAdminResource,
  type CommercialAsset,
} from "@/components/admin-commercial-core";

type Overview = {
  metrics: {
    users: number;
    newUsersLast30Days: number;
    activePets: number;
    publicPets: number;
    activeMatches: number;
    openReports: number;
    publicPosts: number;
    partners: number;
  };
  partners: Array<{
    id: string;
    type: string;
    isAdministrator: boolean;
    createdAt: string;
    displayName: string;
    city: string | null;
    state: string | null;
    pets: number;
  }>;
  recentAccounts: Array<{
    id: string;
    type: string;
    isAdministrator: boolean;
    createdAt: string;
    displayName: string;
    city: string | null;
    state: string | null;
    pets: number;
  }>;
  billing: { provider: "stripe"; configured: boolean; priceConfigured: boolean };
};

type CommercialOverview = {
  partners: { total: number; active: number };
  campaigns: { total: number; published: number; delivering: number };
  finance: {
    pendingCents: number;
    overdueCents: number;
    receivedCents: number;
    canceledCents: number;
    refundedCents: number;
  };
  events: { total: number; upcoming: number };
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const number = new Intl.NumberFormat("pt-BR");

export type AdminSection =
  | "overview"
  | "partners"
  | "campaigns"
  | "finance"
  | "events"
  | "media"
  | "accounts"
  | "moderation" | "team" | "operations" | "analytics" | "packages" | "settings" | "audit" | "documents";

export function AdminPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [section, setSection] = useState<AdminSection>("overview");
  const [seedAsset, setSeedAsset] = useState<CommercialAsset | null>(null);
  const appSession = useAppSession();
  const adminAreas: string[] = appSession?.adminAreas ?? [];

  // Carrega métricas comerciais do backend
  const commercialOverview = useAdminResource<CommercialOverview>("/api/commercial/admin/overview");

  const load = useCallback(
    () =>
      fetch(`${api}/api/safety/admin/overview`, { credentials: "include" })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.message ?? "Não foi possível carregar os indicadores.");
          setData(result as Overview);
          setError("");
        })
        .catch((cause: Error) => setError(cause.message))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const tabs = [
    { id: "overview", label: "Visão Geral", icon: ArrowUpRight },
    { id: "partners", label: "Parceiros", icon: Store },
    { id: "campaigns", label: "Propagandas", icon: Megaphone },
    { id: "finance", label: "Financeiro & PIX", icon: DollarSign },
    { id: "events", label: "Eventos Pet", icon: CalendarDays },
    { id: "media", label: "Mídias & Formatos", icon: FileImage },
    { id: "documents", label: "Documentos", icon: FileText },
    { id: "accounts", label: "Contas", icon: Users },
    { id: "moderation", label: "Moderação", icon: ShieldAlert },
    { id: "operations", label: "Atendimentos", icon: LifeBuoy },
    { id: "team", label: "Equipe", icon: Users },
    { id: "analytics", label: "Indicadores", icon: Activity },
    { id: "packages", label: "Pacotes", icon: BriefcaseBusiness },
    { id: "settings", label: "Regras", icon: Settings2 },
    { id: "audit", label: "Auditoria", icon: FileText },
  ] as const;
  const sectionArea: Record<AdminSection, string> = { overview: "ANALYTICS", partners: "COMMERCIAL", campaigns: "COMMERCIAL", finance: "FINANCE", events: "COMMERCIAL", media: "COMMERCIAL", documents: "COMMERCIAL", accounts: "ACCOUNTS", moderation: "MODERATION", operations: "SUPPORT", team: "TEAM", analytics: "ANALYTICS", packages: "COMMERCIAL", settings: "SETTINGS", audit: "ANALYTICS" };

  const handleCreateCampaignFromMedia = (asset: CommercialAsset) => {
    setSeedAsset(asset);
    setSection("campaigns");
  };

  const commData = commercialOverview.data;

  return (
    <section className="admin-panel">
      <header className="admin-heading">
        <div>
          <div className="product-eyebrow">
            <span>
              <PawPrint size={13} />
            </span>{" "}
            CENTRAL DE OPERAÇÕES & NEGÓCIOS
          </div>
          <h1 className="product-h1">
            MatchAnimal <em>Painel Admin.</em>
          </h1>
          <p className="product-lead">
            Gestão completa de parceiros, anúncios, eventos, pagamentos e segurança da comunidade.
          </p>
        </div>
        <button
          className="admin-refresh"
          onClick={() => {
            setLoading(true);
            void load();
            commercialOverview.reload();
          }}
          disabled={loading || commercialOverview.loading}
        >
          <RefreshCw size={14} /> Atualizar dados
        </button>
      </header>

      <div className="admin-layout">
      {/* Painel de minicards clicáveis (sem scroll) */}
      <nav className="admin-tabs admin-minicards" aria-label="Seções administrativas">
        {tabs.filter(({ id }) => adminAreas.includes(sectionArea[id])).map(({ id, label, icon: Icon }) => {
          const badge =
            id === "moderation" && data?.metrics.openReports
              ? String(data.metrics.openReports)
              : id === "campaigns" && commData?.campaigns.delivering
                ? String(commData.campaigns.delivering)
                : null;
          return (
            <button
              key={id}
              type="button"
              className={`admin-minicard ${section === id ? "admin-tab-active" : ""}`}
              onClick={() => setSection(id)}
              aria-current={section === id ? "page" : undefined}
              title={label}
            >
              <span className="admin-minicard-icon">
                <Icon size={22} aria-hidden="true" />
                {badge && <i className="admin-minicard-badge">{badge}</i>}
              </span>
              <span className="admin-minicard-label">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="admin-content">

      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}

      {loading && !data ? (
        <div className="profile-loading">
          <span className="session-spinner" /> Carregando dados administrativos…
        </div>
      ) : null}

      {/* 1. VISÃO GERAL */}
      {data && section === "overview" && (
        <>
          <div className="admin-kpis">
            <Metric
              icon={Users}
              label="Contas no app"
              value={data.metrics.users}
              note={`+${number.format(data.metrics.newUsersLast30Days)} nos últimos 30 dias`}
            />
            <Metric
              icon={PawPrint}
              label="Animais ativos"
              value={data.metrics.activePets}
              note={`${number.format(data.metrics.publicPets)} perfis públicos`}
            />
            <Metric
              icon={Store}
              label="Parceiros cadastrados"
              value={commData?.partners.total ?? data.metrics.partners}
              note={`${commData?.partners.active ?? data.metrics.partners} ativos na plataforma`}
            />
            <Metric
              icon={DollarSign}
              label="Total recebido"
              value={commData ? money(commData.finance.receivedCents) : "R$ 0,00"}
              note={commData ? `${money(commData.finance.pendingCents)} a receber` : "Faturamento"}
            />
          </div>

          <div className="admin-overview-grid">
            {/* Card de Anúncios e Campanhas */}
            <article className="admin-card">
              <div className="admin-card-title">
                <div>
                  <span className="admin-card-icon">
                    <Megaphone size={16} />
                  </span>
                  <h2>Propagandas de Parceiros</h2>
                </div>
                <button onClick={() => setSection("campaigns")}>
                  Gerenciar anúncios <ArrowUpRight size={13} />
                </button>
              </div>
              <p>
                Campanhas ativas sendo veiculadas na Página Inicial, Feed da Comunidade e Explorar.
              </p>
              <div className="ac-stat-row">
                <div>
                  <strong className="admin-big-number">
                    {commData?.campaigns.delivering ?? 0}
                  </strong>
                  <small>em veiculação agora</small>
                </div>
                <div>
                  <strong className="admin-big-number">
                    {commData?.campaigns.total ?? 0}
                  </strong>
                  <small>campanhas no total</small>
                </div>
              </div>
            </article>

            {/* Card Financeiro & Faturas */}
            <article className="admin-card">
              <div className="admin-card-title">
                <div>
                  <span className="admin-card-icon">
                    <CreditCard size={16} />
                  </span>
                  <h2>Financeiro & Faturas</h2>
                </div>
                <button onClick={() => setSection("finance")}>
                  Ver financeiro <ArrowUpRight size={13} />
                </button>
              </div>
              <p>Controle de faturamento, liquidação de PIX e checkout Stripe.</p>
              <div className="ac-stat-row">
                <div>
                  <strong className="admin-big-number ac-text-success">
                    {commData ? money(commData.finance.receivedCents) : "R$ 0,00"}
                  </strong>
                  <small>faturado e pago</small>
                </div>
                <div>
                  <strong className="admin-big-number ac-text-warning">
                    {commData ? money(commData.finance.pendingCents) : "R$ 0,00"}
                  </strong>
                  <small>faturas em aberto</small>
                </div>
              </div>
            </article>

            {/* Card de Eventos da Comunidade */}
            <article className="admin-card">
              <div className="admin-card-title">
                <div>
                  <span className="admin-card-icon">
                    <CalendarDays size={16} />
                  </span>
                  <h2>Agenda de Eventos</h2>
                </div>
                <button onClick={() => setSection("events")}>
                  Ver eventos <ArrowUpRight size={13} />
                </button>
              </div>
              <p>Feiras de adoção, passeios e encontros patrocinados por parceiros.</p>
              <div className="ac-stat-row">
                <div>
                  <strong className="admin-big-number">
                    {commData?.events.upcoming ?? 0}
                  </strong>
                  <small>próximos eventos</small>
                </div>
                <div>
                  <strong className="admin-big-number">
                    {commData?.events.total ?? 0}
                  </strong>
                  <small>encontros cadastrados</small>
                </div>
              </div>
            </article>

            {/* Card de Moderação e Segurança */}
            <article className="admin-card">
              <div className="admin-card-title">
                <div>
                  <span className="admin-card-icon">
                    <ShieldAlert size={16} />
                  </span>
                  <h2>Moderação & Denúncias</h2>
                </div>
                <button onClick={() => setSection("moderation")}>
                  Revisar denúncias <ArrowUpRight size={13} />
                </button>
              </div>
              <p>Relatos de conduta, perfis suspeitos e auditoria de segurança dos pets.</p>
              <strong className={`admin-big-number ${data.metrics.openReports > 0 ? "ac-text-danger" : ""}`}>
                {data.metrics.openReports}
              </strong>
              <small>{data.metrics.openReports > 0 ? "denúncias aguardando análise" : "tudo em dia"}</small>
            </article>
          </div>

          <div className="admin-quick-stats">
            <span>
              <BadgeCheck size={15} /> {number.format(data.metrics.publicPosts)} publicações públicas
            </span>
            <span>
              <Heart size={15} /> {number.format(data.metrics.activeMatches)} matches ativos
            </span>
            <span>
              <MapPin size={15} /> Rede de apoio e proteção animal ativa
            </span>
          </div>
        </>
      )}

      {/* 2. PARCEIROS COMERCIAIS */}
      {section === "partners" && <AdminCommercialPartners />}

      {/* 3. PROPAGANDAS & CAMPANHAS */}
      {section === "campaigns" && (
        <AdminCommercialCampaigns
          seedAsset={seedAsset}
          onClearSeed={() => setSeedAsset(null)}
          onGoMedia={() => setSection("media")}
          onGoPartners={() => setSection("partners")}
        />
      )}

      {/* 4. FINANCEIRO & FATURAS */}
      {section === "finance" && <AdminCommercialFinance />}

      {/* 5. EVENTOS PET */}
      {section === "events" && <AdminCommercialEvents />}

      {/* 6. MÍDIAS & FORMATOS */}
      {section === "media" && (
        <AdminCommercialMedia onCreateCampaign={handleCreateCampaignFromMedia} />
      )}
      {section === "documents" && <AdminDocuments canCommercial={adminAreas.includes("COMMERCIAL")} canFinance={adminAreas.includes("FINANCE")} />}

      {/* 7. CONTAS DE USUÁRIOS */}
      {section === "accounts" && <AdminOperations area="users" />}

      {/* 8. MODERAÇÃO */}
      {section === "moderation" && <ModerationPanel />}
      {section === "operations" && <AdminOperations area="cases" />}
      {section === "team" && <AdminOperations area="team" />}
      {section === "analytics" && <AdminOperations area="analytics" canExportFinance={adminAreas.includes("FINANCE")} />}
      {section === "packages" && <AdminOperations area="packages" canManageSettings={adminAreas.includes("SETTINGS")} />}
      {section === "settings" && <AdminOperations area="settings" />}
      {section === "audit" && <AdminOperations area="audit" />}
      </div>
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  note,
  alert = false,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  note: string;
  alert?: boolean;
}) {
  return (
    <article className={`admin-metric ${alert ? "admin-metric-alert" : ""}`}>
      <span className="admin-metric-icon">
        <Icon size={17} />
      </span>
      <span className="admin-metric-label">{label}</span>
      <strong>{typeof value === "number" ? number.format(value) : value}</strong>
      <small>{note}</small>
    </article>
  );
}
