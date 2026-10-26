"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Camera, Check, ChevronDown, ChevronUp, Crop, Heart, ImagePlus, Info, LoaderCircle, MapPin, PawPrint, ShieldCheck, Sparkles, UploadCloud, X } from "lucide-react";
import { PetPhotoEditor } from "@/components/pet-photo-editor";
import { ResponsibleCareNotice } from "@/components/responsible-care-notice";
import { preparePetPhoto, uploadPetPhotos, type PetPhotoUpload } from "@/lib/pet-media";
import { petFeedback } from "@/lib/native-feedback";

const petSchema = z.object({
  name: z.string().trim().min(2, "O nome precisa ter pelo menos 2 letras.").max(40, "Use até 40 caracteres."),
  species: z.enum(["DOG", "CAT", "OTHER"]),
  speciesOther: z.string().trim().max(40, "Use até 40 caracteres.").optional(),
  breed: z.string().trim().max(60, "Use até 60 caracteres.").optional(),
  sex: z.enum(["FEMALE", "MALE", "UNKNOWN"]),
  size: z.enum(["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE", "UNKNOWN"]),
  birthDate: z.string().optional().refine((value) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value && value <= new Date().toISOString().slice(0, 10)), "Informe uma data válida que não esteja no futuro."),
  bio: z.string().max(700, "Use até 700 caracteres.").optional(),
  intent: z.enum(["FRIENDSHIP", "RESPONSIBLE_BREEDING", "ADOPTION"]),
  temperament: z.array(z.string()).max(8),
  preferences: z.array(z.string()).max(12),
  isPublic: z.boolean(),
}).superRefine((values, context) => {
  if (values.species === "OTHER" && (values.speciesOther?.length ?? 0) < 2) context.addIssue({ code: "custom", path: ["speciesOther"], message: "Informe a espécie com pelo menos 2 letras." });
});

type PetFormValues = z.infer<typeof petSchema>;
type LocalPhoto = { file: File; url: string };
const traits = ["Brincalhão", "Calmo", "Sociável", "Curioso", "Carinhoso", "Cheio de energia"];
const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const draftKey = "matchanimal:new-pet:draft:v1";
const steps = ["Informações", "Fotos", "Personalidade", "Publicação"];
const stepFields: Array<Array<keyof PetFormValues>> = [["name", "species", "speciesOther", "breed", "size", "sex", "birthDate"], [], ["temperament", "bio", "intent"], ["isPublic"]];

function FieldError({ name, errors }: { name: keyof PetFormValues; errors: FieldErrors<PetFormValues> }) {
  return errors[name]?.message ? <small id={`pet-${name}-error`} className="field-error" role="alert">{errors[name]?.message}</small> : null;
}

