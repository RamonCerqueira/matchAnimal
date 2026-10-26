import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

type ResolvedLocation = { city: string; state: string; latitude: number | null; longitude: number | null };
type NominatimResult = { lat: string; lon: string; address?: Record<string, string> };
const stateCapitals: Record<string, { city: string; state: string; latitude: number; longitude: number }> = {
  "rio branco": { city: "Rio Branco", state: "AC", latitude: -9.97, longitude: -67.81 }, maceio: { city: "Maceió", state: "AL", latitude: -9.65, longitude: -35.74 }, macapa: { city: "Macapá", state: "AP", latitude: 0.03, longitude: -51.07 }, manaus: { city: "Manaus", state: "AM", latitude: -3.12, longitude: -60.02 }, salvador: { city: "Salvador", state: "BA", latitude: -12.97, longitude: -38.5 }, fortaleza: { city: "Fortaleza", state: "CE", latitude: -3.73, longitude: -38.53 }, brasilia: { city: "Brasília", state: "DF", latitude: -15.79, longitude: -47.88 }, vitoria: { city: "Vitória", state: "ES", latitude: -20.32, longitude: -40.34 }, goiania: { city: "Goiânia", state: "GO", latitude: -16.68, longitude: -49.25 }, "sao luis": { city: "São Luís", state: "MA", latitude: -2.53, longitude: -44.3 }, cuiaba: { city: "Cuiabá", state: "MT", latitude: -15.6, longitude: -56.1 }, "campo grande": { city: "Campo Grande", state: "MS", latitude: -20.47, longitude: -54.62 }, "belo horizonte": { city: "Belo Horizonte", state: "MG", latitude: -19.92, longitude: -43.94 }, belem: { city: "Belém", state: "PA", latitude: -1.46, longitude: -48.5 }, "joao pessoa": { city: "João Pessoa", state: "PB", latitude: -7.12, longitude: -34.86 }, curitiba: { city: "Curitiba", state: "PR", latitude: -25.43, longitude: -49.27 }, recife: { city: "Recife", state: "PE", latitude: -8.05, longitude: -34.88 }, teresina: { city: "Teresina", state: "PI", latitude: -5.09, longitude: -42.8 }, "rio de janeiro": { city: "Rio de Janeiro", state: "RJ", latitude: -22.91, longitude: -43.2 }, natal: { city: "Natal", state: "RN", latitude: -5.79, longitude: -35.21 }, "porto alegre": { city: "Porto Alegre", state: "RS", latitude: -30.03, longitude: -51.23 }, "porto velho": { city: "Porto Velho", state: "RO", latitude: -8.76, longitude: -63.9 }, boavista: { city: "Boa Vista", state: "RR", latitude: 2.82, longitude: -60.67 }, "florianopolis": { city: "Florianópolis", state: "SC", latitude: -27.59, longitude: -48.55 }, "sao paulo": { city: "São Paulo", state: "SP", latitude: -23.55, longitude: -46.63 }, aracaju: { city: "Aracaju", state: "SE", latitude: -10.91, longitude: -37.07 }, palmas: { city: "Palmas", state: "TO", latitude: -10.18, longitude: -48.33 },
};
const brazilianStateCodes: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
  "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso": "MT",
  "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR",
  pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS",
  rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly cache = new Map<string, ResolvedLocation>();
  private lastRequestAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();
  private readonly baseUrl = (process.env.GEOCODER_BASE_URL ?? "https://nominatim.openstreetmap.org").replace(/\/$/, "");

  async search(query: string): Promise<ResolvedLocation> {
    const normalized = query.trim().replace(/\s+/g, " ").slice(0, 120);
    if (normalized.length < 3) throw new BadRequestException("Digite uma cidade ou endereço com pelo menos 3 caracteres.");
    const key = `q:${normalized.toLocaleLowerCase("pt-BR")}`;
    const cached = this.cache.get(key); if (cached) return cached;
    const plainQuery = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
    const capital = stateCapitals[plainQuery] ?? Object.values(stateCapitals).find((item) => `${item.city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")}, ${item.state.toLowerCase()}` === plainQuery);
    if (capital) { this.cache.set(key, capital); return capital; }
    const params = new URLSearchParams({ format: "jsonv2", countrycodes: "br", addressdetails: "1", limit: "1", q: normalized });
    let results: NominatimResult[];
    try { results = await this.request<NominatimResult[]>(`/search?${params}`); }
    catch (cause) {
      const commaParts = normalized.split(",");
      const fallback = commaParts.length > 1 ? [commaParts.slice(0, -1).join(",").trim(), commaParts.at(-1)!.trim()] : normalized.match(/^(.+)\s+([A-Za-z]{2})$/)?.slice(1);
      if (cause instanceof ServiceUnavailableException && fallback) {
        const city = fallback[0].trim();
        const rawState = fallback[1].trim();
        const state = /^[A-Za-z]{2}$/.test(rawState) ? rawState.toUpperCase() : brazilianStateCodes[rawState.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")];
        if (city.length >= 2 && state && Object.values(brazilianStateCodes).includes(state)) {
          const region = { city, state, latitude: null, longitude: null };
          this.cache.set(key, region);
          return region;
        }
      }
      throw cause;
    }
    const [result] = results;
    if (!result) throw new BadRequestException("Não encontramos esse endereço. Tente cidade e UF, por exemplo: Salvador, BA.");
    return this.fromResult(result, key);
  }

  async reverse(latitude: number, longitude: number): Promise<ResolvedLocation> {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new BadRequestException("Coordenadas inválidas.");
    const lat = this.round(latitude); const lon = this.round(longitude); const key = `p:${lat}:${lon}`;
    const cached = this.cache.get(key); if (cached) return cached;
    const params = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lon), zoom: "10", addressdetails: "1" });
    return this.fromResult(await this.request<NominatimResult>(`/reverse?${params}`), key);
  }

  private async request<T>(path: string): Promise<T> {
    let release!: () => void;
    const previous = this.requestQueue;
    this.requestQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const delay = Math.max(0, 1100 - (Date.now() - this.lastRequestAt));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      this.lastRequestAt = Date.now();
      const contact = process.env.GEOCODER_CONTACT_EMAIL;
      const response = await fetch(`${this.baseUrl}${path}`, { headers: { Accept: "application/json", "User-Agent": `MatchAnimal/0.1${contact ? ` (+mailto:${contact})` : ""}` }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as T;
    } catch (cause) {
      this.logger.warn(`Falha ao consultar o geocodificador (${this.baseUrl}${path.split("?")[0]}): ${cause instanceof Error ? `${cause.message}${cause.cause ? ` — ${String(cause.cause)}` : ""}` : String(cause)}`);
      throw new ServiceUnavailableException("A busca de localização está temporariamente indisponível.");
    }
    finally { release(); }
  }

  private fromResult(result: NominatimResult, key: string): ResolvedLocation {
    const address = result.address ?? {};
    const city = address.city ?? address.town ?? address.municipality ?? address.village ?? address.county ?? address.city_district;
    const rawState = (address["ISO3166-2-lvl4"] ?? address.state_code ?? "").split("-").at(-1) ?? "";
    const state = /^[A-Z]{2}$/i.test(rawState) ? rawState.toUpperCase() : brazilianStateCodes[(address.state ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim()];
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (!city || !state || !Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new BadRequestException("Escolha uma cidade brasileira e informe a UF. Exemplo: Salvador, BA.");
    const location = { city, state, latitude: this.round(latitude), longitude: this.round(longitude) };
    this.cache.set(key, location);
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return location;
  }

  private round(value: number) { return Math.round(value * 100) / 100; }
}
