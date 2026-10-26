import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createReadStream } from "node:fs";
import { readFile, stat, unlink } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import { advertisingStorageRoot } from "../commercial/commercial-media.service";

export const operationsDocumentRoot = () => resolve(advertisingStorageRoot(), "..", "operations");
function assertSignature(buffer: Buffer, mime: string) {
  if (mime === "application/pdf" && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return;
  if (mime === "image/jpeg" && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return;
  if (mime === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return;
  throw new BadRequestException("O conteúdo precisa ser PDF, JPG ou PNG válido.");
}

@Injectable()
export class AdminDocumentsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(filter: { partnerId?: string; invoiceId?: string; eventId?: string }) {
    const items = await this.prisma.operationalDocument.findMany({ where: { ...(filter.partnerId ? { partnerId: filter.partnerId } : {}), ...(filter.invoiceId ? { invoiceId: filter.invoiceId } : {}), ...(filter.eventId ? { eventId: filter.eventId } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
    return items.map(({ storageKey, ...item }) => ({ ...item, url: `/api/commercial/admin/documents/${item.id}/file` }));
  }
  async save(actorId: string, files: Express.Multer.File[], metadata: { partnerId?: string; invoiceId?: string; eventId?: string; kind?: string }) {
    try {
      if (!files?.length) throw new BadRequestException("Escolha ao menos um documento.");
      if (!["CONTRACT", "PAYMENT_PROOF", "EVENT_AUTHORIZATION", "REGISTRATION", "OTHER"].includes(metadata.kind ?? "OTHER")) throw new BadRequestException("Categoria do documento inválida.");
      if (metadata.partnerId && !await this.prisma.commercialPartner.findUnique({ where: { id: metadata.partnerId }, select: { id: true } })) throw new NotFoundException("Parceiro não encontrado.");
      if (metadata.invoiceId && !await this.prisma.commercialInvoice.findUnique({ where: { id: metadata.invoiceId }, select: { id: true } })) throw new NotFoundException("Fatura não encontrada.");
      if (metadata.eventId && !await this.prisma.petEvent.findUnique({ where: { id: metadata.eventId }, select: { id: true } })) throw new NotFoundException("Evento não encontrado.");
      if (!metadata.partnerId && !metadata.invoiceId && !metadata.eventId) throw new BadRequestException("Vincule o arquivo a um parceiro, fatura ou evento.");
      const normalized: Express.Multer.File[] = [];
      for (const file of files) { if (file.size > 15 * 1024 * 1024) throw new BadRequestException("Cada documento pode ter no máximo 15 MB."); assertSignature(await readFile(file.path), file.mimetype); normalized.push(file); }
      return await this.prisma.$transaction(async (tx) => {
        const records: Awaited<ReturnType<typeof tx.operationalDocument.create>>[] = [];
        for (const file of normalized) records.push(await tx.operationalDocument.create({ data: { ...metadata, kind: metadata.kind ?? "OTHER", filename: basename(file.originalname.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "documento", storageKey: file.filename, mimeType: file.mimetype, sizeBytes: file.size, uploadedById: actorId } }));
        await tx.adminAuditLog.create({ data: { actorId, action: "OPERATIONAL_DOCUMENT_UPLOADED", targetType: "DOCUMENTS", targetId: records.map((record) => record.id).join(","), metadata: { count: records.length, kind: metadata.kind ?? "OTHER", partnerId: metadata.partnerId ?? null, invoiceId: metadata.invoiceId ?? null, eventId: metadata.eventId ?? null } } });
        return records.map(({ storageKey, ...item }) => ({ ...item, url: `/api/commercial/admin/documents/${item.id}/file` }));
      });
    } catch (error) { await Promise.all((files ?? []).map((file) => unlink(file.path).catch(() => undefined))); throw error; }
  }
  async open(id: string) {
    const document = await this.prisma.operationalDocument.findUnique({ where: { id } });
    if (!document) throw new NotFoundException("Documento não encontrado.");
    const root = operationsDocumentRoot(); const path = resolve(root, document.storageKey);
    if (!path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`)) throw new NotFoundException("Documento não encontrado.");
    const info = await stat(path).catch(() => null); if (!info?.isFile()) throw new NotFoundException("Documento não encontrado.");
    return { stream: createReadStream(path), mimeType: document.mimeType, size: info.size, filename: document.filename };
  }
}
