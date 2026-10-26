import { BadRequestException } from "@nestjs/common";
import type { AdPlacement } from "../generated/prisma/client";

const imageLimit = 5 * 1024 * 1024;
const videoLimit = 25 * 1024 * 1024;

export const AD_PLACEMENT_SPECS = [
  { id: "HOME_BANNER", label: "Início · destaque de parceiro", width: 1200, height: 480, ratios: [2.5], mediaTypes: ["IMAGE"], minWidth: 600, maxImageBytes: imageLimit, maxVideoBytes: videoLimit, maxDurationSeconds: 30, acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"], description: "Banner horizontal identificado como patrocinado, depois da descoberta no início. Envie 1200 × 480 px ou maior na mesma proporção." },
  { id: "COMMUNITY_FEED", label: "Comunidade · publicação patrocinada", width: 1080, height: 1080, ratios: [1, 0.8], mediaTypes: ["IMAGE", "VIDEO"], minWidth: 600, maxImageBytes: imageLimit, maxVideoBytes: videoLimit, maxDurationSeconds: 30, acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4"], description: "Peça identificada no feed, separada das publicações dos tutores. Envie 1080 × 1080 ou 1080 × 1350 px. Vídeo MP4 com codec H.264, até 30 segundos." },
  { id: "EXPLORE_CARD", label: "Explorar · cartão de parceiro", width: 1080, height: 1350, ratios: [0.8], mediaTypes: ["IMAGE"], minWidth: 600, maxImageBytes: imageLimit, maxVideoBytes: videoLimit, maxDurationSeconds: 30, acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"], description: "Cartão patrocinado fora dos gestos de match, depois das ações de descoberta. Envie 1080 × 1350 px ou maior na mesma proporção." },
] as const;

export interface AdvertisingAssetMetadata {
  mediaType: "IMAGE" | "VIDEO";
  width: number;
  height: number;
  durationSeconds?: number | null;
  sizeBytes: number;
  mimeType?: string;
}

export function validateAssetForPlacement(asset: AdvertisingAssetMetadata, placement: AdPlacement): void {
  const spec = AD_PLACEMENT_SPECS.find((item) => item.id === placement);
  if (!spec) throw new BadRequestException("Posição de anúncio inválida.");
  if (!(spec.mediaTypes as readonly string[]).includes(asset.mediaType)) throw new BadRequestException("Esta posição aceita somente imagem.");
  if (!Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width < spec.minWidth || asset.height < 1 || asset.width > 8000 || asset.height > 8000) throw new BadRequestException("A mídia precisa ter largura mínima de 600 px e dimensões de até 8000 px.");
  const ratio = asset.width / asset.height;
  if (!spec.ratios.some((expected) => Math.abs(ratio - expected) / expected <= 0.02)) throw new BadRequestException(`Proporção incompatível. ${spec.description}`);
  if (!Number.isInteger(asset.sizeBytes) || asset.sizeBytes <= 0 || asset.sizeBytes > (asset.mediaType === "VIDEO" ? videoLimit : imageLimit)) throw new BadRequestException("A mídia excede o limite: imagem de 5 MB ou vídeo de 25 MB.");
  if (asset.mediaType === "VIDEO" && (asset.durationSeconds == null || !Number.isFinite(asset.durationSeconds) || asset.durationSeconds <= 0 || asset.durationSeconds > 30)) throw new BadRequestException("O vídeo deve durar entre 0 e 30 segundos.");
  if (asset.mimeType && !(spec.acceptedMimeTypes as readonly string[]).includes(asset.mimeType)) throw new BadRequestException("Formato não aceito nesta posição.");
}
