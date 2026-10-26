import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { diskStorage } from "multer";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, stat, unlink } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { Response } from "express";
import { AuthenticatedRequest, JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ChatGateway } from "../chat/chat.gateway";
import { CommunityService } from "./community.service";
import { CreatePostDto } from "./dto/create-post.dto";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { DecideFollowDto } from "./dto/community-action.dto";
import { CreateStoryDto } from "./dto/create-story.dto";
import { CreateGroupDto } from "./dto/create-group.dto";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdatePostDto } from "./dto/update-post.dto";

@Controller("community")
@UseGuards(JwtAuthGuard)
export class CommunityController {
  constructor(private readonly community: CommunityService, private readonly realtime: ChatGateway) {}

  @Post("media")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @UseInterceptors(FilesInterceptor("files", 6, {
    storage: diskStorage({
      destination: (req, _file, cb) => {
        const userId = (req as AuthenticatedRequest).user.sub;
        const directory = join(process.env.MEDIA_STORAGE_DIR ?? join(process.cwd(), "storage"), userId);
        void mkdir(directory, { recursive: true }).then(() => cb(null, directory)).catch((error) => cb(error, directory));
      },
      filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { files: 6, fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      const allowed: Record<string, string[]> = { ".jpg": ["image/jpeg"], ".jpeg": ["image/jpeg"], ".png": ["image/png"], ".webp": ["image/webp"], ".mp4": ["video/mp4"], ".webm": ["video/webm"] };
      if (!allowed[ext]?.includes(file.mimetype)) return cb(new BadRequestException("Formato de mídia não permitido."), false);
      cb(null, true);
    },
  }))
  async upload(@Req() req: AuthenticatedRequest, @UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException("Selecione pelo menos uma imagem ou vídeo.");
    for (const file of files) {
      const tooLarge = file.size > (file.mimetype.startsWith("video/") ? 25 : 8) * 1024 * 1024;
      const handle = await open(file.path, "r"); const header = Buffer.alloc(12); await handle.read(header, 0, 12, 0); await handle.close();
      const ext = extname(file.filename).toLowerCase();
      const validSignature = ext === ".jpg" || ext === ".jpeg" ? header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff : ext === ".png" ? header.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) : ext === ".webp" ? header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP" : ext === ".mp4" ? header.toString("ascii", 4, 8) === "ftyp" : header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
      if (tooLarge || !validSignature) { await Promise.all(files.map((uploaded) => unlink(uploaded.path).catch(() => undefined))); throw new BadRequestException(tooLarge ? "Arquivo excede o limite de tamanho permitido." : "O conteúdo do arquivo não corresponde ao formato declarado."); }
    }
    return files.map((file) => ({ key: `${req.user.sub}/${file.filename}`, type: file.mimetype.startsWith("video/") ? "VIDEO" : "IMAGE", mimeType: file.mimetype, sizeBytes: file.size, url: `/api/community/media/${req.user.sub}/${file.filename}` }));
  }

  @Get("media/:ownerId/:fileName")
  async media(@Req() req: AuthenticatedRequest, @Param("ownerId") ownerId: string, @Param("fileName") fileName: string, @Res({ passthrough: true }) response: Response) {
    if (!/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|mp4|webm)$/i.test(fileName) || !await this.community.canReadMedia(req.user.sub, `${ownerId}/${fileName}`)) throw new BadRequestException("Mídia não encontrada.");
    const root = resolve(process.env.MEDIA_STORAGE_DIR ?? join(process.cwd(), "storage"));
    const file = resolve(root, ownerId, fileName);
    if (!await stat(file).then((info) => info.isFile()).catch(() => false)) throw new BadRequestException("Mídia não encontrada.");
    response.setHeader("Content-Type", ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", webm: "video/webm" } as Record<string, string>)[extname(fileName).slice(1).toLowerCase()] ?? "application/octet-stream");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(createReadStream(file));
  }

  @Get("feed") feed(@Req() req: AuthenticatedRequest, @Query("mode") mode?: string, @Query("cursor") cursor?: string, @Query("limit") limit?: string, @Query("q") q?: string) {
    return this.community.feed(req.user.sub, { mode, cursor, limit: Number(limit) || 20, q });
  }

  @Post("posts")
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async createPost(@Req() req: AuthenticatedRequest, @Body() body: CreatePostDto) {
    const post = await this.community.createPost(req.user.sub, body);
    const audience = await this.community.postAudience(post.id);
    this.realtime.publishSocial("feed:post:created", { postId: post.id, createdAt: post.createdAt.toISOString() }, audience);
    return post;
  }

  @Get("posts/:postId") post(@Req() req: AuthenticatedRequest, @Param("postId") postId: string) { return this.community.postById(req.user.sub, postId); }

  @Delete("posts/:postId") async deletePost(@Req() req: AuthenticatedRequest, @Param("postId") postId: string) {
    const audience = await this.community.postAudience(postId);
    const result = await this.community.deletePost(req.user.sub, postId);
    this.realtime.publishSocial("feed:post:deleted", { postId }, audience);
    return result;
  }

  @Patch("posts/:postId") async updatePost(@Req() req: AuthenticatedRequest, @Param("postId") postId: string, @Body() body: UpdatePostDto) {
    const result = await this.community.updatePost(req.user.sub, postId, body.body);
    const audience = await this.community.postAudience(postId);
    this.realtime.publishSocial("feed:post:updated", { postId, updatedAt: result.updatedAt.toISOString() }, audience);
    return result;
  }

  @Post("posts/:postId/like")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async like(@Req() req: AuthenticatedRequest, @Param("postId") postId: string) {
    const result = await this.community.toggleLike(req.user.sub, postId);
    this.realtime.publishSocial("feed:reaction:updated", { postId, likesCount: result.count }, [result.authorId, req.user.sub]);
    return { liked: result.liked, count: result.count };
  }

  @Post("posts/:postId/save") save(@Req() req: AuthenticatedRequest, @Param("postId") postId: string) { return this.community.toggleSave(req.user.sub, postId); }

  @Get("posts/:postId/comments") comments(@Req() req: AuthenticatedRequest, @Param("postId") postId: string, @Query("cursor") cursor?: string) {
    return this.community.comments(req.user.sub, postId, cursor);
  }

  @Post("posts/:postId/comments")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async comment(@Req() req: AuthenticatedRequest, @Param("postId") postId: string, @Body() body: CreateCommentDto) {
    const comment = await this.community.createComment(req.user.sub, postId, body);
    const audience = await this.community.postAudience(postId);
    this.realtime.publishSocial("feed:comment:created", { postId, commentId: comment.id, createdAt: comment.createdAt.toISOString() }, audience);
    return comment;
  }

  @Patch("comments/:commentId") async editComment(@Req() req: AuthenticatedRequest, @Param("commentId") commentId: string, @Body() body: UpdatePostDto) {
    return this.community.editComment(req.user.sub, commentId, body.body);
  }

  @Delete("comments/:commentId") async deleteComment(@Req() req: AuthenticatedRequest, @Param("commentId") commentId: string) {
    const result = await this.community.deleteComment(req.user.sub, commentId);
    const audience = await this.community.postAudience(result.postId);
    this.realtime.publishSocial("feed:comment:deleted", { postId: result.postId, commentId }, audience);
    return { success: result.success };
  }

  @Post("comments/:commentId/like") likeComment(@Req() req: AuthenticatedRequest, @Param("commentId") commentId: string) { return this.community.toggleCommentLike(req.user.sub, commentId); }

  @Post("pets/:petId/follow")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async follow(@Req() req: AuthenticatedRequest, @Param("petId") petId: string) {
    const result = await this.community.toggleFollow(req.user.sub, petId);
    const { ownerId, ...publicResult } = result;
    this.realtime.publishSocial("social:follow:updated", { petId, followerId: req.user.sub, ...publicResult }, [req.user.sub]);
    if (ownerId) await this.realtime.publishNotification(ownerId, petId, "FOLLOW");
    return publicResult;
  }

  @Get("follow-requests") requests(@Req() req: AuthenticatedRequest) { return this.community.followRequests(req.user.sub); }
  @Get("following") following(@Req() req: AuthenticatedRequest) { return this.community.following(req.user.sub); }
  @Get("my-followers") myFollowers(@Req() req: AuthenticatedRequest) { return this.community.myFollowers(req.user.sub); }
  @Get("suggestions") suggestions(@Req() req: AuthenticatedRequest) { return this.community.suggestions(req.user.sub); }
  @Get("trending-hashtags") trendingHashtags() { return this.community.trendingHashtags(); }
  @Get("pets/:petId/followers") followers(@Req() req: AuthenticatedRequest, @Param("petId") petId: string) { return this.community.followers(req.user.sub, petId); }
  @Get("pets/:petId/social") petSocial(@Req() req: AuthenticatedRequest, @Param("petId") petId: string) { return this.community.petSocialSummary(req.user.sub, petId); }

  @Patch("follow-requests/:id") decide(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: DecideFollowDto) {
    return this.community.decideFollowRequest(req.user.sub, id, body.accept);
  }

  @Get("stories") stories(@Req() req: AuthenticatedRequest) { return this.community.stories(req.user.sub); }

  @Post("stories")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createStory(@Req() req: AuthenticatedRequest, @Body() body: CreateStoryDto) {
    const story = await this.community.createStory(req.user.sub, body);
    const audience = await this.community.storyAudience(story.id);
    this.realtime.publishSocial("story:created", { storyId: story.id, createdAt: story.createdAt.toISOString() }, audience);
    return story;
  }

  @Post("stories/:id/view") viewStory(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.community.viewStory(req.user.sub, id); }

  @Get("groups") groups(@Req() req: AuthenticatedRequest) { return this.community.groups(req.user.sub); }

  @Post("groups") createGroup(@Req() req: AuthenticatedRequest, @Body() body: CreateGroupDto) { return this.community.createGroup(req.user.sub, body); }

  @Post("groups/:id/join") joinGroup(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.community.joinGroup(req.user.sub, id); }

  @Delete("groups/:id/membership") leaveGroup(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.community.leaveGroup(req.user.sub, id); }

  @Get("groups/:id/posts") groupPosts(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Query("cursor") cursor?: string) { return this.community.groupPosts(req.user.sub, id, cursor); }

  @Post("groups/:id/posts") async createGroupPost(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdatePostDto) {
    const { post, audience } = await this.community.createGroupPost(req.user.sub, id, body.body);
    this.realtime.publishSocial("group:post:created", { groupId: id, postId: post.id, createdAt: post.createdAt.toISOString() }, audience);
    return post;
  }

  @Get("events") events(@Req() req: AuthenticatedRequest) { return this.community.events(req.user.sub); }

  @Post("events") async createEvent(@Req() req: AuthenticatedRequest, @Body() body: CreateEventDto) {
    const event = await this.community.createEvent(req.user.sub, body);
    this.realtime.publishSocial("event:updated", { eventId: event.id, updatedAt: event.updatedAt.toISOString() }, [req.user.sub]);
    return event;
  }

  @Patch("events/:id") async updateEvent(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: CreateEventDto) {
    const event = await this.community.updateEvent(req.user.sub, id, body);
    this.realtime.publishSocial("event:updated", { eventId: id, updatedAt: event.updatedAt.toISOString() }, [req.user.sub]);
    return event;
  }

  @Delete("events/:id") async cancelEvent(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const result = await this.community.cancelEvent(req.user.sub, id);
    this.realtime.publishSocial("event:updated", { eventId: id, cancelled: true }, [req.user.sub]);
    return result;
  }

  @Post("events/:id/attend") async attend(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const result = await this.community.attendEvent(req.user.sub, id);
    this.realtime.publishSocial("event:updated", { eventId: id, participantsCount: result.count }, [req.user.sub, result.organizerId]);
    const { organizerId: _organizerId, ...publicResult } = result;
    return publicResult;
  }

  @Delete("events/:id/attendance") async leaveEvent(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const result = await this.community.leaveEvent(req.user.sub, id);
    this.realtime.publishSocial("event:updated", { eventId: id }, [req.user.sub, ...((result as { promotedUserId?: string | null }).promotedUserId ? [(result as { promotedUserId: string }).promotedUserId] : [])]);
    return result;
  }
}