export function PetForm() {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [createdName, setCreatedName] = useState("");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const photosRef = useRef<LocalPhoto[]>([]);
  const previews = photos.map((photo) => photo.url);
  const [uploadedPhotos, setUploadedPhotos] = useState<PetPhotoUpload[] | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const preparingRef = useRef(false);
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(0);
  const form = useForm<PetFormValues>({ resolver: zodResolver(petSchema), defaultValues: { species: "DOG", sex: "UNKNOWN", size: "UNKNOWN", intent: "FRIENDSHIP", temperament: [], preferences: [], isPublic: false, name: "", speciesOther: "", breed: "", birthDate: "", bio: "" }, mode: "onTouched" });
  const values = useWatch({ control: form.control });
  const { species, intent } = values;
  const temperament = values.temperament ?? [];
  const errors = form.formState.errors;
  const busy = preparing || form.formState.isSubmitting;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const draft: unknown = JSON.parse(saved);
        if (draft && typeof draft === "object" && !Array.isArray(draft)) {
          const merged = { ...form.getValues(), ...draft };
          // A draft can be incomplete. Only restore fields that retain their expected types.
          const current = form.getValues();
          for (const key of Object.keys(current) as Array<keyof PetFormValues>) {
            if (typeof merged[key] !== typeof current[key] || (Array.isArray(current[key]) && !Array.isArray(merged[key]))) delete (merged as Partial<PetFormValues>)[key];
          }
          form.reset({ ...current, ...merged });
        }
      }
    } catch { try { localStorage.removeItem(draftKey); } catch { /* Storage may be blocked. */ } }
    return form.subscribe({ formState: { values: true }, callback: ({ values: draft }) => { try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Storage may be blocked. */ } } });
  }, [form]);

  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  useEffect(() => {
    if (previousStep.current !== step) sectionHeading.current?.focus();
    previousStep.current = step;
  }, [step]);

  async function addFiles(incoming: FileList | File[]) {
    const selected = Array.from(incoming);
    if (!selected.length || preparingRef.current || form.formState.isSubmitting) return;
    setError(""); setNotice("");
    if (photos.length + selected.length > 6) { setError(`Você pode adicionar mais ${6 - photos.length} foto(s). O limite é de 6 fotos por perfil.`); return; }
    preparingRef.current = true; setPreparing(true);
    try {
      const ready: File[] = [];
      for (const file of selected) ready.push(await preparePetPhoto(file));
      const added = ready.map((file) => ({ file, url: URL.createObjectURL(file) }));
      setPhotos((current) => [...current, ...added]); setUploadedPhotos(null);
      setNotice(`${ready.length === 1 ? "Foto adicionada" : `${ready.length} fotos adicionadas`}. Use Ajustar para recortar e reposicionar.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível preparar as fotos."); }
    finally { preparingRef.current = false; setPreparing(false); }
  }

  function reorderPhoto(index: number, direction: -1 | 1) {
    if (busy) return;
    setPhotos((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const reordered = [...current]; [reordered[index], reordered[target]] = [reordered[target], reordered[index]]; return reordered; });
    setUploadedPhotos(null);
  }

  function dropPhoto(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault(); event.stopPropagation();
    if (busy || !/^\d+$/.test(event.dataTransfer.getData("text/plain"))) return;
    const from = Number(event.dataTransfer.getData("text/plain"));
    if (!Number.isInteger(from) || from < 0 || from >= photos.length || from === index) return;
    setPhotos((current) => { const reordered = [...current]; const [moved] = reordered.splice(from, 1); reordered.splice(index, 0, moved); return reordered; });
    setUploadedPhotos(null);
  }

  async function nextStep() {
    if (busy) return;
    setError(""); setNotice("");
    const valid = await form.trigger(stepFields[step], { shouldFocus: true });
    if (valid) { void petFeedback("tap"); setStep((current) => Math.min(3, current + 1)); }
  }

  function invalidSubmit(invalid: FieldErrors<PetFormValues>) {
    const invalidStep = stepFields.findIndex((fields) => fields.some((name) => invalid[name]));
    if (invalidStep >= 0) setStep(invalidStep);
    setError("Revise os campos destacados antes de criar o perfil.");
  }

  async function submit(submitted: PetFormValues) {
    if (preparingRef.current) return;
    setError(""); setNotice("");
    try {
      let media = uploadedPhotos;
      if (photos.length && !media) { setUploadProgress(0); media = await uploadPetPhotos(photos.map((photo) => photo.file), setUploadProgress, api); setUploadedPhotos(media); }
      const response = await fetch(`${api}/api/pets`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...submitted, birthDate: submitted.birthDate || undefined, speciesOther: submitted.species === "OTHER" ? submitted.speciesOther : undefined, breed: submitted.breed || undefined, bio: submitted.bio || undefined, mediaKeys: media?.map(({ key }) => key) ?? [] }) });
      const payload = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(" ") : payload.message ?? "Não foi possível salvar o perfil.");
      void petFeedback("success"); setCreatedName(submitted.name);
      form.reset(); try { localStorage.removeItem(draftKey); } catch { /* A blocked draft store must not hide a successful creation. */ }
      photos.forEach((photo) => URL.revokeObjectURL(photo.url)); setPhotos([]); setUploadedPhotos(null); setStep(0);
    } catch (failure) { setError(failure instanceof TypeError ? "Não conseguimos conectar ao serviço. Seu cadastro foi mantido; tente novamente em instantes." : failure instanceof Error ? failure.message : "Não foi possível salvar o perfil."); }
    finally { setUploadProgress(null); }
  }

  const photo = previews[0];
  function fieldAttributes(name: keyof PetFormValues) { return { id: `pet-${name}`, "aria-invalid": !!errors[name], "aria-describedby": errors[name] ? `pet-${name}-error` : undefined }; }

  if (createdName) return <section className="pet-create-success" aria-labelledby="pet-created-title"><span><Check size={32} aria-hidden="true" /></span><p className="product-eyebrow">UM NOVO COMEÇO</p><h1 id="pet-created-title">O perfil de {createdName} está pronto.</h1><p>As fotos, a visibilidade e as conexões ficam no seu controle em Meus animais.</p><div><Link href="/animais">Ver meus animais <ArrowRight size={18} aria-hidden="true" /></Link><Link href="/explorar">Explorar conexões</Link></div><button type="button" onClick={() => setCreatedName("")}>Cadastrar outro pet</button></section>;

  return <div className="pet-create-layout"><div className="pet-create-main"><Link href="/animais" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Meus animais</Link><div className="product-eyebrow"><span><PawPrint size={16} aria-hidden="true" /></span> UM PERFIL COM A CARA DELE</div><h1 className="product-h1">Vamos conhecer <em>seu companheiro.</em></h1><p className="product-lead">Quatro passos para apresentar seu pet. Seu rascunho é salvo neste aparelho; as fotos precisam ser selecionadas novamente se você sair.</p>
    <nav className="pet-stepper" aria-label="Etapas do cadastro">{steps.map((label, index) => <button type="button" key={label} className={`pet-step ${index === step ? "pet-step-active" : ""} ${index < step ? "pet-step-complete" : ""}`} onClick={() => { setError(""); setStep(index); }} disabled={index > step || busy} aria-current={index === step ? "step" : undefined}><span>{index < step ? <Check size={16} aria-hidden="true" /> : index + 1}</span><small>{label}</small></button>)}</nav>
    <form className="product-form" onSubmit={(event) => { if (step < 3) { event.preventDefault(); void nextStep(); } else { void form.handleSubmit(submit, invalidSubmit)(event); } }} noValidate aria-busy={busy}>
      <fieldset className="pet-form-fields" disabled={busy}>
      {step === 0 && <section className="form-section"><div className="form-section-heading"><span>01</span><div><h2 ref={sectionHeading} tabIndex={-1}>Informações básicas</h2><p>Comece pelo nome e pelas características principais.</p></div></div><div className="form-grid">
        <label className="app-field full" htmlFor="pet-name">Nome do pet<input placeholder="Como ele se chama?" maxLength={40} {...fieldAttributes("name")} {...form.register("name")} /><FieldError name="name" errors={errors} /></label>
        <label className="app-field" htmlFor="pet-species">Espécie<select {...fieldAttributes("species")} {...form.register("species")}><option value="DOG">Cão</option><option value="CAT">Gato</option><option value="OTHER">Outra espécie</option></select><FieldError name="species" errors={errors} /></label>
        {species === "OTHER" && <label className="app-field" htmlFor="pet-speciesOther">Qual espécie?<input placeholder="Ex.: coelho" maxLength={40} {...fieldAttributes("speciesOther")} {...form.register("speciesOther")} /><FieldError name="speciesOther" errors={errors} /></label>}
        <label className="app-field" htmlFor="pet-breed">Raça, se souber<input placeholder="Ex.: sem raça definida" maxLength={60} {...fieldAttributes("breed")} {...form.register("breed")} /><FieldError name="breed" errors={errors} /></label>
        <label className="app-field" htmlFor="pet-size">Porte<select {...fieldAttributes("size")} {...form.register("size")}><option value="UNKNOWN">Prefiro não informar</option><option value="SMALL">Pequeno</option><option value="MEDIUM">Médio</option><option value="LARGE">Grande</option><option value="EXTRA_LARGE">Gigante</option></select><FieldError name="size" errors={errors} /></label>
        <label className="app-field" htmlFor="pet-sex">Sexo<select {...fieldAttributes("sex")} {...form.register("sex")}><option value="UNKNOWN">Prefiro não informar</option><option value="FEMALE">Fêmea</option><option value="MALE">Macho</option></select><FieldError name="sex" errors={errors} /></label>
        <label className="app-field" htmlFor="pet-birthDate">Data de nascimento, se souber<input type="date" max={new Date().toISOString().slice(0, 10)} {...fieldAttributes("birthDate")} {...form.register("birthDate")} /><FieldError name="birthDate" errors={errors} /></label>
      </div></section>}

      {step === 1 && <section className="form-section"><div className="form-section-heading"><span>02</span><div><h2 ref={sectionHeading} tabIndex={-1}>Fotos do seu pet</h2><p>Até 6 imagens. A primeira será a capa; você pode ajustar o enquadramento de cada uma.</p></div></div><div className={`pet-photo-dropzone ${dragging ? "pet-photo-dropzone-active" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files); }}><span className="pet-photo-drop-icon"><UploadCloud size={26} aria-hidden="true" /></span><strong>Mostre o melhor do seu pet</strong><small>JPG, PNG ou WebP · até 20 MB por foto</small><div className="pet-photo-picker-actions"><button type="button" disabled={photos.length >= 6} onClick={() => galleryRef.current?.click()}><ImagePlus size={18} aria-hidden="true" /> Escolher fotos</button><button type="button" disabled={photos.length >= 6} onClick={() => cameraRef.current?.click()}><Camera size={18} aria-hidden="true" /> Tirar foto</button></div><input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.currentTarget.value = ""; }} hidden /><input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.currentTarget.value = ""; }} hidden />{dragging && <span className="pet-drop-overlay">Solte para adicionar</span>}</div>
        {photos.length > 0 ? <div className="pet-photo-grid" aria-label="Fotos selecionadas">{photos.map(({ file }, index) => <div className="pet-photo-tile" key={`${file.name}-${index}`} draggable={!busy} onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropPhoto(event, index)}>{previews[index] && <img src={previews[index]} alt={`Prévia ${index + 1} de ${values.name || "seu pet"}`} width={400} height={400} />}<span className="pet-photo-number">{index === 0 ? "Capa" : index + 1}</span><div className="pet-photo-controls"><button type="button" aria-label={`Ajustar recorte da foto ${index + 1}`} title="Ajustar foto" onClick={() => setEditing(index)}><Crop size={18} aria-hidden="true" /></button><button type="button" aria-label={`Mover foto ${index + 1} para antes`} onClick={() => reorderPhoto(index, -1)} disabled={index === 0}><ChevronUp size={18} aria-hidden="true" /></button><button type="button" aria-label={`Mover foto ${index + 1} para depois`} onClick={() => reorderPhoto(index, 1)} disabled={index === photos.length - 1}><ChevronDown size={18} aria-hidden="true" /></button><button type="button" aria-label={`Remover foto ${index + 1}`} onClick={() => { URL.revokeObjectURL(photos[index].url); setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index)); setUploadedPhotos(null); }}><X size={18} aria-hidden="true" /></button></div></div>)}</div> : <p className="pet-photo-empty"><ImagePlus size={18} aria-hidden="true" /> Você também pode adicionar as fotos depois.</p>}
        <div className="photo-tip"><ShieldCheck size={18} aria-hidden="true" /><p>As imagens são otimizadas antes do envio. A capa muda ao reorganizar as fotos; o perfil só aparece na descoberta se você ativar a visibilidade.</p></div>
      </section>}

      {step === 2 && <section className="form-section"><div className="form-section-heading"><span>03</span><div><h2 ref={sectionHeading} tabIndex={-1}>Personalidade e objetivo</h2><p>Conte o que faz seu pet ser único e que tipo de conexão procuram.</p></div></div><fieldset className="pet-trait-group"><legend>Como é a personalidade dele?</legend><div className="trait-options">{traits.map((trait) => <label key={trait} className={`trait-option ${temperament.includes(trait) ? "trait-selected" : ""}`}><input type="checkbox" checked={temperament.includes(trait)} onChange={(event) => form.setValue("temperament", event.target.checked ? [...temperament, trait] : temperament.filter((item) => item !== trait), { shouldDirty: true })} />{temperament.includes(trait) && <Check size={15} aria-hidden="true" />} {trait}</label>)}</div></fieldset><label className="app-field full bio-field" htmlFor="pet-bio">Um pouquinho sobre {values.name || "seu pet"} <span>{values.bio?.length ?? 0}/700</span><textarea rows={4} maxLength={700} placeholder="O que ele ama fazer? Como é a personalidade dele?" {...fieldAttributes("bio")} {...form.register("bio")} /><FieldError name="bio" errors={errors} /></label><fieldset className="pet-intent-group"><legend>O que vocês procuram?</legend><div className="intent-options">{[{ value: "FRIENDSHIP", title: "Amizade", text: "Passeios, brincadeiras e socialização.", icon: <Heart size={21} aria-hidden="true" /> }, { value: "RESPONSIBLE_BREEDING", title: "Relacionamento", text: "Apresentação responsável entre tutores.", icon: <ShieldCheck size={21} aria-hidden="true" /> }, { value: "ADOPTION", title: "Adoção", text: "Encontrar uma família para um pet.", icon: <PawPrint size={21} aria-hidden="true" /> }].map((option) => <label key={option.value} className={`intent-card ${intent === option.value ? "intent-selected" : ""}`}><input type="radio" value={option.value} {...form.register("intent")} /><span className="intent-icon">{option.icon}</span><span><strong>{option.title}</strong><small>{option.text}</small></span><i aria-hidden="true">{intent === option.value && <Check size={16} />}</i></label>)}</div></fieldset>{intent === "RESPONSIBLE_BREEDING" && <ResponsibleCareNotice compact title="Relacionamento com responsabilidade" />}</section>}

      {step === 3 && <section className="form-section"><div className="form-section-heading"><span>04</span><div><h2 ref={sectionHeading} tabIndex={-1}>Revise e crie o perfil</h2><p>Confira a apresentação. Você poderá ajustar as fotos e a visibilidade depois.</p></div></div><div className="pet-review-card"><div className="pet-review-photo" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>{!photo && <PawPrint size={30} aria-hidden="true" />}</div><div><span className="preview-kicker">PERFIL DO ANIMAL</span><h3>{values.name || "Nome do pet"}</h3><p>{values.breed || (values.species === "DOG" ? "Cão" : values.species === "CAT" ? "Gato" : values.speciesOther || "Animal")}</p><div className="preview-tags">{temperament.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}{!temperament.length && <span>Personalidade a completar</span>}</div></div></div><label className="visibility-toggle"><input type="checkbox" {...form.register("isPublic")} /><span className="toggle-ui" aria-hidden="true" /><span><strong>Deixar o perfil visível na descoberta</strong><small>Mostraremos a cidade aproximada, nunca o endereço da sua casa.</small></span></label><div className="photo-tip"><ShieldCheck size={18} aria-hidden="true" /><p>Você controla a visibilidade. Informações de saúde e comportamento não são verificadas automaticamente.</p></div></section>}
      </fieldset>

      {preparing && <p className="pet-processing" role="status"><LoaderCircle className="form-spinner" size={18} aria-hidden="true" /> Preparando e otimizando suas fotos…</p>}
      {uploadProgress !== null && <div className="pet-upload-progress" role="status"><span>{uploadProgress === 100 ? "Fotos enviadas. Salvando o perfil…" : `Enviando fotos… ${uploadProgress}%`}</span><progress aria-label="Envio das fotos" value={uploadProgress} max={100} /></div>}
      {notice && <div className="inline-success" role="status"><Check size={18} aria-hidden="true" />{notice}</div>}{error && <div className="form-alert" role="alert">{error}</div>}
      <div className="form-submit-row pet-form-actions">{step > 0 ? <button className="pet-step-back" type="button" disabled={busy} onClick={() => { setError(""); setNotice(""); setStep((current) => current - 1); }}><ArrowLeft size={18} aria-hidden="true" /> Voltar</button> : <Link href="/animais">Cancelar</Link>}{step < 3 ? <button type="button" disabled={busy} onClick={() => void nextStep()}>Continuar <ArrowRight size={18} aria-hidden="true" /></button> : <button type="submit" disabled={busy}>{form.formState.isSubmitting ? <LoaderCircle className="form-spinner" size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}{form.formState.isSubmitting ? "Salvando…" : "Criar perfil"}</button>}</div>
    </form></div><aside className="pet-preview-rail"><div className="pet-preview-card"><span className="preview-kicker">SEU PERFIL EM CONSTRUÇÃO</span><div className="preview-photo" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>{!photo && <PawPrint size={34} aria-hidden="true" />}</div><div className="preview-name">{values.name || "Nome do pet"}<span>{values.breed || "Espécie · Raça"}</span></div><div className="preview-tags">{temperament.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}{!temperament.length && <span>Personalidade</span>}</div><div className="preview-distance"><MapPin size={16} aria-hidden="true" /> <span>Sua região aproximada</span></div></div><div className="privacy-hint"><ShieldCheck size={20} aria-hidden="true" /><div><strong>Você está no controle</strong><p>O perfil só aparece na descoberta quando você ativa a visibilidade.</p></div></div></aside>
    {editing !== null && photos[editing] && <PetPhotoEditor key={editing} file={photos[editing].file} onClose={() => setEditing(null)} onApply={(edited) => { const url = URL.createObjectURL(edited); URL.revokeObjectURL(photos[editing].url); setPhotos((current) => current.map((item, index) => index === editing ? { file: edited, url } : item)); setUploadedPhotos(null); setEditing(null); setNotice("Enquadramento aplicado. A foto será enviada ao criar o perfil."); }} />}
  </div>;
}
