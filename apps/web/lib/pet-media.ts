export type PetPhotoUpload = { key: string; url: string; type?: string };

export type PetPhotoCrop = { zoom: number; horizontal: number; vertical: number };

function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível abrir esta imagem. Tente uma foto JPG, PNG ou WebP.")); };
    image.src = url;
  });
}

export async function cropPetPhoto(file: File, crop: PetPhotoCrop): Promise<File> {
  const image = await readImage(file);
  const side = Math.min(image.naturalWidth, image.naturalHeight) / Math.max(1, Math.min(3, crop.zoom));
  const x = (image.naturalWidth - side) * Math.max(0, Math.min(100, crop.horizontal)) / 100;
  const y = (image.naturalHeight - side) * Math.max(0, Math.min(100, crop.vertical)) / 100;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(1400, Math.round(side));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível ajustar a foto neste aparelho.");
  context.drawImage(image, x, y, side, side, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) { reject(new Error("Não foi possível salvar o recorte. Tente novamente.")); return; }
    resolve(new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-ajustada.webp`, { type: "image/webp", lastModified: Date.now() }));
  }, "image/webp", .86));
}

export function preparePetPhoto(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Escolha uma imagem JPG, PNG ou WebP."));
    if (file.size > 20 * 1024 * 1024) return reject(new Error("Cada foto deve ter até 20 MB."));
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("Não foi possível preparar esta imagem."));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Não foi possível preparar esta imagem."));
        resolve(new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "foto"}.webp`, { type: "image/webp", lastModified: Date.now() }));
      }, "image/webp", 0.84);
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Não foi possível abrir esta imagem.")); };
    image.src = objectUrl;
  });
}

export function uploadPetPhotos(files: File[], onProgress: (progress: number) => void, api: string): Promise<PetPhotoUpload[]> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    const request = new XMLHttpRequest();
    request.open("POST", `${api}/api/community/media`);
    request.withCredentials = true;
    request.timeout = 120000;
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onerror = () => reject(new Error("Falha de conexão ao enviar as fotos. Tente novamente."));
    request.ontimeout = () => reject(new Error("O envio demorou mais que o esperado. Confira sua conexão e tente novamente."));
    request.onabort = () => reject(new Error("Envio cancelado. As fotos continuam selecionadas."));
    request.onload = () => {
      let payload: PetPhotoUpload[] | { message?: string } | null;
      try { payload = JSON.parse(request.responseText || "null") as PetPhotoUpload[] | { message?: string } | null; }
      catch { reject(new Error("A API retornou uma resposta inválida ao enviar as fotos.")); return; }
      if (request.status < 200 || request.status >= 300 || !Array.isArray(payload)) {
        const message = payload && !Array.isArray(payload) ? payload.message : undefined;
        reject(new Error(message ?? "Não foi possível enviar as fotos."));
        return;
      }
      if (payload.length !== files.length || payload.some((item) => !item || typeof item.key !== "string" || typeof item.url !== "string")) {
        reject(new Error("Não recebemos a confirmação de todas as fotos. Tente novamente."));
        return;
      }
      onProgress(100);
      resolve(payload.map((item) => ({ ...item, url: item.url.startsWith("/") ? `${api}${item.url}` : item.url })));
    };
    request.send(body);
  });
}
