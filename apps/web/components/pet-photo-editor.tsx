"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, LoaderCircle, RotateCcw } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { cropPetPhoto } from "@/lib/pet-media";

export function PetPhotoEditor({ file, onApply, onClose }: { file: File; onApply: (file: File) => void; onClose: () => void }) {
  const id = useId();
  const previewRef = useRef<HTMLImageElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const [busy, setBusy] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const objectUrl = URL.createObjectURL(file); if (previewRef.current) previewRef.current.src = objectUrl; return () => URL.revokeObjectURL(objectUrl); }, [file]);
  const side = Math.min(dimensions.width, dimensions.height) / zoom;

  async function apply() {
    setBusy(true); setError("");
    try { onApply(await cropPetPhoto(file, { zoom, horizontal, vertical })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível ajustar a foto."); setBusy(false); }
  }

  return <Dialog open onClose={() => { if (!busy) onClose(); }} title="Ajustar foto" description="Enquadre seu pet com o zoom e ajuste a posição. O recorte só é aplicado ao confirmar." className="pet-crop-dialog">
    <div className="pet-crop-preview" aria-label="Prévia do recorte quadrado"><img ref={previewRef} alt="Prévia do enquadramento do pet" onLoad={(event) => { setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setImageReady(true); }} onError={() => { setImageReady(false); setError("Não foi possível abrir esta imagem."); }} style={{ width: `${dimensions.width / side * 100}%`, height: `${dimensions.height / side * 100}%`, left: `${-(dimensions.width - side) / side * horizontal}%`, top: `${-(dimensions.height - side) / side * vertical}%` }} /></div>
    <fieldset className="pet-crop-controls" disabled={busy}>
      <label htmlFor={`${id}-zoom`}>Zoom <output>{zoom.toFixed(1)}×</output><input id={`${id}-zoom`} type="range" min="1" max="3" step=".05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
      <label htmlFor={`${id}-horizontal`}>Posição horizontal<input id={`${id}-horizontal`} type="range" min="0" max="100" value={horizontal} onChange={(event) => setHorizontal(Number(event.target.value))} /></label>
      <label htmlFor={`${id}-vertical`}>Posição vertical<input id={`${id}-vertical`} type="range" min="0" max="100" value={vertical} onChange={(event) => setVertical(Number(event.target.value))} /></label>
      <button type="button" className="pet-crop-reset" onClick={() => { setZoom(1); setHorizontal(50); setVertical(50); setError(""); }}><RotateCcw size={17} aria-hidden="true" /> Recomeçar enquadramento</button>
    </fieldset>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="pet-crop-actions"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" disabled={busy || !imageReady} onClick={() => void apply()}>{busy ? <LoaderCircle className="form-spinner" size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />} {busy ? "Aplicando…" : "Aplicar recorte"}</button></div>
  </Dialog>;
}
