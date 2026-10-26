import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createReadStream } from "node:fs";
import { readFile, stat, unlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import { isAdministrativeAccount } from "../auth/admin-access";
import { CommercialDeliveryService } from "./commercial-delivery.service";
import { MediaMetadata, readAdvertisingMetadata } from "./media-metadata";
import { AD_PLACEMENT_SPECS } from "./advertising-specs";

export function advertisingStorageRoot() { return resolve(process.env.MEDIA_STORAGE_DIR ?? join(process.cwd(), "storage"), "advertising"); }
const assetView = <T extends { id: string; storageKey: string; createdById: string }>(asset: T) => {
  const { storageKey: _key, createdById: _actor, ...safe } = asset;
  return { ...safe, url: `/api/commercial/media/${asset.id}` };
};

@Injectable()
export class CommercialMediaService {
  constructor(private readonly prisma: PrismaService, private readonly delivery: CommercialDeliveryService) {}

  async list(partnerId?: string) {
    const assets = await this.prisma.adAsset.findMany({ where: partnerId ? { partnerId } : {}, orderBy: { createdAt: "desc" }, take: 200 });
    return assets.map(assetView);
  }

  async upload(actorId: string, files: Express.Multer.File[], partnerId?: string) {
    try {
      if (!files?.length) throw new BadRequestException("Selecione pelo menos um arquivo.");
      if (partnerId && !await this.prisma.commercialPartner.findUnique({ where: { id: partnerId }, select: { id: true } })) throw new BadRequestException("Parceiro não encontrado.");
      const parsed: Array<{ file: Express.Multer.File; metadata: MediaMetadata }> = [];
      for (const file of files) {
        const maxBytes = file.mimetype === "video/mp4" ? 25 * 1024 * 1024 : 5 * 1024 * 1024;
        if (file.size > maxBytes) throw new BadRequestException("Limite excedido: imagens até 5 MB e vídeos até 25 MB.");
        const metadata = readAdvertisingMetadata(await readFile(file.path), file.mimetype);
        if (metadata.width < 600 || metadata.width > 8000 || metadata.height < 1 || metadata.height > 8000) throw new BadRequestException("A mídia deve ter largura mínima de 600 px e dimensões de até 8000 px.");
        if (metadata.durationSeconds && metadata.durationSeconds > 30) throw new BadRequestException("O vídeo deve ter no máximo 30 segundos.");
        const ratio = metadata.width / metadata.height;
        if (!AD_PLACEMENT_SPECS.some((spec) => (spec.mediaTypes as readonly string[]).includes(metadata.mediaType) && spec.ratios.some((expected) => Math.abs(ratio - expected) / expected <= 0.02))) throw new BadRequestException("Proporção não aceita. Use 1200 × 480 para Início, 1080 × 1080 para Comunidade ou 1080 × 1350 para Comunidade/Explorar. Vídeo: quadrado ou 4:5.");
        parsed.push({ file, metadata });
      }
      const assets = await this.prisma.$transaction(async (tx) => {
        const result: Array<ReturnType<typeof assetView>> = [];
        for (const { file, metadata } of parsed) {
          const asset = await tx.adAsset.create({ data: { partnerId: partnerId || null, filename: basename(file.originalname.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "mídia", storageKey: file.filename, mimeType: file.mimetype, ...metadata, sizeBytes: file.size, createdById: actorId } });
          await tx.adminAuditLog.create({ data: { actorId, action: "MEDIA_UPLOADED", targetType: "AdAsset", targetId: asset.id, metadata: { filename: asset.filename, sizeBytes: asset.sizeBytes, mediaType: asset.mediaType } } });
          result.push(assetView(asset));
        }
        return result;
      });
      return assets;
    } catch (error) {
      await Promise.all((files ?? []).map((file) => unlink(file.path).catch(() => undefined)));
      throw error;
    }
  }

  async open(user: { sub: string; email: string }, id: string, range?: string) {
    const asset = isAdministrativeAccount(user.sub, user.email) ? await this.prisma.adAsset.findUnique({ where: { id } }) : await this.delivery.findVisibleAsset(user.sub, id);
    if (!asset || !/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|mp4)$/i.test(asset.storageKey)) throw new NotFoundException("Mídia não encontrada.");
    const filePath = resolve(advertisingStorageRoot(), asset.storageKey);
    if (!filePath.startsWith(`${advertisingStorageRoot()}\\`) && !filePath.startsWith(`${advertisingStorageRoot()}/`)) throw new NotFoundException("Mídia não encontrada.");
    const file = await stat(filePath).catch(() => null);
    if (!file?.isFile()) throw new NotFoundException("Mídia não encontrada.");
    if (range && asset.mediaType === "VIDEO") {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || !match[1] && !match[2]) return { unsatisfiable: true as const, total: file.size };
      const suffix = !match[1]; const start = suffix ? Math.max(0, file.size - Number(match[2])) : Number(match[1]);
      const end = suffix || !match[2] ? file.size - 1 : Math.min(Number(match[2]), file.size - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= file.size || end < start) return { unsatisfiable: true as const, total: file.size };
      return { unsatisfiable: false as const, stream: createReadStream(filePath, { start, end }), mimeType: asset.mimeType, size: end - start + 1, contentRange: `bytes ${start}-${end}/${file.size}` };
    }
    return { unsatisfiable: false as const, stream: createReadStream(filePath), mimeType: asset.mimeType, size: file.size, contentRange: null };
  }
}
