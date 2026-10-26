export type CompatibilityIntent = "FRIENDSHIP" | "RESPONSIBLE_BREEDING" | "ADOPTION";
export interface CompatibilityProfile {
  species: string;
  intent: CompatibilityIntent;
  size?: string | null;
  birthDate?: Date | null;
  searchCell?: string | null;
  temperament?: string[];
  preferences?: string[];
  healthChecklistComplete?: boolean;
  healthVerificationStatus?: string;
  veterinarianReviewAt?: Date | null;
  distanceKm?: number | null;
  radiusKm?: number;
}

export interface CompatibilityFactor { key: string; label: string; points: number; maxPoints: number; explanation: string }
export interface CompatibilityWeights {
  species: number;
  intent: number;
  size: number;
  age: number;
  location: number;
  temperament: number;
  preferences: number;
}
export const DEFAULT_MATCH_SCORE_WEIGHTS: CompatibilityWeights = {
  species: 25, intent: 20, size: 12, age: 8, location: 20, temperament: 8, preferences: 7,
};
export interface CompatibilityResult {
  score: number | null;
  factors: CompatibilityFactor[];
  flow: "MUTUAL_INTEREST" | "ADOPTION_APPLICATION" | "HUMAN_REVIEW_REQUIRED";
  reproductionReview: "NOT_APPLICABLE" | "INCOMPLETE" | "READY_FOR_HUMAN_REVIEW";
  recommendsBreeding: false;
}

const overlapPoints = (left: string[] = [], right: string[] = [], maximum: number) => {
  if (!left.length || !right.length) return Math.floor(maximum / 2);
  const a = new Set(left.map((item) => item.trim().toLocaleLowerCase("pt-BR")));
  const b = new Set(right.map((item) => item.trim().toLocaleLowerCase("pt-BR")));
  const common = [...a].filter((item) => b.has(item)).length;
  return Math.round((common / new Set([...a, ...b]).size) * maximum);
};

function ageBand(date?: Date | null) {
  if (!date) return null;
  const age = (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (age < 1) return "young";
  if (age < 8) return "adult";
  return "senior";
}

export function explainCompatibility(viewer: CompatibilityProfile, candidate: CompatibilityProfile, weights = DEFAULT_MATCH_SCORE_WEIGHTS): CompatibilityResult {
  const factors: CompatibilityFactor[] = [];
  const add = (key: string, label: string, points: number, maxPoints: number, explanation: string) => factors.push({ key, label, points, maxPoints, explanation });

  const sameSpecies = viewer.species === candidate.species;
  add("species", "Espécie", sameSpecies ? weights.species : 0, weights.species, sameSpecies ? "Mesma espécie." : "Espécies diferentes; a rotina pode não combinar.");
  const sameIntent = viewer.intent === candidate.intent;
  add("intent", "Objetivo", sameIntent ? weights.intent : Math.round(weights.intent * 0.2), weights.intent, sameIntent ? "Os tutores buscam o mesmo tipo de conexão." : "Os objetivos informados são diferentes.");
  const sameSize = viewer.size && candidate.size && viewer.size !== "UNKNOWN" && candidate.size !== "UNKNOWN";
  add("size", "Porte", !sameSize ? Math.round(weights.size * 0.5) : viewer.size === candidate.size ? weights.size : Math.round(weights.size * 0.5), weights.size, !sameSize ? "Porte ainda não informado pelos dois tutores." : viewer.size === candidate.size ? "Porte semelhante." : "Porte diferente; vale conversar sobre estilo de brincadeira.");
  const viewerAge = ageBand(viewer.birthDate);
  const candidateAge = ageBand(candidate.birthDate);
  add("age", "Idade", !viewerAge || !candidateAge ? Math.round(weights.age * 0.625) : viewerAge === candidateAge ? weights.age : Math.round(weights.age * 0.375), weights.age, !viewerAge || !candidateAge ? "Idade não informada nos dois perfis." : viewerAge === candidateAge ? "Faixa etária semelhante." : "Faixas etárias diferentes.");
  const sameCell = Boolean(viewer.searchCell && candidate.searchCell && viewer.searchCell === candidate.searchCell);
  const hasDistance = candidate.distanceKm !== undefined && candidate.distanceKm !== null;
  const radius = candidate.radiusKm ?? 50;
  const distanceRatio = hasDistance ? Math.max(0, 1 - candidate.distanceKm! / radius) : null;
  const locationPoints = distanceRatio !== null
    ? Math.round(weights.location * distanceRatio)
    : sameCell ? Math.round(weights.location * 0.5) : Math.round(weights.location * 0.25);
  const locationExplanation = hasDistance
    ? candidate.distanceKm! <= radius / 3 ? "Está na faixa mais próxima dentro do raio escolhido." : "Está dentro do raio de busca escolhido."
    : sameCell ? "Na mesma cidade; sem GPS, a distância exata não é calculada." : "A localização é aproximada e não revela endereço residencial.";
  add("location", "Proximidade", locationPoints, weights.location, locationExplanation);
  const temperament = overlapPoints(viewer.temperament, candidate.temperament, weights.temperament);
  add("temperament", "Comportamento", temperament, weights.temperament, temperament >= weights.temperament * 0.7 ? "Há traços de comportamento em comum." : "Os traços informados variam; apresentação gradual ajuda.");
  const preferences = overlapPoints(viewer.preferences, candidate.preferences, weights.preferences);
  add("preferences", "Preferências", preferences, weights.preferences, preferences >= weights.preferences * 0.7 ? "As preferências dos tutores se aproximam." : "As preferências ainda têm pouca informação em comum.");

  const maximum = factors.reduce((total, factor) => total + factor.maxPoints, 0);
  const score = maximum > 0 ? Math.round((factors.reduce((total, factor) => total + factor.points, 0) / maximum) * 100) : 0;
  const isBreeding = viewer.intent === "RESPONSIBLE_BREEDING" || candidate.intent === "RESPONSIBLE_BREEDING";
  const isAdoption = viewer.intent === "ADOPTION" || candidate.intent === "ADOPTION";
  const healthReady = [viewer, candidate].every((profile) => profile.healthChecklistComplete && profile.healthVerificationStatus === "VERIFIED" && profile.veterinarianReviewAt);
  return {
    score: isBreeding || isAdoption ? null : score,
    factors,
    flow: isBreeding ? "HUMAN_REVIEW_REQUIRED" : viewer.intent === "ADOPTION" || candidate.intent === "ADOPTION" ? "ADOPTION_APPLICATION" : "MUTUAL_INTEREST",
    reproductionReview: !isBreeding ? "NOT_APPLICABLE" : healthReady ? "READY_FOR_HUMAN_REVIEW" : "INCOMPLETE",
    recommendsBreeding: false,
  };
}
