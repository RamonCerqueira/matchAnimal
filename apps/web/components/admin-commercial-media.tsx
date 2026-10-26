"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { FileImage, Film, ImagePlus, LoaderCircle, Megaphone, RefreshCw, Search, UploadCloud, X } from "lucide-react";
import { AdminBadge, AdminFeedback, AdminField, AdminState, assetUrl, commercialApi, commercialBase, dateBR, errorMessage, placementLabels, useAdminResource, type CommercialAsset, type CommercialPartner, type PlacementSpec } from "@/components/admin-commercial-core";

type LocalAsset = { file: File; url: string; width: number; height: number; durationSeconds: number | null; mediaType: "IMAGE" | "VIDEO" };
export const bytesLabel = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.ceil(bytes / 1024)} KB`;
export function assetPlacementError(asset: Pick<CommercialAsset, "mediaType" | "mimeType" | "width" | "height" | "sizeBytes" | "durationSeconds">, spec: PlacementSpec) {
  if (!spec.mediaTypes.includes(asset.mediaType)) return "Este espaço aceita somente imagens.";
  if (!spec.acceptedMimeTypes.includes(asset.mimeType)) return "O formato deste arquivo não é aceito neste espaço.";
  if (asset.width < spec.minWidth) return `A imagem ou vídeo precisa ter pelo menos ${spec.minWidth} px de largura.`;
  if (!spec.ratios.some((ratio) => Math.abs(asset.width / asset.height - ratio) / ratio <= .02)) return `Use a proporção recomendada para ${spec.label}: ${spec.width} × ${spec.height} px${spec.id === "COMMUNITY_FEED" ? " ou 1080 × 1350 px" : ""}.`;
  if (asset.sizeBytes > (asset.mediaType === "VIDEO" ? spec.maxVideoBytes : spec.maxImageBytes)) return `O arquivo excede ${bytesLabel(asset.mediaType === "VIDEO" ? spec.maxVideoBytes : spec.maxImageBytes)}.`;
  if (asset.mediaType === "VIDEO" && (!asset.durationSeconds || asset.durationSeconds > spec.maxDurationSeconds)) return `Use um vídeo com até ${spec.maxDurationSeconds} segundos.`;
  return "";
}

async function inspectFile(file: File, spec: PlacementSpec): Promise<LocalAsset> {
  if (!spec.acceptedMimeTypes.includes(file.type)) throw new Error(`“${file.name}”: use JPG, PNG, WebP${spec.mediaTypes.includes("VIDEO") ? " ou MP4 com codec H.264" : ""}.`);
  const mediaType = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";
  if (file.size > (mediaType === "VIDEO" ? spec.maxVideoBytes : spec.maxImageBytes)) throw new Error(`“${file.name}” excede o limite de ${bytesLabel(mediaType === "VIDEO" ? spec.maxVideoBytes : spec.maxImageBytes)}.`);
  const url = URL.createObjectURL(file);
  try {
    const metadata = await new Promise<{ width: number; height: number; durationSeconds: number | null }>((resolve, reject) => {
      if (mediaType === "IMAGE") {
        const image = new window.Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight, durationSeconds: null }); image.onerror = () => reject(new Error("Não foi possível abrir a imagem. Escolha outro arquivo.")); image.src = url;
      } else {
        const video = document.createElement("video"); video.preload = "metadata"; video.onloadedmetadata = () => { resolve({ width: video.videoWidth, height: video.videoHeight, durationSeconds: video.duration }); video.removeAttribute("src"); video.load(); }; video.onerror = () => reject(new Error("Não foi possível ler este vídeo. Use MP4 com codec H.264.")); video.src = url;
      }
    });
    const invalid = assetPlacementError({ ...metadata, mediaType, mimeType: file.type, sizeBytes: file.size }, spec);
    if (invalid) throw new Error(`“${file.name}”: ${invalid}`);
    return { file, url, mediaType, ...metadata };
  } catch (cause) { URL.revokeObjectURL(url); throw cause; }
}

function uploadAssets(files: LocalAsset[], partnerId: string, onProgress: (progress: number) => void) {
  return new Promise<CommercialAsset[]>((resolve, reject) => {
    const form = new FormData(); files.forEach(({ file }) => form.append("files", file)); if (partnerId) form.append("partnerId", partnerId);
    const request = new XMLHttpRequest(); request.open("POST", `${commercialApi}${commercialBase}/media`); request.withCredentials = true; request.timeout = 180000;
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    request.onerror = () => reject(new Error("A conexão caiu durante o envio. Os arquivos continuam selecionados."));
    request.ontimeout = () => reject(new Error("O envio demorou mais que o esperado. Confira a conexão e tente novamente."));
    request.onabort = () => reject(new Error("O envio foi interrompido. Tente novamente."));
    request.onload = () => {
      let payload: unknown; try { payload = JSON.parse(request.responseText); } catch { reject(new Error("Não recebemos a confirmação do envio. Tente novamente.")); return; }
      if (request.status < 200 || request.status >= 300 || !Array.isArray(payload)) { const message = payload && typeof payload === "object" && "message" in payload ? payload.message : "Não foi possível enviar os arquivos."; reject(new Error(Array.isArray(message) ? message.join(" ") : String(message))); return; }
      if (payload.length !== files.length) { reject(new Error("Nem todos os arquivos foram confirmados. Atualize a biblioteca antes de tentar novamente.")); return; }
      onProgress(100); resolve(payload as CommercialAsset[]);
    };
    request.send(form);
  });
}

export function AdminCommercialMedia({ onCreateCampaign }: { onCreateCampaign: (asset: CommercialAsset) => void }) {
  const assets = useAdminResource<CommercialAsset[]>(`${commercialBase}/media`);
  const specs = useAdminResource<{ placements: PlacementSpec[] }>("/api/commercial/specs");
  const partners = useAdminResource<CommercialPartner[]>(`${commercialBase}/partners`);
  const [placement, setPlacement] = useState("HOME_BANNER");
  const [partnerId, setPartnerId] = useState("");
  const [files, setFiles] = useState<LocalAsset[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [libraryPartner, setLibraryPartner] = useState("ALL");
  const [libraryType, setLibraryType] = useState("ALL");
  const picker = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const filesRef = useRef<LocalAsset[]>([]);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => () => filesRef.current.forEach((file) => URL.revokeObjectURL(file.url)), []);
  const spec = specs.data?.placements.find((item) => item.id === placement);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []); event.target.value = "";
    if (!selected.length || !spec || busyRef.current) return;
    setError(""); setNotice("");
    if (selected.length + files.length > 6) { setError("Selecione até 6 arquivos por envio."); return; }
    busyRef.current = true; setPreparing(true);
    const ready: LocalAsset[] = [];
    try { for (const file of selected) ready.push(await inspectFile(file, spec)); setFiles((current) => [...current, ...ready]); }
    catch (cause) { ready.forEach((file) => URL.revokeObjectURL(file.url)); setError(errorMessage(cause)); }
    finally { busyRef.current = false; setPreparing(false); }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!files.length || !spec || busyRef.current) return;
    busyRef.current = true; setUploading(true); setProgress(0); setError(""); setNotice("");
    try {
      for (const file of files) { const invalid = assetPlacementError({ ...file, mimeType: file.file.type, sizeBytes: file.file.size }, spec); if (invalid) throw new Error(`${file.file.name}: ${invalid}`); }
      const uploaded = await uploadAssets(files, partnerId, setProgress);
      files.forEach((file) => URL.revokeObjectURL(file.url)); setFiles([]); setNotice(`${uploaded.length === 1 ? "Arquivo enviado" : `${uploaded.length} arquivos enviados`}. Agora você pode vincular a mídia a uma campanha.`); assets.reload();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { busyRef.current = false; setUploading(false); }
  }

  const filtered = (assets.data ?? []).filter((asset) => (libraryPartner === "ALL" || (libraryPartner === "NONE" ? !asset.partnerId : asset.partnerId === libraryPartner)) && (libraryType === "ALL" || asset.mediaType === libraryType) && asset.filename.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  return <section className="ac-section"><header className="ac-section-heading"><div><span>CRIATIVOS E ESPECIFICAÇÕES</span><h2>Mídia e formatos</h2><p>Envie os arquivos do anúncio e confira onde cada criativo pode aparecer.</p></div></header>
    <AdminState loading={specs.loading} error={specs.error} onRetry={specs.reload}><div className="ac-spec-grid">{specs.data?.placements.map((item) => <button className={`ac-spec-card ${placement === item.id ? "ac-spec-selected" : ""}`} key={item.id} type="button" aria-pressed={placement === item.id} disabled={preparing || uploading} onClick={() => { setPlacement(item.id); setError(""); }}><span className={`ac-spec-shape ac-spec-${item.id.toLowerCase()}`}><FileImage size={22} aria-hidden="true" /></span><strong>{item.label}</strong><span>{item.width} × {item.height} px{item.id === "COMMUNITY_FEED" ? " ou 1080 × 1350 px" : ""}</span><small>{item.mediaTypes.includes("VIDEO") ? `Imagem até ${bytesLabel(item.maxImageBytes)} · vídeo até ${item.maxDurationSeconds}s e ${bytesLabel(item.maxVideoBytes)}` : `Imagem até ${bytesLabel(item.maxImageBytes)}`}</small><p>{item.description}</p></button>)}</div></AdminState>
    <form className="ac-upload-form" onSubmit={(event) => void upload(event)} aria-busy={preparing || uploading}><fieldset disabled={preparing || uploading} className="ac-upload-fields"><div><span className="ac-section-kicker">ENVIAR PARA A BIBLIOTECA</span><h3>{spec?.label ?? "Escolha um formato"}</h3><p>Até 6 arquivos por envio. O sistema confere dimensões, proporção, tamanho e duração.</p>{spec?.mediaTypes.includes("VIDEO") && <p className="ac-form-note">Vídeos devem estar em MP4 com codec H.264. A compatibilidade final é validada pelo servidor.</p>}</div><AdminField label="Parceiro associado (opcional)"><select value={partnerId} onChange={(event) => setPartnerId(event.target.value)}><option value="">Biblioteca geral</option>{partners.data?.map((partner) => <option key={partner.id} value={partner.id}>{partner.businessName}</option>)}</select></AdminField><input ref={picker} type="file" accept={spec?.acceptedMimeTypes.join(",")} multiple hidden onChange={(event) => void choose(event)} /><button type="button" className="ac-upload-picker" disabled={!spec || files.length >= 6} onClick={() => picker.current?.click()}><UploadCloud size={30} aria-hidden="true" /><strong>Escolher arquivos do dispositivo</strong><span>{spec ? `${spec.width} × ${spec.height} px · mínimo de ${spec.minWidth} px de largura` : "Carregue os formatos para começar"}</span><span className="ac-button ac-button-secondary"><ImagePlus size={17} aria-hidden="true" />Selecionar fotos ou vídeos</span></button>
      {!!files.length && <div className="ac-local-media-grid">{files.map((item, index) => <article key={item.url}>{item.mediaType === "VIDEO" ? <video src={item.url} controls preload="metadata" /> : <Image src={item.url} width={item.width} height={item.height} alt={`Prévia de ${item.file.name}`} unoptimized />}<strong>{item.file.name}</strong><small>{item.width} × {item.height} px · {bytesLabel(item.file.size)}{item.durationSeconds ? ` · ${Math.round(item.durationSeconds)}s` : ""}</small><button type="button" className="ac-icon-button" aria-label={`Remover ${item.file.name}`} onClick={() => { URL.revokeObjectURL(item.url); setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index)); }}><X size={18} aria-hidden="true" /></button></article>)}</div>}</fieldset>
      {preparing && <p className="ac-feedback" role="status"><LoaderCircle className="ac-spin" size={18} aria-hidden="true" />Conferindo os arquivos…</p>}{uploading && <div className="ac-upload-progress" role="status"><span>{progress === 100 ? "Envio concluído. Processando os arquivos…" : `Enviando arquivos… ${progress}%`}</span><progress aria-label="Progresso do envio de mídia" value={progress} max={100} /></div>}<AdminFeedback error={error || partners.error} notice={notice} /><div className="ac-form-actions"><button className="ac-button" type="submit" disabled={!files.length || !spec || uploading || preparing}>{uploading ? <LoaderCircle className="ac-spin" size={18} aria-hidden="true" /> : <UploadCloud size={18} aria-hidden="true" />}{uploading ? "Enviando…" : `Enviar ${files.length || ""} arquivo${files.length === 1 ? "" : "s"}`}</button></div></form>
    <div className="ac-subheading"><div><h3>Biblioteca de mídia</h3><p>Os arquivos ficam disponíveis para campanhas sem precisar enviar novamente.</p></div><button className="ac-icon-button" type="button" aria-label="Atualizar biblioteca" onClick={assets.reload} disabled={assets.loading}><RefreshCw size={18} aria-hidden="true" /></button></div><div className="ac-toolbar"><label className="ac-search"><Search size={18} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pelo nome do arquivo" aria-label="Buscar arquivo de mídia" /></label><select value={libraryPartner} onChange={(event) => setLibraryPartner(event.target.value)} aria-label="Filtrar mídia por parceiro"><option value="ALL">Todos os parceiros</option><option value="NONE">Biblioteca geral</option>{partners.data?.map((partner) => <option key={partner.id} value={partner.id}>{partner.businessName}</option>)}</select><select value={libraryType} onChange={(event) => setLibraryType(event.target.value)} aria-label="Filtrar tipo de mídia"><option value="ALL">Todos os tipos</option><option value="IMAGE">Imagens</option><option value="VIDEO">Vídeos</option></select></div>
    <AdminState loading={assets.loading} error={assets.error} onRetry={assets.reload} empty={!filtered.length} emptyTitle="Nenhum arquivo neste filtro" emptyText="Envie a primeira mídia ou ajuste os filtros da biblioteca."><div className="ac-media-library">{filtered.map((asset) => <article key={asset.id} className="ac-media-card"><div>{asset.mediaType === "VIDEO" ? <video src={assetUrl(asset.url)} controls preload="metadata" /> : <Image src={assetUrl(asset.url)} width={asset.width} height={asset.height} alt={asset.filename} loading="lazy" unoptimized />}<AdminBadge>{asset.mediaType === "VIDEO" ? <Film size={14} aria-hidden="true" /> : <FileImage size={14} aria-hidden="true" />}{asset.mediaType === "VIDEO" ? "Vídeo" : "Imagem"}</AdminBadge></div><section><h4>{asset.filename}</h4><p>{asset.width} × {asset.height} px · {bytesLabel(asset.sizeBytes)}{asset.durationSeconds ? ` · ${Math.round(asset.durationSeconds)}s` : ""}</p><small>{asset.partner?.businessName ?? partners.data?.find((partner) => partner.id === asset.partnerId)?.businessName ?? "Biblioteca geral"} · {dateBR(asset.createdAt)}</small><div className="ac-media-placements">{specs.data?.placements.filter((item) => !assetPlacementError(asset, item)).map((item) => <span key={item.id}>{placementLabels[item.id] ?? item.label}</span>)}</div><button type="button" className="ac-button ac-button-secondary" onClick={() => onCreateCampaign(asset)}><Megaphone size={17} aria-hidden="true" />Criar campanha</button></section></article>)}</div></AdminState>
  </section>;
}
