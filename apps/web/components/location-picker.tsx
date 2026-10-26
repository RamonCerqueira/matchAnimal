"use client";

import dynamic from "next/dynamic";
import { useId, useState, type KeyboardEvent } from "react";
import { ChevronDown, LoaderCircle, LocateFixed, Map, MapPin, Search, ShieldCheck } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { petFeedback } from "@/lib/native-feedback";

export type LocationSelection = { city: string; state: string; latitude: number | null; longitude: number | null };
const LocationMap = dynamic(() => import("./location-picker-map"), { ssr: false, loading: () => <div className="location-map-loading" role="status"><LoaderCircle className="form-spinner" size={20} aria-hidden="true" /> Carregando mapa…</div> });
const privacyRound = (value: number) => Math.round(value * 100) / 100;
const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function parseLocation(value: unknown): LocationSelection {
  if (!value || typeof value !== "object") throw new Error("Não encontramos essa região. Tente o nome da cidade e a sigla do estado.");
  const point = value as Partial<LocationSelection>;
  if (typeof point.city !== "string" || typeof point.state !== "string" || (point.latitude !== null && (typeof point.latitude !== "number" || !Number.isFinite(point.latitude))) || (point.longitude !== null && (typeof point.longitude !== "number" || !Number.isFinite(point.longitude)))) throw new Error("Não encontramos essa região. Tente o nome da cidade e a sigla do estado.");
  return { city: point.city, state: point.state, latitude: typeof point.latitude === "number" ? privacyRound(point.latitude) : null, longitude: typeof point.longitude === "number" ? privacyRound(point.longitude) : null };
}

