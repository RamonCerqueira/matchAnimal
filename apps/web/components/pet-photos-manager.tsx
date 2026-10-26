"use client";

import { apiBaseUrl } from "@/lib/api-config";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Camera, Check, Crop, ImagePlus, LoaderCircle, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import { PetPhotoEditor } from "@/components/pet-photo-editor";
import { preparePetPhoto, uploadPetPhotos, type PetPhotoUpload } from "@/lib/pet-media";

type Photo = { id?: string; storageKey?: string; url: string; file?: File };
const api = apiBaseUrl;

export function PetPhotosManager({ petId, initialPhotos, onSaved }: { petId: string; initialPhotos: Photo[]; onSaved: () => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const replacement = useRef<HTMLInputElement>(null);
  const replaceIndex = useRef<number | null>(null);
  const photosRef = useRef(photos);
  const preparingRef = useRef(false);
  const busy = saving || preparing;

  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => photosRef.current.forEach((photo) => { if (photo.file) URL.revokeObjectURL(photo.url); }), []);

  async function addPhotos(files: FileList | null, target: number | null = null) {
    if (!files?.length || preparingRef.current || saving) return;
    setError(""); setNotice("");
    const selected = Array.from(files);
    if (target === null && photos.length + selected.length > 6) { setError(`Você pode adicionar mais ${6 - photos.length} foto(s). O limite é de 6 por perfil.`); return; }
    preparingRef.current = true; setPreparing(true);
    try {
      const prepared: File[] = [];
      for (const file of target === null ? selected : selected.slice(0, 1)) prepared.push(await preparePetPhoto(file));
      const additions = prepared.map((file) => ({ file, url: URL.createObjectURL(file) }));
      if (target === null) setPhotos((current) => [...current, ...additions]);
      else setPhotos((current) => current.map((photo, index) => { if (index !== target) return photo; if (photo.file) URL.revokeObjectURL(photo.url); return additions[0]; }));
      setDirty(true); setNotice("Foto preparada. Ajuste o recorte se quiser e salve a galeria.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível preparar as fotos."); }
    finally { preparingRef.current = false; setPreparing(false); }
  }

  async function save() {
    if (busy || !dirty) return;
    setSaving(true); setError(""); setNotice("");
    try {
      let updated = photos;
      const newFiles = photos.flatMap((photo) => photo.file && !photo.storageKey ? [photo.file] : []);
      if (newFiles.length) {
        setProgress(0);
        const uploaded: PetPhotoUpload[] = await uploadPetPhotos(newFiles, setProgress, api);
        let nextIndex = 0;
        updated = photos.map((photo) => {
          if (!photo.file || photo.storageKey) return photo;
          const result = uploaded[nextIndex++];
          URL.revokeObjectURL(photo.url);
          return { storageKey: result.key, url: result.url };
        });
        setPhotos(updated);
      }
      const response = await fetch(`${api}/api/pets/${encodeURIComponent(petId)}/photos`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mediaKeys: updated.map((photo) => photo.storageKey) }) });
      const result = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(" ") : result.message ?? "Não foi possível atualizar as fotos.");
      setDirty(false); setNotice("Galeria atualizada."); onSaved();
    } catch (failure) { setError(failure instanceof TypeError ? "Não conseguimos conectar ao serviço. Suas alterações foram mantidas; tente salvar novamente." : failure instanceof Error ? failure.message : "Não foi possível salvar a galeria."); }
    finally { setSaving(false); setProgress(null); }
  }

  function move(index: number, direction: -1 | 1) {
    if (busy) return;
    setPhotos((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const reordered = [...current]; [reordered[index], reordered[target]] = [reordered[target], reordered[index]]; return reordered; });
    setDirty(true); setNotice("");
  }

  function discard() {
    photos.forEach((photo) => { if (photo.file) URL.revokeObjectURL(photo.url); });
    setPhotos(initialPhotos); setDirty(false); setError(""); setNotice("Alterações descartadas.");
  }

  return <div className="pet-photo-manager"><button type="button" className="pet-photo-manager-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={`${id}-panel`}><ImagePlus size={18} aria-hidden="true" />{open ? "Fechar galeria" : `Gerenciar fotos (${initialPhotos.length})`}{dirty && <span className="pet-gallery-dirty">Não salvo</span>}</button>{open && <div id={`${id}-panel`} className="pet-photo-manager-panel" aria-busy={busy}><div className="pet-photo-manager-heading"><div><strong>Galeria de fotos</strong><small>A primeira imagem é a capa. As alterações são aplicadas ao salvar.</small></div></div>
      <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => { void addPhotos(event.currentTarget.files); event.currentTarget.value = ""; }} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { void addPhotos(event.currentTarget.files); event.currentTarget.value = ""; }} />
      <input ref={replacement} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { void addPhotos(event.currentTarget.files, replaceIndex.current); event.currentTarget.value = ""; }} />
      <div className="pet-photo-manager-add"><button type="button" onClick={() => picker.current?.click()} disabled={busy || photos.length >= 6}><ImagePlus size={18} aria-hidden="true" /> Escolher fotos</button><button type="button" onClick={() => camera.current?.click()} disabled={busy || photos.length >= 6}><Camera size={18} aria-hidden="true" /> Câmera</button></div>
      {photos.length ? <div className="pet-photo-manager-grid">{photos.map((photo, index) => <div className="pet-photo-manager-tile" key={photo.storageKey ?? photo.url}><img crossOrigin={photo.file ? undefined : "use-credentials"} src={photo.url} alt={`Foto ${index + 1} do perfil`} width={400} height={400} /><span>{index === 0 ? "Capa" : index + 1}</span><div><button type="button" aria-label={`Substituir foto ${index + 1}`} title="Substituir foto" disabled={busy} onClick={() => { replaceIndex.current = index; replacement.current?.click(); }}><RefreshCw size={18} aria-hidden="true" /></button>{photo.file && <button type="button" aria-label={`Ajustar recorte da foto ${index + 1}`} title="Ajustar foto" disabled={busy} onClick={() => setEditing(index)}><Crop size={18} aria-hidden="true" /></button>}<button type="button" aria-label={`Mover foto ${index + 1} para antes`} onClick={() => move(index, -1)} disabled={busy || index === 0}><ArrowUp size={18} aria-hidden="true" /></button><button type="button" aria-label={`Mover foto ${index + 1} para depois`} onClick={() => move(index, 1)} disabled={busy || index === photos.length - 1}><ArrowDown size={18} aria-hidden="true" /></button><button type="button" aria-label={`Remover foto ${index + 1}`} disabled={busy} onClick={() => { if (photo.file) URL.revokeObjectURL(photo.url); setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index)); setDirty(true); setNotice(""); }}><Trash2 size={18} aria-hidden="true" /></button></div></div>)}</div> : <p className="pet-photo-manager-empty">Nenhuma foto selecionada. Adicione fotos para apresentar seu pet.</p>}
      {preparing && <p className="pet-processing" role="status"><LoaderCircle className="form-spinner" size={18} aria-hidden="true" /> Otimizando fotos…</p>}{progress !== null && <div className="pet-upload-progress" role="status"><span>{progress === 100 ? "Fotos enviadas. Salvando a galeria…" : `Enviando fotos… ${progress}%`}</span><progress aria-label="Envio das fotos" value={progress} max={100} /></div>}{notice && <p className="pet-photo-manager-success" role="status"><Check size={18} aria-hidden="true" />{notice}</p>}{error && <p className="pet-photo-manager-error" role="alert">{error}</p>}
      <div className="pet-gallery-actions">{dirty && <button className="pet-gallery-discard" type="button" disabled={busy} onClick={discard}><RotateCcw size={17} aria-hidden="true" /> Descartar</button>}<button className="pet-photo-manager-save" type="button" onClick={() => void save()} disabled={busy || !dirty}>{saving ? <LoaderCircle className="form-spinner" size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}{saving ? "Salvando…" : "Salvar galeria"}</button></div>
    </div>}{editing !== null && photos[editing]?.file && <PetPhotoEditor key={editing} file={photos[editing].file} onClose={() => setEditing(null)} onApply={(edited) => { const url = URL.createObjectURL(edited); setPhotos((current) => current.map((photo, index) => { if (index !== editing) return photo; if (photo.file) URL.revokeObjectURL(photo.url); return { file: edited, url }; })); setDirty(true); setEditing(null); setNotice("Enquadramento aplicado. Salve a galeria para confirmar."); }} />}</div>;
}
