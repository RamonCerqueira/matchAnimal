import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { stat, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { ModerationStatus, PostKind, PostVisibility } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CommunityService implements OnModuleInit, OnModuleDestroy {
  private storyCleanupTimer?: ReturnType<typeof setInterval>;
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.cleanupExpiredStories();
    this.storyCleanupTimer = setInterval(() => void this.cleanupExpiredStories(), 60 * 60 * 1000);
    this.storyCleanupTimer.unref?.();
  }

  onModuleDestroy() { if (this.storyCleanupTimer) clearInterval(this.storyCleanupTimer); }

  private async cleanupExpiredStories() {
    const now = new Date();
    const expired = await this.prisma.story.findMany({ where: { expiresAt: { lte: now } }, take: 200, orderBy: { expiresAt: "asc" }, select: { id: true, mediaKey: true } }).catch(() => []);
    if (!expired.length) return;
    await this.prisma.story.deleteMany({ where: { id: { in: expired.map(({ id }) => id) }, expiresAt: { lte: now } } });
    const root = resolve(process.env.MEDIA_STORAGE_DIR ?? join(process.cwd(), "storage"));
    for (const { mediaKey } of expired) {
      const [ownerId, fileName] = mediaKey.split("/");
      if (!ownerId || !/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|mp4|webm)$/i.test(fileName ?? "")) continue;
      const absolute = resolve(root, ownerId, fileName);
      const fromRoot = relative(root, absolute);
      if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) continue;
      const [photo, post, anotherStory] = await Promise.all([
        this.prisma.petPhoto.findFirst({ where: { storageKey: mediaKey }, select: { id: true } }),
        this.prisma.postMedia.findFirst({ where: { storageKey: mediaKey }, select: { id: true } }),
        this.prisma.story.findFirst({ where: { mediaKey }, select: { id: true } }),
      ]);
      if (!photo && !post && !anotherStory) await unlink(absolute).catch(() => undefined);
    }
  }

  private async assertPostAccess(userId: string, postId: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true, authorId: true, petId: true, visibility: true, moderation: true } });
    if (!post || post.moderation === "REMOVED") throw new NotFoundException("Publicação não encontrada.");
    if (post.authorId === userId) return post;
    const block = await this.prisma.userBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: post.authorId }, { blockerId: post.authorId, blockedId: userId }] }, select: { id: true } });
    if (block) throw new NotFoundException("Publicação não encontrada.");
    if (post.visibility === PostVisibility.PRIVATE) throw new NotFoundException("Publicação não encontrada.");
    if (post.visibility === PostVisibility.FOLLOWERS) {
      if (!post.petId || !await this.prisma.petFollower.findUnique({ where: { petId_followerId: { petId: post.petId, followerId: userId } }, select: { id: true } })) throw new ForbiddenException("Siga o perfil para ver esta publicação.");
    }
    if (post.moderation !== ModerationStatus.APPROVED) throw new NotFoundException("Publicação não encontrada.");
    return post;
  }

  async feed(userId: string, options: { mode?: string; cursor?: string; limit?: number; q?: string; postId?: string }) {
    const take = Math.min(Math.max(options.limit ?? 20, 1), 40);
    const term = options.q?.trim().slice(0, 80);
    const cursorPost = options.cursor ? await this.prisma.communityPost.findUnique({ where: { id: options.cursor }, select: { id: true, createdAt: true } }) : null;
    if (options.cursor && !cursorPost) throw new BadRequestException("Cursor inválido.");
    const blocks = await this.prisma.userBlock.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } });
    const excluded = [...new Set(blocks.flatMap((block) => [block.blockerId, block.blockedId]))];
    const followedPetIds = (await this.prisma.petFollower.findMany({ where: { followerId: userId }, select: { petId: true } })).map(({ petId }) => petId);
    const followedOwners = (await this.prisma.pet.findMany({ where: { id: { in: followedPetIds } }, select: { ownerId: true } })).map(({ ownerId }) => ownerId);
    const followedUserIds = [...new Set([userId, ...followedOwners])];
    const tutor = options.mode === "nearby" ? await this.prisma.tutorProfile.findUnique({ where: { userId }, select: { city: true, state: true } }) : null;
    if (options.mode === "nearby" && !tutor?.city) return { items: [], nextCursor: null };
    const searchFilter = term ? [{ OR: [
      { body: { contains: term, mode: "insensitive" as const } },
      { pet: { name: { contains: term, mode: "insensitive" as const } } },
      { pet: { breed: { contains: term, mode: "insensitive" as const } } },
      { author: { tutor: { displayName: { contains: term, mode: "insensitive" as const } } } },
      { hashtags: { some: { hashtag: { name: { contains: term.replace(/^#/, "").toLocaleLowerCase("pt-BR"), mode: "insensitive" as const } } } } },
    ] }] : [];
    const where = {
      moderation: ModerationStatus.APPROVED,
      ...(options.postId ? { id: options.postId } : {}),
      authorId: { notIn: excluded },
      AND: [
        ...(cursorPost ? [{ OR: [{ createdAt: { lt: cursorPost.createdAt } }, { createdAt: cursorPost.createdAt, id: { lt: cursorPost.id } }] }] : []),
        ...searchFilter,
        { OR: [
        { visibility: PostVisibility.PUBLIC },
        { visibility: PostVisibility.FOLLOWERS, petId: { in: followedPetIds } },
        { visibility: PostVisibility.PRIVATE, authorId: userId },
        ] },
        ...(options.mode === "following" ? [{ OR: [{ petId: { in: followedPetIds } }, { authorId: { in: followedUserIds } }] }] : []),
        ...(options.mode === "nearby" && tutor?.city ? [{ pet: { city: { equals: tutor.city, mode: "insensitive" as const }, state: tutor.state ?? undefined } }] : []),
        ...(options.mode === "saved" ? [{ saves: { some: { userId } } }] : []),
      ],
    };
    const posts = await this.prisma.communityPost.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: take + 1, select: {
      id: true, body: true, kind: true, visibility: true, locationLabel: true, createdAt: true, authorId: true,
      author: { select: { id: true, tutor: { select: { displayName: true, profilePhotoUrl: true, isPublic: true } } } },
      pet: { select: { id: true, name: true, species: true, breed: true, coverPhotoUrl: true, isPublic: true, followers: { where: { followerId: userId }, select: { id: true }, take: 1 }, _count: { select: { followers: true } } } },
      media: { orderBy: { sortOrder: "asc" }, select: { id: true, storageKey: true, mediaType: true, mimeType: true, sizeBytes: true } },
      _count: { select: { likes: true, comments: true } }, likes: { where: { userId }, select: { id: true }, take: 1 }, saves: { where: { userId }, select: { id: true }, take: 1 },
    } });
    const hasMore = posts.length > take;
    const data = posts.slice(0, take).map(({ likes, saves, ...post }) => {
      const pet = post.pet?.isPublic ? (({ followers, _count, isPublic: _ignored, ...profile }) => ({ ...profile, followedByMe: followers.length > 0, followerCount: _count.followers }))(post.pet) : null;
      const author = post.author.tutor?.isPublic ? post.author : { ...post.author, tutor: null };
      return { ...post, author, pet, likedByMe: likes.length > 0, savedByMe: saves.length > 0 };
    });
    return { items: data, nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null };
  }

  async postById(userId: string, postId: string) {
    const result = await this.feed(userId, { postId, limit: 1 });
    if (!result.items.length) throw new NotFoundException("Publicação não encontrada.");
    return result.items[0];
  }

  async createPost(userId: string, input: { body: string; petId?: string; kind?: PostKind; visibility?: PostVisibility; locationLabel?: string; mediaKeys?: string[] }) {
    const body = input.body.trim();
    if (!body) throw new BadRequestException("Escreva algo antes de publicar.");
    if (input.petId) {
      const pet = await this.prisma.pet.findFirst({ where: { id: input.petId, ownerId: userId, isActive: true }, select: { id: true } });
      if (!pet) throw new ForbiddenException("Você só pode publicar em nome de um animal seu.");
    }
    if (input.visibility === PostVisibility.FOLLOWERS && !input.petId) throw new BadRequestException("Selecione um animal para limitar a publicação aos seguidores.");
    const keys = [...new Set(input.mediaKeys ?? [])];
    if (keys.length > 6 || keys.some((key) => !key.startsWith(`${userId}/`) || key.includes(".."))) throw new BadRequestException("Anexos inválidos.");
    const media = await Promise.all(keys.map(async (storageKey, sortOrder) => {
      const fileName = storageKey.split("/")[1] ?? "";
      if (!/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|mp4|webm)$/i.test(fileName)) throw new BadRequestException("Anexo inválido.");
      const absolute = resolve(process.env.MEDIA_STORAGE_DIR ?? join(process.cwd(), "storage"), userId, fileName);
      const root = resolve(process.env.MEDIA_STORAGE_DIR ?? join(process.cwd(), "storage"), userId);
      const fromRoot = relative(root, absolute);
      if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new BadRequestException("Anexo inválido.");
      const info = await stat(absolute).catch(() => null);
      if (!info?.isFile()) throw new BadRequestException("Anexo não encontrado.");
      const video = /\.(mp4|webm)$/i.test(fileName);
      if (info.size > (video ? 25 : 8) * 1024 * 1024) throw new BadRequestException("Anexo excede o limite de tamanho.");
      const extension = fileName.split(".").pop()!.toLowerCase();
      const mimeType: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", webm: "video/webm" };
      return { storageKey, mediaType: video ? "VIDEO" : "IMAGE", mimeType: mimeType[extension], sizeBytes: info.size, sortOrder };
    }));
    const post = await this.prisma.communityPost.create({ data: { authorId: userId, petId: input.petId, body, kind: input.kind, visibility: input.visibility ?? PostVisibility.PUBLIC, locationLabel: input.locationLabel, moderation: ModerationStatus.APPROVED, media: { create: media } }, select: { id: true, authorId: true, petId: true, createdAt: true } });
    await this.linkHashtags(post.id, body);
    return post;
  }

  private async linkHashtags(postId: string, body: string) {
    const tags = [...new Set([...body.matchAll(/(?:^|\s)#([\p{L}\p{N}_]{2,50})/gu)].map((match) => match[1].toLocaleLowerCase("pt-BR")))].slice(0, 10);
    for (const name of tags) {
      const hashtag = await this.prisma.hashtag.upsert({ where: { name }, create: { name }, update: {}, select: { id: true } });
      await this.prisma.postHashtag.createMany({ data: [{ postId, hashtagId: hashtag.id }], skipDuplicates: true });
    }
  }

  async deletePost(userId: string, postId: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!post) throw new NotFoundException("Publicação não encontrada.");
    if (post.authorId !== userId) throw new ForbiddenException("Você não pode excluir esta publicação.");
    await this.prisma.communityPost.delete({ where: { id: postId } });
    return { success: true };
  }

  async updatePost(userId: string, postId: string, body: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!post) throw new NotFoundException("Publicação não encontrada.");
    if (post.authorId !== userId) throw new ForbiddenException("Você não pode editar esta publicação.");
    const text = body?.trim();
    if (!text || text.length > 2000) throw new BadRequestException("Texto da publicação inválido.");
    return this.prisma.communityPost.update({ where: { id: postId }, data: { body: text }, select: { id: true, updatedAt: true } });
  }

  async toggleLike(userId: string, postId: string) {
    const post = await this.assertPostAccess(userId, postId);
    const key = { postId_userId: { postId, userId } };
    const existing = await this.prisma.postLike.findUnique({ where: key, select: { id: true } });
    if (existing) {
      await this.prisma.postLike.delete({ where: key });
    } else {
      await this.prisma.postLike.create({ data: { postId, userId } });
      if (post.authorId !== userId) {
        await this.prisma.notification.create({
          data: { recipientId: post.authorId, actorId: userId, type: "LIKE", entityId: postId },
        }).catch(() => undefined);
      }
    }
    const count = await this.prisma.postLike.count({ where: { postId } });
    return { postId, liked: !existing, count, authorId: post.authorId };
  }

  async toggleSave(userId: string, postId: string) {
    await this.assertPostAccess(userId, postId);
    const where = { postId_userId: { postId, userId } };
    const existing = await this.prisma.savedPost.findUnique({ where, select: { id: true } });
    if (existing) await this.prisma.savedPost.delete({ where });
    else await this.prisma.savedPost.create({ data: { postId, userId } });
    return { saved: !existing };
  }

  async comments(userId: string, postId: string, cursor?: string) {
    await this.assertPostAccess(userId, postId);
    const before = cursor ? await this.prisma.postComment.findUnique({ where: { id: cursor }, select: { id: true, createdAt: true } }) : null;
    if (cursor && !before) throw new BadRequestException("Cursor inválido.");
    const comments = await this.prisma.postComment.findMany({ where: { postId, parentId: null, moderation: ModerationStatus.APPROVED, ...(before ? { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, select: { id: true, body: true, createdAt: true, authorId: true, author: { select: { tutor: { select: { displayName: true, profilePhotoUrl: true, isPublic: true } } } }, _count: { select: { replies: true, likes: true } } } });
    return comments.map((comment) => ({ ...comment, author: comment.author.tutor?.isPublic ? comment.author : { tutor: null } }));
  }

  async createComment(userId: string, postId: string, input: { body: string; parentId?: string }) {
    await this.assertPostAccess(userId, postId);
    const body = input.body.trim();
    if (!body) throw new BadRequestException("Escreva um comentário.");
    if (input.parentId) {
      const parent = await this.prisma.postComment.findFirst({ where: { id: input.parentId, postId, moderation: ModerationStatus.APPROVED }, select: { id: true, parentId: true } });
      if (!parent || parent.parentId) throw new BadRequestException("Resposta inválida.");
    }
    const comment = await this.prisma.postComment.create({ data: { postId, authorId: userId, body, parentId: input.parentId }, select: { id: true, postId: true, authorId: true, parentId: true, body: true, createdAt: true } });
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (post && post.authorId !== userId) {
      await this.prisma.notification.create({
        data: { recipientId: post.authorId, actorId: userId, type: "CONNECTION_UPDATE", entityId: postId },
      }).catch(() => undefined);
    }
    return comment;
  }

  async editComment(userId: string, commentId: string, body: string) {
    const comment = await this.prisma.postComment.findUnique({ where: { id: commentId }, select: { authorId: true, postId: true } });
    if (!comment) throw new NotFoundException("Comentário não encontrado.");
    if (comment.authorId !== userId) throw new ForbiddenException("Você não pode editar este comentário.");
    await this.assertPostAccess(userId, comment.postId);
    const text = body?.trim(); if (!text || text.length > 1200) throw new BadRequestException("Comentário inválido.");
    return this.prisma.postComment.update({ where: { id: commentId }, data: { body: text }, select: { id: true, postId: true, body: true, updatedAt: true } });
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.postComment.findUnique({ where: { id: commentId }, select: { authorId: true, postId: true, post: { select: { authorId: true } } } });
    if (!comment) throw new NotFoundException("Comentário não encontrado.");
    if (comment.authorId !== userId && comment.post.authorId !== userId) throw new ForbiddenException("Você não pode remover este comentário.");
    await this.prisma.postComment.delete({ where: { id: commentId } });
    return { success: true, postId: comment.postId };
  }

  async toggleCommentLike(userId: string, commentId: string) {
    const comment = await this.prisma.postComment.findFirst({ where: { id: commentId, moderation: ModerationStatus.APPROVED }, select: { id: true, postId: true } });
    if (!comment) throw new NotFoundException("Comentário não encontrado.");
    await this.assertPostAccess(userId, comment.postId);
    const where = { commentId_userId: { commentId, userId } };
    const exists = await this.prisma.commentLike.findUnique({ where, select: { id: true } });
    if (exists) await this.prisma.commentLike.delete({ where }); else await this.prisma.commentLike.create({ data: { commentId, userId } });
    return { liked: !exists, count: await this.prisma.commentLike.count({ where: { commentId } }) };
  }

  async toggleFollow(userId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, isActive: true, isPublic: true }, select: { id: true, ownerId: true, owner: { select: { tutor: { select: { isPublic: true, notificationOptIn: true } } } } } });
    if (!pet) throw new NotFoundException("Perfil não encontrado.");
    if (pet.ownerId === userId) throw new BadRequestException("Você não pode seguir seu próprio animal.");
    const blocked = await this.prisma.userBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: pet.ownerId }, { blockerId: pet.ownerId, blockedId: userId }] }, select: { id: true } });
    if (blocked) throw new NotFoundException("Perfil não encontrado.");
    const key = { petId_followerId: { petId, followerId: userId } };
    const followed = await this.prisma.petFollower.findUnique({ where: key, select: { id: true } });
    if (followed) { await this.prisma.petFollower.delete({ where: key }); return { followed: false, requested: false, count: await this.prisma.petFollower.count({ where: { petId } }) }; }
    if (!pet.owner.tutor?.isPublic) {
      await this.prisma.followRequest.upsert({ where: { petId_requesterId: { petId, requesterId: userId } }, create: { petId, requesterId: userId, ownerId: pet.ownerId }, update: { status: "PENDING" } });
      if (pet.owner.tutor?.notificationOptIn) await this.prisma.notification.create({ data: { recipientId: pet.ownerId, actorId: userId, type: "FOLLOW", entityId: petId } });
      return { followed: false, requested: true, ownerId: pet.ownerId, count: await this.prisma.petFollower.count({ where: { petId } }) };
    }
    await this.prisma.petFollower.create({ data: { petId, followerId: userId } });
    if (pet.owner.tutor?.notificationOptIn) await this.prisma.notification.create({ data: { recipientId: pet.ownerId, actorId: userId, type: "FOLLOW", entityId: petId } });
    return { followed: true, requested: false, ownerId: pet.ownerId, count: await this.prisma.petFollower.count({ where: { petId } }) };
  }

  async followRequests(userId: string) {
    return this.prisma.followRequest.findMany({ where: { ownerId: userId, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, petId: true, requesterId: true, createdAt: true, pet: { select: { name: true } }, requester: { select: { tutor: { select: { displayName: true } } } } } });
  }

  async followers(userId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, isActive: true, isPublic: true }, select: { ownerId: true, owner: { select: { tutor: { select: { isPublic: true } } } } } });
    if (!pet) throw new NotFoundException("Perfil não encontrado.");
    if (pet.ownerId !== userId && !pet.owner.tutor?.isPublic) throw new NotFoundException("Perfil não encontrado.");
    const blocked = await this.prisma.userBlock.findMany({ where: { OR: [{ blockerId: userId, blockedId: pet.ownerId }, { blockedId: userId, blockerId: pet.ownerId }] }, select: { id: true } });
    if (blocked.length && pet.ownerId !== userId) throw new NotFoundException("Perfil não encontrado.");
    return this.prisma.petFollower.findMany({ where: { petId, follower: { NOT: { OR: [{ blocksMade: { some: { blockedId: pet.ownerId } } }, { blocksReceived: { some: { blockerId: pet.ownerId } } }] } } }, orderBy: { createdAt: "desc" }, take: 50, select: { createdAt: true, follower: { select: { id: true, tutor: { select: { displayName: true, profilePhotoUrl: true, isPublic: true } } } } } }).then((rows) => rows.map(({ createdAt, follower }) => ({ createdAt, follower: follower.tutor?.isPublic ? follower : { id: follower.id, tutor: null } })));
  }

  async myFollowers(userId: string) {
    const myPets = await this.prisma.pet.findMany({
      where: { ownerId: userId, isActive: true },
      select: { id: true, name: true, species: true, breed: true, coverPhotoUrl: true },
    });
    const myPetIds = myPets.map((p) => p.id);
    if (!myPetIds.length) {
      return { pets: [], followers: [], totalCount: 0 };
    }

    const blocked = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const excluded = new Set(blocked.flatMap(({ blockerId, blockedId }) => [blockerId, blockedId]));

    const rows = await this.prisma.petFollower.findMany({
      where: {
        petId: { in: myPetIds },
        followerId: { notIn: Array.from(excluded) },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        createdAt: true,
        petId: true,
        pet: {
          select: { id: true, name: true, species: true, coverPhotoUrl: true },
        },
        follower: {
          select: {
            id: true,
            tutor: {
              select: { displayName: true, profilePhotoUrl: true, city: true, state: true, isPublic: true },
            },
            pets: {
              where: { isActive: true, isPublic: true },
              select: { id: true, name: true, species: true, breed: true, coverPhotoUrl: true },
              take: 3,
            },
          },
        },
      },
    });

    return {
      pets: myPets,
      totalCount: rows.length,
      followers: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        targetPet: r.pet,
        follower: {
          id: r.follower.id,
          displayName: r.follower.tutor?.displayName ?? "Tutor MatchAnimal",
          profilePhotoUrl: r.follower.tutor?.profilePhotoUrl ?? null,
          city: r.follower.tutor?.city ?? null,
          state: r.follower.tutor?.state ?? null,
          pets: r.follower.pets,
        },
      })),
    };
  }

  async petSocialSummary(userId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, isActive: true, isPublic: true }, select: { id: true, ownerId: true, owner: { select: { tutor: { select: { isPublic: true } } } } } });
    if (!pet || pet.ownerId !== userId && !pet.owner.tutor?.isPublic) throw new NotFoundException("Perfil não encontrado.");
    const blocked = await this.prisma.userBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: pet.ownerId }, { blockerId: pet.ownerId, blockedId: userId }] }, select: { id: true } });
    if (blocked && pet.ownerId !== userId) throw new NotFoundException("Perfil não encontrado.");
    const [followers, posts, following] = await Promise.all([
      this.prisma.petFollower.count({ where: { petId } }),
      this.prisma.communityPost.count({ where: { petId, moderation: ModerationStatus.APPROVED, visibility: { not: PostVisibility.PRIVATE } } }),
      this.prisma.petFollower.findUnique({ where: { petId_followerId: { petId, followerId: userId } }, select: { id: true } }),
    ]);
    return { followerCount: followers, postCount: posts, followedByMe: Boolean(following), isOwner: pet.ownerId === userId };
  }

  async following(userId: string) {
    const rows = await this.prisma.petFollower.findMany({ where: { followerId: userId, pet: { isPublic: true, isActive: true } }, orderBy: { createdAt: "desc" }, take: 100, select: { createdAt: true, pet: { select: { id: true, name: true, species: true, breed: true, coverPhotoUrl: true, ownerId: true } } } });
    const blocked = await this.prisma.userBlock.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } });
    const excluded = new Set(blocked.flatMap(({ blockerId, blockedId }) => [blockerId, blockedId]));
    return rows.filter(({ pet }) => !excluded.has(pet.ownerId)).map(({ pet, createdAt }) => ({ ...pet, createdAt }));
  }

  async decideFollowRequest(userId: string, requestId: string, accept: boolean) {
    const request = await this.prisma.followRequest.findFirst({ where: { id: requestId, ownerId: userId, status: "PENDING" }, select: { id: true, petId: true, requesterId: true } });
    if (!request) throw new NotFoundException("Solicitação não encontrada.");
    await this.prisma.$transaction(async (tx) => {
      if (accept) await tx.petFollower.upsert({ where: { petId_followerId: { petId: request.petId, followerId: request.requesterId } }, create: { petId: request.petId, followerId: request.requesterId }, update: {} });
      await tx.followRequest.delete({ where: { id: request.id } });
    });
    return { success: true, accepted: accept };
  }

  async suggestions(userId: string) {
    const blocks = await this.prisma.userBlock.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } });
    const excluded = [...new Set([userId, ...blocks.flatMap((b) => [b.blockerId, b.blockedId])])];
    const followedPetIds = (await this.prisma.petFollower.findMany({ where: { followerId: userId }, select: { petId: true } })).map(({ petId }) => petId);
    const tutor = await this.prisma.tutorProfile.findUnique({ where: { userId }, select: { city: true, state: true } });

    const pets = await this.prisma.pet.findMany({
      where: {
        isActive: true,
        isPublic: true,
        ownerId: { notIn: excluded },
        id: { notIn: followedPetIds },
      },
      orderBy: [
        { followers: { _count: "desc" } },
        { createdAt: "desc" },
      ],
      take: 6,
      select: {
        id: true,
        name: true,
        species: true,
        breed: true,
        city: true,
        state: true,
        coverPhotoUrl: true,
        owner: {
          select: {
            tutor: {
              select: {
                displayName: true,
                profilePhotoUrl: true,
              },
            },
          },
        },
        _count: {
          select: { followers: true },
        },
      },
    });

    return pets.map((p) => ({
      id: p.id,
      name: p.name,
      species: p.species,
      breed: p.breed,
      city: p.city,
      state: p.state,
      coverPhotoUrl: p.coverPhotoUrl,
      followerCount: p._count.followers,
      tutorName: p.owner?.tutor?.displayName ?? "Tutor",
      tutorPhotoUrl: p.owner?.tutor?.profilePhotoUrl ?? null,
    }));
  }

  async trendingHashtags() {
    const hashtags = await this.prisma.hashtag.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: { posts: true },
        },
      },
      orderBy: {
        posts: {
          _count: "desc",
        },
      },
      take: 8,
    });

    const defaults = ["passeio", "adocao", "dicaspet", "filhotes", "saudeanimal", "amizadepet"];
    const foundNames = new Set(hashtags.map((h) => h.name.toLowerCase()));
    const result = [...hashtags.map((h) => ({ name: h.name, count: h._count.posts }))];
    for (const d of defaults) {
      if (!foundNames.has(d)) {
        result.push({ name: d, count: Math.floor(Math.random() * 6) + 3 });
      }
    }
    return result.slice(0, 8);
  }

  async postAudience(postId: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId }, select: { authorId: true, petId: true } });
    if (!post) return [];
    const followers = post.petId ? await this.prisma.petFollower.findMany({ where: { petId: post.petId }, select: { followerId: true } }) : [];
    return [post.authorId, ...followers.map(({ followerId }) => followerId)];
  }

  async postCounts(postId: string) {
    const [likes, comments] = await Promise.all([this.prisma.postLike.count({ where: { postId } }), this.prisma.postComment.count({ where: { postId, moderation: ModerationStatus.APPROVED } })]);
    return { likes, comments };
  }

  async canReadMedia(userId: string, key: string) {
    if (!key || key.includes("..") || key.startsWith("/")) return false;
    const [ownerId] = key.split("/");
    if (ownerId === userId) return true;
    const petPhoto = await this.prisma.petPhoto.findFirst({ where: { storageKey: key, moderation: ModerationStatus.APPROVED, pet: { isPublic: true, isActive: true, coverPhotoModeration: ModerationStatus.APPROVED } }, select: { pet: { select: { ownerId: true } } } });
    if (petPhoto) {
      const blocked = await this.prisma.userBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: petPhoto.pet.ownerId }, { blockerId: petPhoto.pet.ownerId, blockedId: userId }] }, select: { id: true } });
      if (!blocked) return true;
    }
    const profilePhoto = await this.prisma.tutorProfile.findFirst({ where: { userId: ownerId, isPublic: true, profilePhotoUrl: { endsWith: `/api/community/media/${key}` } }, select: { userId: true } });
    if (profilePhoto) {
      const blocked = await this.prisma.userBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: ownerId }, { blockerId: ownerId, blockedId: userId }] }, select: { id: true } });
      if (!blocked) return true;
    }
    const postMedia = await this.prisma.postMedia.findFirst({ where: { storageKey: key }, select: { post: { select: { id: true } } } });
    if (postMedia) { try { await this.assertPostAccess(userId, postMedia.post.id); return true; } catch { return false; } }
    const story = await this.prisma.story.findFirst({ where: { mediaKey: key, expiresAt: { gt: new Date() } }, select: { id: true } });
    if (story) { try { await this.viewStory(userId, story.id); return true; } catch { return false; } }
    return false;
  }

  async createStory(userId: string, input: { petId?: string; mediaKey: string; mediaType: "IMAGE" | "VIDEO"; caption?: string; visibility?: PostVisibility }) {
    if (!input.mediaKey.startsWith(`${userId}/`) || input.mediaKey.includes("..")) throw new ForbiddenException("Arquivo de mídia inválido.");
    const storyFileName = input.mediaKey.split("/")[1] ?? "";
    if (!/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|mp4|webm)$/i.test(storyFileName)) throw new BadRequestException("Arquivo de mídia inválido.");
    if ((input.mediaType === "VIDEO") !== (/\.(mp4|webm)$/i.test(storyFileName))) throw new BadRequestException("O tipo do momento não corresponde ao arquivo enviado.");
    const fileRoot = resolve(process.env.MEDIA_STORAGE_DIR ?? join(process.cwd(), "storage"), userId);
    const filePath = resolve(fileRoot, storyFileName);
    const filePathFromRoot = relative(fileRoot, filePath);
    if (!filePathFromRoot || filePathFromRoot.startsWith("..") || isAbsolute(filePathFromRoot) || !await stat(filePath).then((result) => result.isFile()).catch(() => false)) throw new BadRequestException("Arquivo não encontrado.");
    if (input.petId && !await this.prisma.pet.findFirst({ where: { id: input.petId, ownerId: userId }, select: { id: true } })) throw new ForbiddenException("Animal inválido.");
    if (input.mediaType !== "IMAGE" && input.mediaType !== "VIDEO") throw new BadRequestException("Formato de momento inválido.");
    const visibility = input.visibility ?? PostVisibility.FOLLOWERS;
    if (visibility === PostVisibility.FOLLOWERS && !input.petId) throw new BadRequestException("Selecione um animal para compartilhar com os seguidores.");
    const story = await this.prisma.story.create({ data: { authorId: userId, petId: input.petId, mediaKey: input.mediaKey, mediaType: input.mediaType, caption: input.caption?.trim().slice(0, 300), visibility, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }, select: { id: true, authorId: true, petId: true, mediaKey: true, mediaType: true, caption: true, visibility: true, expiresAt: true, createdAt: true } });
    return story;
  }

  async storyAudience(storyId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId }, select: { authorId: true, petId: true, visibility: true } });
    if (!story) return [];
    if (story.visibility === "PRIVATE") return [story.authorId];
    const followers = story.petId ? await this.prisma.petFollower.findMany({ where: { petId: story.petId }, select: { followerId: true } }) : [];
    return [story.authorId, ...(story.visibility === "PUBLIC" ? [] : followers.map(({ followerId }) => followerId))];
  }

  async stories(userId: string) {
    const followedPetIds = (await this.prisma.petFollower.findMany({ where: { followerId: userId }, select: { petId: true } })).map(({ petId }) => petId);
    const blocks = await this.prisma.userBlock.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } });
    const excluded = [...new Set(blocks.flatMap(({ blockerId, blockedId }) => [blockerId, blockedId]))].filter((id) => id !== userId);
    const items = await this.prisma.story.findMany({ where: { expiresAt: { gt: new Date() }, authorId: { notIn: excluded }, OR: [{ authorId: userId }, { visibility: PostVisibility.PUBLIC }, { visibility: PostVisibility.FOLLOWERS, petId: { in: followedPetIds } }] }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, authorId: true, petId: true, mediaKey: true, mediaType: true, caption: true, expiresAt: true, createdAt: true, pet: { select: { id: true, name: true, coverPhotoUrl: true, isPublic: true } }, author: { select: { tutor: { select: { displayName: true, profilePhotoUrl: true, isPublic: true } } } }, views: { where: { viewerId: userId }, select: { id: true }, take: 1 } } });
    return items.map(({ views, ...story }) => ({ ...story, pet: story.pet?.isPublic ? story.pet : null, author: story.author.tutor?.isPublic ? story.author : { tutor: null }, viewedByMe: views.length > 0 }));
  }

  async viewStory(userId: string, storyId: string) {
    const story = await this.prisma.story.findFirst({ where: { id: storyId, expiresAt: { gt: new Date() } }, select: { id: true, authorId: true, petId: true, visibility: true } });
    if (!story) throw new NotFoundException("Momento não encontrado.");
    if (story.authorId !== userId) {
      const allowed = story.visibility === PostVisibility.PUBLIC || (story.visibility === PostVisibility.FOLLOWERS && story.petId && await this.prisma.petFollower.findUnique({ where: { petId_followerId: { petId: story.petId, followerId: userId } }, select: { id: true } }));
      if (!allowed) throw new NotFoundException("Momento não encontrado.");
      const blocked = await this.prisma.userBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: story.authorId }, { blockerId: story.authorId, blockedId: userId }] }, select: { id: true } });
      if (blocked) throw new NotFoundException("Momento não encontrado.");
    }
    await this.prisma.storyView.upsert({ where: { storyId_viewerId: { storyId, viewerId: userId } }, create: { storyId, viewerId: userId }, update: {} });
    return { success: true };
  }

  async groups(userId: string) {
    return this.prisma.communityGroup.findMany({ where: { OR: [{ visibility: "PUBLIC" }, { ownerId: userId }, { members: { some: { userId, approved: true } } }] }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, name: true, slug: true, description: true, visibility: true, ownerId: true, _count: { select: { members: { where: { approved: true } }, posts: true } }, members: { where: { userId }, select: { approved: true } } } });
  }

  async createGroup(userId: string, input: { name: string; description: string; visibility?: "PUBLIC" | "PRIVATE" }) {
    const name = input.name?.trim(); const description = input.description?.trim();
    if (!name || name.length > 100 || !description || description.length > 1000) throw new BadRequestException("Dados do grupo inválidos.");
    const slug = `${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100)}-${Date.now().toString(36)}`;
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.communityGroup.create({ data: { ownerId: userId, name, slug, description, visibility: input.visibility ?? "PUBLIC" } });
      await tx.groupMember.create({ data: { groupId: group.id, userId, role: "ADMIN", approved: true } });
      return group;
    });
  }

  async joinGroup(userId: string, groupId: string) {
    const group = await this.prisma.communityGroup.findUnique({ where: { id: groupId }, select: { id: true, visibility: true } });
    if (!group) throw new NotFoundException("Grupo não encontrado.");
    const approved = group.visibility === "PUBLIC";
    const member = await this.prisma.groupMember.upsert({ where: { groupId_userId: { groupId, userId } }, create: { groupId, userId, approved }, update: { approved } });
    return { joined: member.approved, pendingApproval: !member.approved };
  }

  async leaveGroup(userId: string, groupId: string) {
    const group = await this.prisma.communityGroup.findUnique({ where: { id: groupId }, select: { id: true, ownerId: true } });
    if (!group) throw new NotFoundException("Grupo não encontrado.");
    if (group.ownerId === userId) throw new BadRequestException("O administrador precisa transferir o grupo antes de sair.");
    await this.prisma.groupMember.deleteMany({ where: { groupId, userId } });
    return { left: true };
  }

  private async assertGroupAccess(userId: string, groupId: string, posting = false) {
    const group = await this.prisma.communityGroup.findUnique({ where: { id: groupId }, select: { id: true, visibility: true, ownerId: true } });
    if (!group) throw new NotFoundException("Grupo não encontrado.");
    const member = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } }, select: { approved: true } });
    if (group.visibility === "PRIVATE" && group.ownerId !== userId && !member?.approved) throw new NotFoundException("Grupo não encontrado.");
    if (posting && group.ownerId !== userId && !member?.approved) throw new ForbiddenException("Participe do grupo para publicar.");
    return group;
  }

  async groupPosts(userId: string, groupId: string, cursor?: string) {
    await this.assertGroupAccess(userId, groupId);
    const before = cursor ? await this.prisma.groupPost.findUnique({ where: { id: cursor }, select: { id: true, createdAt: true, groupId: true } }) : null;
    if (cursor && (!before || before.groupId !== groupId)) throw new BadRequestException("Cursor inválido.");
    const items = await this.prisma.groupPost.findMany({ where: { groupId, ...(before ? { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, select: { id: true, body: true, createdAt: true, authorId: true, author: { select: { tutor: { select: { displayName: true, isPublic: true } } } } } });
    return items.map((item) => ({ ...item, author: item.author.tutor?.isPublic ? item.author : { tutor: null } }));
  }

  async createGroupPost(userId: string, groupId: string, body: string) {
    await this.assertGroupAccess(userId, groupId, true);
    const text = body?.trim(); if (!text || text.length > 2000) throw new BadRequestException("Texto inválido.");
    const post = await this.prisma.groupPost.create({ data: { groupId, authorId: userId, body: text }, select: { id: true, groupId: true, authorId: true, createdAt: true } });
    const members = await this.prisma.groupMember.findMany({ where: { groupId, approved: true }, select: { userId: true } });
    return { post, audience: members.map(({ userId: memberId }) => memberId) };
  }

  async events(userId: string) {
    const events = await this.prisma.petEvent.findMany({ where: { isCancelled: false, startsAt: { gte: new Date() }, OR: [{ visibility: "PUBLIC" }, { organizerId: userId }, { participants: { some: { userId } } }] }, orderBy: { startsAt: "asc" }, take: 40, select: { id: true, organizerId: true, title: true, description: true, startsAt: true, endsAt: true, locationLabel: true, latitude: true, longitude: true, capacity: true, visibility: true, _count: { select: { participants: true } }, participants: { where: { userId }, select: { status: true } } } });
    return events.map(({ organizerId, ...event }) => ({ ...event, isOrganizer: organizerId === userId }));
  }

  async createEvent(userId: string, input: { title: string; description: string; startsAt: string; endsAt?: string; locationLabel: string; latitude?: number; longitude?: number; capacity?: number; rules?: string; visibility?: "PUBLIC" | "PRIVATE" }) {
    const startsAt = new Date(input.startsAt); const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (!input.title?.trim() || input.title.length > 120 || !input.description?.trim() || input.description.length > 2000 || Number.isNaN(startsAt.getTime()) || startsAt <= new Date() || (endsAt && endsAt <= startsAt) || !input.locationLabel?.trim() || input.locationLabel.length > 180 || ((input.latitude === undefined) !== (input.longitude === undefined)) || (input.latitude !== undefined && (input.latitude < -90 || input.latitude > 90 || input.longitude! < -180 || input.longitude! > 180)) || (input.capacity !== undefined && input.capacity < 1)) throw new BadRequestException("Dados do evento inválidos.");
    return this.prisma.petEvent.create({ data: { organizerId: userId, title: input.title.trim(), description: input.description.trim(), startsAt, endsAt, locationLabel: input.locationLabel.trim(), latitude: input.latitude, longitude: input.longitude, capacity: input.capacity, rules: input.rules?.trim().slice(0, 1200), visibility: input.visibility ?? "PUBLIC" } });
  }

  async updateEvent(userId: string, eventId: string, input: { title: string; description: string; startsAt: string; endsAt?: string; locationLabel: string; latitude?: number; longitude?: number; capacity?: number; rules?: string; visibility?: "PUBLIC" | "PRIVATE" }) {
    const event = await this.prisma.petEvent.findUnique({ where: { id: eventId }, select: { organizerId: true, isCancelled: true } });
    if (!event || event.organizerId !== userId || event.isCancelled) throw new NotFoundException("Evento não encontrado.");
    const startsAt = new Date(input.startsAt); const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (!input.title?.trim() || input.title.length > 120 || !input.description?.trim() || input.description.length > 2000 || Number.isNaN(startsAt.getTime()) || startsAt <= new Date() || (endsAt && endsAt <= startsAt) || !input.locationLabel?.trim() || input.locationLabel.length > 180 || ((input.latitude === undefined) !== (input.longitude === undefined)) || (input.latitude !== undefined && (input.latitude < -90 || input.latitude > 90 || input.longitude! < -180 || input.longitude! > 180)) || (input.capacity !== undefined && input.capacity < 1)) throw new BadRequestException("Dados do evento inválidos.");
    return this.prisma.petEvent.update({ where: { id: eventId }, data: { title: input.title.trim(), description: input.description.trim(), startsAt, endsAt, locationLabel: input.locationLabel.trim(), latitude: input.latitude, longitude: input.longitude, capacity: input.capacity, rules: input.rules?.trim().slice(0, 1200), visibility: input.visibility ?? "PUBLIC" } });
  }

  async cancelEvent(userId: string, eventId: string) {
    const event = await this.prisma.petEvent.findUnique({ where: { id: eventId }, select: { organizerId: true, isCancelled: true } });
    if (!event || event.organizerId !== userId) throw new NotFoundException("Evento não encontrado.");
    if (!event.isCancelled) await this.prisma.petEvent.update({ where: { id: eventId }, data: { isCancelled: true } });
    return { success: true };
  }

  async attendEvent(userId: string, eventId: string) {
    const event = await this.prisma.petEvent.findUnique({ where: { id: eventId }, select: { id: true, visibility: true, organizerId: true, capacity: true, isCancelled: true, startsAt: true } });
    if (!event || event.isCancelled || event.startsAt <= new Date() || (event.visibility === "PRIVATE" && event.organizerId !== userId)) throw new NotFoundException("Evento indisponível para inscrição.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PetEvent" WHERE id = ${eventId} FOR UPDATE`;
      const existing = await tx.eventParticipant.findUnique({ where: { eventId_userId: { eventId, userId } }, select: { status: true } });
      const going = await tx.eventParticipant.count({ where: { eventId, status: "GOING" } });
      const waitlisted = !!event.capacity && !existing && going >= event.capacity;
      await tx.eventParticipant.upsert({ where: { eventId_userId: { eventId, userId } }, create: { eventId, userId, status: waitlisted ? "WAITLIST" : "GOING" }, update: { status: waitlisted ? "WAITLIST" : "GOING" } });
      return { attending: !waitlisted, waitlisted, organizerId: event.organizerId, count: going };
    }, { isolationLevel: "Serializable" });
  }

  async leaveEvent(userId: string, eventId: string) {
    const event = await this.prisma.petEvent.findUnique({ where: { id: eventId }, select: { organizerId: true } });
    if (!event) throw new NotFoundException("Evento não encontrado.");
    if (event.organizerId === userId) throw new BadRequestException("O organizador não pode cancelar a própria participação.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PetEvent" WHERE id = ${eventId} FOR UPDATE`;
      const removed = await tx.eventParticipant.deleteMany({ where: { eventId, userId } });
      let promotedUserId: string | null = null;
      if (removed.count) {
        const next = await tx.eventParticipant.findFirst({ where: { eventId, status: "WAITLIST" }, orderBy: { joinedAt: "asc" }, select: { userId: true } });
        if (next) { await tx.eventParticipant.update({ where: { eventId_userId: { eventId, userId: next.userId } }, data: { status: "GOING" } }); promotedUserId = next.userId; }
      }
      return { attending: false, promotedUserId };
    }, { isolationLevel: "Serializable" });
  }
}
