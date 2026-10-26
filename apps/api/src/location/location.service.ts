import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

type ResolvedLocation = { city: string; state: string; latitude: number; longitude: number };
type NominatimResult = { lat: string; lon: string; address?: Record<string, string> };

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
    const params = new URLSearchParams({ format: "jsonv2", countrycodes: "br", addressdetails: "1", limit: "1", q: normalized });
    const [result] = await this.request<NominatimResult[]>(`/search?${params}`);
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
    const city = address.city ?? address.town ?? address.municipality ?? address.village ?? address.county;
    const state = (address["ISO3166-2-lvl4"] ?? "").split("-").at(-1) || address.state_code || "";
    if (!city || !/^[A-Z]{2}$/i.test(state)) throw new BadRequestException("Escolha uma cidade brasileira e informe a UF.");
    const location = { city, state: state.toUpperCase(), latitude: this.round(Number(result.lat)), longitude: this.round(Number(result.lon)) };
    this.cache.set(key, location);
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return location;
  }

  private round(value: number) { return Math.round(value * 100) / 100; }
}