export function LocationPicker({ onSelect, initial }: { onSelect: (location: LocationSelection) => void; initial?: Partial<LocationSelection> }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<LocationSelection | null>(initial?.city && initial.state ? { city: initial.city, state: initial.state, latitude: typeof initial.latitude === "number" ? initial.latitude : null, longitude: typeof initial.longitude === "number" ? initial.longitude : null } : null);
  const [mapOpen, setMapOpen] = useState(false);
  const [busy, setBusy] = useState<"gps" | "search" | "map" | null>(null);
  const [error, setError] = useState("");
  const hasCoordinates = location?.latitude !== null && location?.latitude !== undefined && location?.longitude !== null && location?.longitude !== undefined;
  const center: [number, number] = hasCoordinates ? [location.latitude!, location.longitude!] : [-14.235, -51.925];

  function selectLocation(selected: LocationSelection) {
    setLocation(selected); onSelect(selected); setQuery(`${selected.city}, ${selected.state}`); setMapOpen(hasPoint(selected)); setError(""); void petFeedback("success");
  }

  function hasPoint(selected: LocationSelection) { return selected.latitude !== null && selected.longitude !== null; }

  async function reverse(latitude: number, longitude: number) {
    const lat = privacyRound(latitude); const lon = privacyRound(longitude);
    const response = await fetch(`${api}/api/location/reverse?lat=${lat}&lon=${lon}`);
    if (!response.ok) throw new Error("Não foi possível localizar essa região. Busque pelo nome da cidade.");
    selectLocation({ ...parseLocation(await response.json()), latitude: lat, longitude: lon });
  }

  function failure(cause: unknown, fallback: string) { setError(cause instanceof TypeError ? "Não conseguimos conectar à busca de localização. Você pode informar cidade e estado manualmente." : cause instanceof Error ? cause.message : fallback); }

  async function search() {
    if (query.trim().length < 3 || busy) return;
    setBusy("search"); setError("");
    try {
      const response = await fetch(`${api}/api/location/search?q=${encodeURIComponent(query.trim())}`);
      if (!response.ok) throw new Error(response.status === 404 ? "Local não encontrado. Tente o nome da cidade e a sigla do estado." : "A busca está indisponível no momento. Tente novamente ou preencha cidade e estado.");
      selectLocation(parseLocation(await response.json()));
    } catch (cause) { failure(cause, "Não foi possível buscar sua região."); }
    finally { setBusy(null); }
  }

  async function requestDeviceLocation() {
    if (busy) return;
    setBusy("gps"); setError("");
    try {
      let coords: { latitude: number; longitude: number };
      if (Capacitor.isNativePlatform()) {
        let permissions = await Geolocation.checkPermissions();
        if (permissions.location !== "granted" && permissions.coarseLocation !== "granted") permissions = await Geolocation.requestPermissions({ permissions: ["coarseLocation"] });
        if (permissions.location !== "granted" && permissions.coarseLocation !== "granted") throw new Error("Permita a localização nas configurações do aparelho ou busque sua cidade.");
        coords = (await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 })).coords;
      } else {
        if (!navigator.geolocation) throw new Error("Este navegador não disponibilizou a localização. Busque sua cidade.");
        coords = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(({ coords: point }) => resolve(point), (cause) => reject(new Error(cause.code === 1 ? "O acesso ao GPS não foi permitido. Você pode buscar sua cidade sem usar a localização do aparelho." : "Não conseguimos acessar o GPS. Tente novamente ou busque sua cidade.")), { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }));
      }
      await reverse(coords.latitude, coords.longitude);
    } catch (cause) { failure(cause, "Não conseguimos acessar o GPS. Busque sua cidade."); }
    finally { setBusy(null); }
  }

  async function selectPoint(latitude: number, longitude: number) {
    if (busy) return;
    setBusy("map"); setError("");
    try { await reverse(latitude, longitude); }
    catch (cause) { failure(cause, "Não foi possível selecionar essa região."); }
    finally { setBusy(null); }
  }

  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) { if (event.key === "Enter") { event.preventDefault(); void search(); } }
  return <div className="location-picker" aria-busy={!!busy}><div className="location-search"><label htmlFor={`${id}-query`}>Localizar sua região <span className="location-optional">opcional</span></label><div><MapPin size={18} aria-hidden="true" /><input id={`${id}-query`} value={query} onKeyDown={handleSearchKey} onChange={(event) => setQuery(event.target.value)} placeholder="Cidade ou endereço, ex.: Salvador, BA" maxLength={200} autoComplete="address-level2" aria-describedby={`${id}-privacy${error ? ` ${id}-error` : ""}`} disabled={!!busy} /><button type="button" onClick={() => void search()} disabled={!!busy || query.trim().length < 3} aria-label="Buscar região">{busy === "search" ? <LoaderCircle className="form-spinner" size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}</button></div></div><div className="location-actions"><button type="button" className="location-gps" onClick={() => void requestDeviceLocation()} disabled={!!busy}>{busy === "gps" ? <LoaderCircle className="form-spinner" size={18} aria-hidden="true" /> : <LocateFixed size={18} aria-hidden="true" />}{busy === "gps" ? "Localizando…" : "Usar minha localização"}</button><button type="button" className="location-map-toggle" onClick={() => setMapOpen((value) => !value)} aria-expanded={mapOpen} aria-controls={`${id}-map`}><Map size={18} aria-hidden="true" /> Mapa <ChevronDown size={16} aria-hidden="true" /></button></div>
    {mapOpen && <div id={`${id}-map`} className="location-map-section"><p className="location-map-hint">{location ? <>Sua região: <strong>{location.city}, {location.state}</strong>. Toque no mapa para ajustar.</> : "Busque sua cidade, use o GPS ou toque no mapa para escolher uma região."}</p><LocationMap center={center} selected={hasCoordinates} disabled={!!busy} onSelect={(point) => void selectPoint(point[0], point[1])} /></div>}
    {busy === "map" && <p className="location-status" role="status">Identificando a região selecionada…</p>}{location && <p className="location-selected" role="status"><MapPin size={17} aria-hidden="true" /> Região selecionada: <strong>{location.city}, {location.state}</strong>{!hasCoordinates && <small> · região aproximada, sem ponto no mapa</small>}</p>}{error && <p id={`${id}-error`} className="location-error" role="alert">{error}</p>}<p id={`${id}-privacy`} className="location-privacy"><ShieldCheck size={16} aria-hidden="true" /> Guardamos só a região aproximada. O ponto exato nunca aparece no perfil.</p>{mapOpen && <small className="location-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noreferrer">Política do geocodificador</a></small>}</div>;
}
