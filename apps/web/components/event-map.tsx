"use client";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
export default function EventMap({ latitude, longitude, title }: { latitude: number; longitude: number; title: string }) {
  return <div className="community-event-map"><MapContainer center={[latitude, longitude]} zoom={13} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Marker position={[latitude, longitude]}><Popup>{title}</Popup></Marker></MapContainer></div>;
}
