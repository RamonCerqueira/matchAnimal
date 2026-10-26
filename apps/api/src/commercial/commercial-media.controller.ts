import { BadRequestException, Body, CallHandler, Controller, ExecutionContext, Get, Headers, Injectable, NestInterceptor, Param, Post, Query, Req, Res, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { diskStorage } from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import { extname } from "node:path";
import type { Response } from "express";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { AuthenticatedRequest, JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CommercialAdminGuard } from "./commercial-admin.guard";
import { advertisingStorageRoot, CommercialMediaService } from "./commercial-media.service";
import { AD_PLACEMENT_SPECS } from "./advertising-specs";
import { catchError } from "rxjs/operators";

class UploadAdvertisingMediaDto {
  @IsOptional() @IsString() @MaxLength(64) partnerId?: string;
}

@Injectable()
class AdvertisingUploadCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(catchError(async (error: unknown) => {
      const files = context.switchToHttp().getRequest<{ files?: Express.Multer.File[] }>().files ?? [];
      await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
      throw error;
    }));
  }
}

@Controller("commercial")
@UseGuards(JwtAuthGuard)
export class CommercialMediaController {
  constructor(private readonly media: CommercialMediaService) {}

  @Get("specs") specs() { return { placements: AD_PLACEMENT_SPECS }; }

  @Get("admin/media")
  @UseGuards(CommercialAdminGuard)
  list(@Query("partnerId") partnerId?: string) { return this.media.list(partnerId); }

  @Post("admin/media")
  @UseGuards(CommercialAdminGuard)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @UseInterceptors(AdvertisingUploadCleanupInterceptor, FilesInterceptor("files", 6, {
    storage: diskStorage({
      destination: (_req, _file, cb) => { const directory = advertisingStorageRoot(); void mkdir(directory, { recursive: true }).then(() => cb(null, directory)).catch((error: Error) => cb(error, directory)); },
      filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { files: 6, fileSize: 25 * 1024 * 1024, fields: 1, fieldSize: 256 },
    fileFilter: (_req, file, cb) => {
      const allowed: Record<string, string[]> = { ".jpg": ["image/jpeg"], ".jpeg": ["image/jpeg"], ".png": ["image/png"], ".webp": ["image/webp"], ".mp4": ["video/mp4"] };
      if (!allowed[extname(file.originalname).toLowerCase()]?.includes(file.mimetype)) return cb(new BadRequestException("Envie JPG, PNG, WebP ou MP4 H.264."), false);
      cb(null, true);
    },
  }))
  upload(@Req() req: AuthenticatedRequest, @UploadedFiles() files: Express.Multer.File[], @Body() body: UploadAdvertisingMediaDto) { return this.media.upload(req.user.sub, files, body.partnerId); }

  @Get("media/:id")
  async stream(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Headers("range") range: string | undefined, @Res({ passthrough: true }) response: Response) {
    const media = await this.media.open(req.user, id, range);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (media.unsatisfiable) { response.status(416); response.setHeader("Content-Range", `bytes */${media.total}`); return; }
    response.setHeader("Content-Type", media.mimeType);
    response.setHeader("Content-Length", media.size);
    response.setHeader("Accept-Ranges", "bytes");
    if (media.contentRange) { response.status(206); response.setHeader("Content-Range", media.contentRange); }
    return new StreamableFile(media.stream);
  }
}
