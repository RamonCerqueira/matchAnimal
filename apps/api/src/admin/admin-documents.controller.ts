import { BadRequestException, Body, CallHandler, Controller, ExecutionContext, Get, Headers, Injectable, NestInterceptor, Param, Post, Query, Req, Res, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import { basename, extname } from "node:path";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { Response } from "express";
import { catchError } from "rxjs/operators";
import { AuthenticatedRequest, JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CommercialAdminGuard } from "../commercial/commercial-admin.guard";
import { AdminDocumentsService, operationsDocumentRoot } from "./admin-documents.service";

class DocumentMetadataDto { @IsOptional() @IsString() @MaxLength(100) partnerId?: string; @IsOptional() @IsString() @MaxLength(100) invoiceId?: string; @IsOptional() @IsString() @MaxLength(100) eventId?: string; @IsOptional() @IsIn(["CONTRACT", "PAYMENT_PROOF", "EVENT_AUTHORIZATION", "REGISTRATION", "OTHER"]) kind?: string; }
@Injectable() class CleanupDocumentUpload implements NestInterceptor { intercept(context: ExecutionContext, next: CallHandler) { return next.handle().pipe(catchError(async (error: unknown) => { await Promise.all((context.switchToHttp().getRequest<{ files?: Express.Multer.File[] }>().files ?? []).map((file) => unlink(file.path).catch(() => undefined))); throw error; })); } }
@Controller("commercial/admin/documents") @UseGuards(JwtAuthGuard, CommercialAdminGuard)
export class AdminDocumentsController {
  constructor(private readonly documents: AdminDocumentsService) {}
  @Get() list(@Query("partnerId") partnerId?: string, @Query("invoiceId") invoiceId?: string, @Query("eventId") eventId?: string) { if (![partnerId, invoiceId, eventId].some(Boolean)) throw new BadRequestException("Filtre os documentos por parceiro, fatura ou evento."); return this.documents.list({ partnerId, invoiceId, eventId }); }
  @Post() @UseInterceptors(CleanupDocumentUpload, FilesInterceptor("files", 5, { storage: diskStorage({ destination: (_req, _file, cb) => { const root = operationsDocumentRoot(); void mkdir(root, { recursive: true }).then(() => cb(null, root)).catch((error: Error) => cb(error, root)); }, filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(basename(file.originalname.replace(/\\/g, "/"))).toLowerCase()}`) }), limits: { files: 5, fileSize: 15 * 1024 * 1024, fields: 4, fieldSize: 256 }, fileFilter: (_req, file, cb) => { const ext = extname(file.originalname).toLowerCase(); if (!(ext === ".pdf" && file.mimetype === "application/pdf" || ext === ".jpg" && file.mimetype === "image/jpeg" || ext === ".jpeg" && file.mimetype === "image/jpeg" || ext === ".png" && file.mimetype === "image/png")) return cb(new BadRequestException("Envie documento PDF, JPG ou PNG."), false); cb(null, true); } })) upload(@Req() req: AuthenticatedRequest, @Body() body: DocumentMetadataDto, @UploadedFiles() files: Express.Multer.File[]) { return this.documents.save(req.user.sub, files, body); }
  @Get(":id/file") async file(@Param("id") id: string, @Res({ passthrough: true }) response: Response) { const document = await this.documents.open(id); response.setHeader("Content-Type", document.mimeType); response.setHeader("Content-Length", document.size); response.setHeader("Content-Disposition", `inline; filename="${basename(document.filename).replace(/[\r\n"\\]/g, "_")}"`); response.setHeader("Cache-Control", "private, no-store"); response.setHeader("X-Content-Type-Options", "nosniff"); return new StreamableFile(document.stream); }
}
