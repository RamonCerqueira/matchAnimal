"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function SelectRegion({ center, selected, disabled, onSelect }: { center: [number, number]; selected: boolean; disabled: boolean; onSelect: (point: [number, number]) => void }) {
  const map = useMap();
  const [latitude, longitude] = center;
  useEffect(() => { map.setView([latitude, longitude], selected ? 13 : 4, { animate: false }); }, [latitude, longitude, selected, map]);
  useMapEvents({ click(event) { if (!disabled) onSelect([event.latlng.lat, event.latlng.lng]); } });
  return null;
}

export default function LocationPickerMap({ center, selected, disabled, onSelect }: { center: [number, number]; selected: boolean; disabled: boolean; onSelect: (point: [number, number]) => void }) {
  return <div className="location-map" role="region" aria-label="Mapa para selecionar sua região aproximada" aria-busy={disabled}><MapContainer center={center} zoom={selected ? 13 : 4} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url={process.env.NEXT_PUBLIC_OSM_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />{selected && <CircleMarker center={center} radius={9} pathOptions={{ color: "#293f3b", fillColor: "#b65240", fillOpacity: .85 }} />}<SelectRegion center={center} selected={selected} disabled={disabled} onSelect={onSelect} /></MapContainer></div>;
}
