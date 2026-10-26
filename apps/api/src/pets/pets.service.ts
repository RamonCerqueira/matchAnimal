import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConnectionIntent, PetSpecies } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePetDto } from "./dto/create-pet.dto";
import { explainCompatibility } from "../matching/compatibility";
import { AdoptionApplicationDto } from "./dto/adoption-application.dto";
import { ChatGateway } from "../chat/chat.gateway";
import { stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

@Injectable()
export class PetsService {
  constructor(private readonly prisma: PrismaService, private readonly chatGateway: ChatGateway) {}

  async create(ownerId: string, input: CreatePetDto) {
    if (input.birthDate && new Date(input.birthDate).getTime() > Date.now()) throw new BadRequestException("A data de nascimento não pode estar no futuro.");
    const mediaKeys = input.mediaKeys ?? [];
    if (new Set(mediaKeys).size !== mediaKeys.length) throw new BadRequestException("Uma mesma foto não pode ser adicionada mais de uma vez.");
    const mediaRoot = resolve(process.env.MEDIA_STORAGE_DIR ?? join(process.cwd(), "storage"));
    for (const key of mediaKeys) {
      const parts = key.split("/");
      const fileName = parts[1] ?? "";
      if (parts.length !== 2 || parts[0] !== ownerId || !/^[a-f0-9-]{36}\.webp$/i.test(fileName)) throw new BadRequestException("Uma ou mais fotos não são válidas.");
      const filePath = resolve(mediaRoot, ownerId, fileName);
      if (!filePath.startsWith(`${mediaRoot}${process.platform === "win32" ? "\\" : "/"}`) || !await stat(filePath).then((file) => file.isFile() && file.size > 0 && file.size <= 8 * 1024 * 1024).catch(() => false)) throw new BadRequestException("Uma ou mais fotos não foram enviadas corretamente.");
    }
    const tutor = await this.prisma.tutorProfile.findUnique({ where: { userId: ownerId }, select: { city: true, state: true, latitude: true, longitude: true } });
    if (!tutor) throw new NotFoundException("Complete primeiro seu perfil de tutor.");
    const searchCell = tutor.city && tutor.state ? `${tutor.city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim()}:${tutor.state}` : null;
    const mediaBaseUrl = (process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, "");
    const pet = await this.prisma.$transaction(async (tx) => {
      const created = await tx.pet.create({
      data: {
        ownerId,
        name: input.name.trim(),
        species: input.species,
        speciesOther: input.species === "OTHER" ? input.speciesOther?.trim() : null,
        breed: input.breed?.trim() || null,
        sex: input.sex,
        size: input.size,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        bio: input.bio?.trim() || null,
        intent: input.intent,
        temperament: input.temperament,
        preferences: input.preferences,
        coverPhotoUrl: mediaKeys.length ? `${mediaBaseUrl}/api/community/media/${mediaKeys[0]}` : input.coverPhotoUrl || null,
        ...(mediaKeys.length ? { coverPhotoModeration: "APPROVED" as const } : {}),
        city: tutor.city,
        state: tutor.state,
        searchCell,
        latitude: tutor.latitude,
        longitude: tutor.longitude,
        isPublic: input.isPublic,
      },
      select: { id: true, name: true, species: true, breed: true, intent: true, isPublic: true, createdAt: true },
      });
      if (mediaKeys.length) await tx.petPhoto.createMany({ data: mediaKeys.map((storageKey, sortOrder) => ({ petId: created.id, storageKey, sortOrder, altText: `${created.name} — foto ${sortOrder + 1}`, moderation: "APPROVED" })) });
      return created;
    });
    return pet;
  }

  listMine(ownerId: string) {
    const mediaBaseUrl = (process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, "");
    return this.prisma.pet.findMany({ where: { ownerId, isActive: true }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, species: true, speciesOther: true, breed: true, sex: true, size: true, birthDate: true, bio: true, intent: true, temperament: true, preferences: true, coverPhotoUrl: true, isPublic: true, createdAt: true, photos: { orderBy: { sortOrder: "asc" }, select: { id: true, storageKey: true, altText: true, sortOrder: true, moderation: true } } } }).then((pets) => pets.map(({ photos, ...pet }) => ({ ...pet, photos: photos.map((photo) => ({ ...photo, url: `${mediaBaseUrl}/api/community/media/${photo.storageKey}` })) })));
  }

  async setVisibility(ownerId: string, petId: string, isPublic: boolean) {
    const updated = await this.prisma.pet.updateMany({ where: { id: petId, ownerId, isActive: true }, data: { isPublic } });
    if (!updated.count) throw new NotFoundException("Animal não encontrado.");
    return { id: petId, isPublic };
  }

  async replacePhotos(ownerId: string, petId: string, mediaKeys: string[]) {
    if (new Set(mediaKeys).size !== mediaKeys.length) throw new BadRequestException("Uma mesma foto não pode aparecer mais de uma vez.");
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, ownerId, isActive: true }, select: { id: true, name: true, photos: { select: { id: true, storageKey: true, moderation: true } } } });
    if (!pet) throw new NotFoundException("Animal não encontrado.");
    const mediaRoot = resolve(process.env.MEDIA_STORAGE_DIR ?? join(process.cwd(), "storage"));
    for (const key of mediaKeys) {
      const parts = key.split("/");
      const fileName = parts[1] ?? "";
      if (parts.length !== 2 || parts[0] !== ownerId || !/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$/i.test(fileName)) throw new BadRequestException("Uma ou mais fotos não são válidas.");
      const filePath = resolve(mediaRoot, ownerId, fileName);
      if (!filePath.startsWith(`${mediaRoot}${process.platform === "win32" ? "\\" : "/"}`) || !await stat(filePath).then((file) => file.isFile() && file.size > 0 && file.size <= 8 * 1024 * 1024).catch(() => false)) throw new BadRequestException("Uma ou mais fotos não foram enviadas corretamente.");
    }
    const previousByKey = new Map(pet.photos.map((photo) => [photo.storageKey, photo]));
    const mediaBaseUrl = (process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, "");
    const coverPhotoUrl = mediaKeys[0] ? `${mediaBaseUrl}/api/community/media/${mediaKeys[0]}` : null;
    const firstPhotoModeration = mediaKeys[0] ? previousByKey.get(mediaKeys[0])?.moderation ?? "APPROVED" : "PENDING";
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.petPhoto.deleteMany({ where: { petId } });
      if (mediaKeys.length) await tx.petPhoto.createMany({ data: mediaKeys.map((storageKey, sortOrder) => ({ petId, storageKey, sortOrder, altText: `${pet.name} — foto ${sortOrder + 1}`, moderation: previousByKey.get(storageKey)?.moderation ?? "APPROVED" })) });
      await tx.pet.update({ where: { id: petId }, data: { coverPhotoUrl, coverPhotoModeration: firstPhotoModeration } });
      return { success: true, coverPhotoUrl, photosCount: mediaKeys.length };
    });
    const removed = pet.photos.map((photo) => photo.storageKey).filter((key) => !mediaKeys.includes(key));
    for (const key of removed) {
      const [photoRef, postRef, storyRef] = await Promise.all([
        this.prisma.petPhoto.findFirst({ where: { storageKey: key }, select: { id: true } }),
        this.prisma.postMedia.findFirst({ where: { storageKey: key }, select: { id: true } }),
        this.prisma.story.findFirst({ where: { mediaKey: key }, select: { id: true } }),
      ]);
      if (!photoRef && !postRef && !storyRef) {
        const fileName = key.split("/")[1];
        await unlink(resolve(mediaRoot, ownerId, fileName)).catch(() => undefined);
      }
    }
    return result;
  }

  async getPublicProfile(viewerId: string, petId: string) {
    const blocked = await this.prisma.userBlock.findMany({ where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] }, select: { blockerId: true, blockedId: true } });
    const excludedIds = new Set([viewerId, ...blocked.flatMap((block) => [block.blockerId, block.blockedId])]);
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, isPublic: true, isActive: true, ownerId: { notIn: [...excludedIds] } },
      select: { id: true, name: true, species: true, speciesOther: true, breed: true, sex: true, size: true, birthDate: true, bio: true, intent: true, temperament: true, preferences: true, city: true, state: true, coverPhotoUrl: true, coverPhotoModeration: true, photos: { where: { moderation: "APPROVED" }, orderBy: { sortOrder: "asc" }, select: { id: true, storageKey: true, altText: true, sortOrder: true } } },
    });
    if (!pet) throw new NotFoundException("Este perfil não está disponível.");
    const { coverPhotoModeration, coverPhotoUrl, photos, ...publicProfile } = pet;
    const mediaBaseUrl = (process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, "");
    return { ...publicProfile, coverPhotoUrl: coverPhotoModeration === "APPROVED" ? coverPhotoUrl : null, photos: photos.map(({ storageKey, ...photo }) => ({ ...photo, url: `${mediaBaseUrl}/api/community/media/${storageKey}` })) };
  }

  async explore(ownerId: string, filters: { species?: PetSpecies; intent?: ConnectionIntent; viewerPetId?: string; cursor?: string; limit?: number; radiusKm?: number }) {
    const [blocked, ownedPets] = await Promise.all([
      this.prisma.userBlock.findMany({ where: { OR: [{ blockerId: ownerId }, { blockedId: ownerId }] }, select: { blockerId: true, blockedId: true } }),
      this.prisma.pet.findMany({ where: { ownerId, isActive: true }, select: { id: true } }),
    ]);
    const selectedViewerId = filters.viewerPetId && ownedPets.some((pet) => pet.id === filters.viewerPetId) ? filters.viewerPetId : ownedPets[0]?.id;
    if (!selectedViewerId) return [];
    const viewer = await this.prisma.pet.findUnique({ where: { id: selectedViewerId }, select: { species: true, intent: true, size: true, birthDate: true, searchCell: true, latitude: true, longitude: true, temperament: true, preferences: true, healthChecklistComplete: true, healthVerificationStatus: true, veterinarianReviewAt: true } });
    if (!viewer || (!viewer.searchCell && (viewer.latitude === null || viewer.longitude === null))) return [];
    if (filters.intent && filters.intent !== "ADOPTION" && filters.intent !== viewer.intent) return [];
    const excludedIds = new Set([ownerId, ...blocked.flatMap((block) => [block.blockerId, block.blockedId])]);
    // Relacionamentos só aparecem para animais da mesma espécie e com o mesmo
    // objetivo. Adoção é um fluxo separado e pode aproximar espécies diferentes.
    const speciesRule = filters.intent === "ADOPTION"
      ? { intent: "ADOPTION" as const }
      : filters.intent
        ? { species: viewer.species, intent: filters.intent }
        : { OR: [
            { species: viewer.species, intent: viewer.intent },
            { intent: "ADOPTION" as const },
          ] };
    const radiusKm = Math.min(Math.max(filters.radiusKm ?? 50, 1), 200);
    const latDelta = radiusKm / 110.574;
    const lngDelta = radiusKm / Math.max(1, 111.32 * Math.cos((viewer.latitude ?? 0) * Math.PI / 180));
    const locationFilter = viewer.latitude !== null && viewer.longitude !== null
      ? { OR: [
          { latitude: { gte: viewer.latitude - latDelta, lte: viewer.latitude + latDelta }, longitude: { gte: viewer.longitude - lngDelta, lte: viewer.longitude + lngDelta } },
          ...(viewer.searchCell ? [{ searchCell: viewer.searchCell }] : []),
        ] }
      : { searchCell: viewer.searchCell! };
    const where = { isActive: true, isPublic: true, ownerId: { notIn: [...excludedIds] }, AND: [locationFilter, speciesRule, ...(filters.species ? [{ species: filters.species }] : []), ...(filters.intent ? [{ intent: filters.intent }] : [])] };
    const evaluated = await this.prisma.petLike.findMany({ where: { fromPetId: selectedViewerId }, select: { toPetId: true } });
    const resultLimit = Math.min(filters.limit ?? 20, 50);
    const candidateBatchLimit = Math.min(Math.max(resultLimit * 5, 100), 500);
    const candidates = await this.prisma.pet.findMany({ where: { ...where, id: { notIn: evaluated.map((entry) => entry.toPetId) } }, take: candidateBatchLimit, ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}), orderBy: { createdAt: "desc" }, select: { id: true, name: true, species: true, speciesOther: true, breed: true, sex: true, size: true, birthDate: true, bio: true, intent: true, temperament: true, preferences: true, city: true, state: true, searchCell: true, latitude: true, longitude: true, coverPhotoUrl: true, coverPhotoModeration: true, healthChecklistComplete: true, healthVerificationStatus: true, veterinarianReviewAt: true } });
    const toPublicProfile = (candidate: (typeof candidates)[number]) => {
      const { searchCell: _cell, latitude: _lat, longitude: _lng, healthChecklistComplete: _checklist, healthVerificationStatus: _verification, veterinarianReviewAt: _reviewedAt, coverPhotoModeration, coverPhotoUrl, ...profile } = candidate;
      return { ...profile, coverPhotoUrl: coverPhotoModeration === "APPROVED" ? coverPhotoUrl : null };
    };
    const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => { const rad = (value: number) => value * Math.PI / 180; const dLat = rad(lat2 - lat1); const dLon = rad(lon2 - lon1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); };
    return candidates.filter((candidate) => {
      if (viewer.latitude !== null && viewer.longitude !== null && candidate.latitude !== null && candidate.longitude !== null) {
        return distanceKm(viewer.latitude, viewer.longitude, candidate.latitude, candidate.longitude) <= radiusKm;
      }
      return Boolean(viewer.searchCell && candidate.searchCell === viewer.searchCell);
    })
      .map((candidate) => {
        const exactDistance = viewer.latitude !== null && viewer.longitude !== null && candidate.latitude !== null && candidate.longitude !== null
          ? distanceKm(viewer.latitude, viewer.longitude, candidate.latitude, candidate.longitude)
          : null;
        const compatibility = explainCompatibility(viewer, { ...candidate, distanceKm: exactDistance, radiusKm });
        const distance = exactDistance !== null ? Math.max(1, Math.round(exactDistance / 5) * 5) : null;
        return { ...toPublicProfile(candidate), approximateDistanceKm: distance, compatibility, _sortDistance: exactDistance };
      })
      .sort((a, b) => (b.compatibility?.score ?? 0) - (a.compatibility?.score ?? 0) || (a._sortDistance ?? Number.POSITIVE_INFINITY) - (b._sortDistance ?? Number.POSITIVE_INFINITY))
      .slice(0, resultLimit)
      .map(({ _sortDistance: _distance, ...candidate }) => candidate);
  }

  async expressInterest(ownerId: string, toPetId: string, fromPetId: string, superMatch = false) {
    if (toPetId === fromPetId) throw new BadRequestException("Escolha outro perfil para demonstrar interesse.");
    const [fromPet, toPet] = await Promise.all([
      this.prisma.pet.findUnique({ where: { id: fromPetId }, select: { id: true, ownerId: true, species: true, intent: true, isActive: true, isPublic: true, owner: { select: { tutor: { select: { notificationOptIn: true } } } } } }),
      this.prisma.pet.findUnique({ where: { id: toPetId }, select: { id: true, ownerId: true, species: true, intent: true, isPublic: true, isActive: true, owner: { select: { tutor: { select: { notificationOptIn: true } } } } } }),
    ]);
    if (!fromPet || fromPet.ownerId !== ownerId || !fromPet.isActive) throw new ForbiddenException("Escolha um animal ativo do seu perfil.");
    if (!fromPet.isPublic) throw new BadRequestException("Publique o perfil do pet antes de demonstrar interesse.");
    if (!toPet || !toPet.isActive || !toPet.isPublic) throw new NotFoundException("Este perfil não está disponível.");
    if (toPet.ownerId === ownerId) throw new BadRequestException("Não é possível conectar animais do mesmo tutor.");
    if (fromPet.species !== toPet.species) throw new BadRequestException("A descoberta só conecta animais da mesma espécie.");
    if (toPet.intent === "ADOPTION") throw new BadRequestException("Adoção usa candidatura, sem curtida mútua.");
    if (toPet.intent !== fromPet.intent) throw new BadRequestException("A conexão exige que os dois perfis busquem o mesmo objetivo.");
    const blocked = await this.prisma.userBlock.findFirst({ where: { OR: [{ blockerId: ownerId, blockedId: toPet.ownerId }, { blockerId: toPet.ownerId, blockedId: ownerId }] }, select: { id: true } });
    if (blocked) throw new NotFoundException("Este perfil não está disponível.");
    const breeding = fromPet.intent === "RESPONSIBLE_BREEDING" || toPet.intent === "RESPONSIBLE_BREEDING";
    if (breeding && fromPet.intent !== toPet.intent) throw new BadRequestException("Os dois perfis precisam buscar relacionamento responsável.");

    const limit = Number(process.env.SUPER_MATCH_DAILY_LIMIT ?? 3);
    let like: { like: { id: string; status: "PENDING" | "MATCHED" | "PASSED"; isSuperMatch: boolean; createdAt: Date }; matched: boolean; mutualInterest?: boolean; responsibleBreeding?: boolean; match: { id: string; petAId: string; petBId: string; createdAt: Date } | null };
    for (let attempt = 0; ; attempt++) {
      try {
        like = await this.prisma.$transaction(async (tx) => {
      const [currentTarget, transactionBlock] = await Promise.all([
        tx.pet.findUnique({ where: { id: toPetId }, select: { ownerId: true, isActive: true, isPublic: true } }),
        tx.userBlock.findFirst({ where: { OR: [{ blockerId: ownerId, blockedId: toPet.ownerId }, { blockerId: toPet.ownerId, blockedId: ownerId }] }, select: { id: true } }),
      ]);
      if (!currentTarget || !currentTarget.isActive || !currentTarget.isPublic || transactionBlock) throw new NotFoundException("Este perfil não está disponível.");
      const existing = await tx.petLike.findUnique({ where: { fromPetId_toPetId: { fromPetId, toPetId } } });
      if (existing?.status === "PASSED") throw new BadRequestException("Você já passou este perfil.");
      if (superMatch) {
        const since = new Date(); since.setHours(0, 0, 0, 0);
        const used = await tx.petLike.count({ where: { fromOwnerId: ownerId, superMatchAt: { gte: since } } });
        if (!existing?.isSuperMatch && used >= limit) throw new BadRequestException(`Seu limite diário de Super Match (${limit}) foi atingido.`);
      }
      const createdLike = await tx.petLike.upsert({
        where: { fromPetId_toPetId: { fromPetId, toPetId } },
        create: { fromPetId, toPetId, fromOwnerId: ownerId, toOwnerId: toPet.ownerId, isSuperMatch: superMatch, superMatchAt: superMatch ? new Date() : null },
        update: { status: "PENDING", isSuperMatch: superMatch || existing?.isSuperMatch || false, superMatchAt: superMatch ? existing?.superMatchAt ?? new Date() : existing?.superMatchAt },
        select: { id: true, status: true, isSuperMatch: true, createdAt: true },
      });
      const reverse = await tx.petLike.findUnique({ where: { fromPetId_toPetId: { fromPetId: toPetId, toPetId: fromPetId } }, select: { id: true, status: true } });
      if (breeding) {
        if (toPet.owner.tutor?.notificationOptIn) await tx.notification.create({ data: { recipientId: toPet.ownerId, actorId: ownerId, type: superMatch ? "SUPER_MATCH" : "PET_LIKE", entityId: createdLike.id } });
        return { like: createdLike, matched: false, mutualInterest: reverse?.status === "PENDING", responsibleBreeding: true, match: null };
      }
      if (!reverse || reverse.status !== "PENDING" || fromPet.ownerId === toPet.ownerId) {
        if (toPet.owner.tutor?.notificationOptIn) await tx.notification.create({ data: { recipientId: toPet.ownerId, actorId: ownerId, type: superMatch ? "SUPER_MATCH" : "PET_LIKE", entityId: createdLike.id } });
        return { like: createdLike, matched: false, match: null };
      }
      await tx.petLike.updateMany({ where: { OR: [{ fromPetId, toPetId }, { fromPetId: toPetId, toPetId: fromPetId }] }, data: { status: "MATCHED" } });
      const [petAId, petBId] = [fromPetId, toPetId].sort();
      const createdMatch = await tx.petMatch.upsert({ where: { petAId_petBId: { petAId, petBId } }, create: { petAId, petBId }, update: {}, select: { id: true, petAId: true, petBId: true, createdAt: true } });
      await tx.chatThread.upsert({ where: { matchId: createdMatch.id }, create: { matchId: createdMatch.id }, update: {} });
      const notificationData = [ownerId, toPet.ownerId].filter((recipientId) => recipientId === ownerId ? fromPet.owner.tutor?.notificationOptIn : toPet.owner.tutor?.notificationOptIn).map((recipientId) => ({ recipientId, actorId: recipientId === ownerId ? toPet.ownerId : ownerId, type: "MATCH" as const, entityId: createdMatch.id }));
      if (notificationData.length) await tx.notification.createMany({ data: notificationData });
      return { like: { ...createdLike, status: "MATCHED" as const }, matched: true, match: createdMatch };
        }, { isolationLevel: "Serializable" });
        break;
      } catch (error) {
        const serializationFailure = typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
        if (!serializationFailure || attempt >= 2) throw error;
      }
    }
    if (breeding) return { ...like, message: "Interesse registrado sem Match automático. Consulte um médico-veterinário e confirme as condições de saúde e bem-estar antes de qualquer decisão." };
    if (like.matched && like.match) await this.chatGateway.publishMatch(like.match.id, [ownerId, toPet.ownerId]);
    return like;
  }

  async pass(ownerId: string, toPetId: string, fromPetId: string) {
    const [fromPet, toPet] = await Promise.all([
      this.prisma.pet.findUnique({ where: { id: fromPetId }, select: { ownerId: true, isActive: true } }),
      this.prisma.pet.findUnique({ where: { id: toPetId }, select: { id: true, ownerId: true, isActive: true, isPublic: true } }),
    ]);
    if (!fromPet || fromPet.ownerId !== ownerId || !fromPet.isActive) throw new ForbiddenException("Escolha um animal ativo do seu perfil.");
    if (!toPet || !toPet.isActive || !toPet.isPublic || toPet.ownerId === ownerId) throw new NotFoundException("Este perfil não está disponível.");
    const blocked = await this.prisma.userBlock.findFirst({ where: { OR: [{ blockerId: ownerId, blockedId: toPet.ownerId }, { blockerId: toPet.ownerId, blockedId: ownerId }] } });
    if (blocked) throw new NotFoundException("Este perfil não está disponível.");
    return this.prisma.$transaction(async (tx) => {
      const passed = await tx.petLike.upsert({ where: { fromPetId_toPetId: { fromPetId, toPetId } }, create: { fromPetId, toPetId, fromOwnerId: ownerId, toOwnerId: toPet.ownerId, status: "PASSED" }, update: { status: "PASSED", isSuperMatch: false }, select: { id: true, status: true, createdAt: true } });
      await tx.petLike.updateMany({ where: { fromPetId: toPetId, toPetId: fromPetId, status: "PENDING" }, data: { status: "PASSED", isSuperMatch: false } });
      return passed;
    });
  }

  async receivedInterests(ownerId: string) {
    const blocked = await this.prisma.userBlock.findMany({ where: { OR: [{ blockerId: ownerId }, { blockedId: ownerId }] }, select: { blockerId: true, blockedId: true } });
    const excludedOwners = [...new Set([ownerId, ...blocked.flatMap(({ blockerId, blockedId }) => [blockerId, blockedId])])];
    const incoming = await this.prisma.petLike.findMany({
      where: {
        toOwnerId: ownerId,
        status: "PENDING",
        fromPet: { isActive: true, isPublic: true, ownerId: { notIn: excludedOwners } },
        toPet: { isActive: true, ownerId },
      },
      orderBy: [{ isSuperMatch: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        isSuperMatch: true,
        createdAt: true,
        fromPet: { select: { id: true, name: true, species: true, speciesOther: true, breed: true, sex: true, size: true, birthDate: true, bio: true, intent: true, temperament: true, preferences: true, city: true, state: true, coverPhotoUrl: true, coverPhotoModeration: true } },
        toPet: { select: { id: true, name: true, isPublic: true, likesSent: { select: { toPetId: true, status: true } } } },
      },
    });
    return incoming
      .map(({ fromPet, toPet, ...interest }) => {
        const isReciprocal = toPet.likesSent.some((like) => like.toPetId === fromPet.id && like.status === "PENDING");
        const { coverPhotoModeration, coverPhotoUrl, ...profile } = fromPet;
        return { ...interest, isReciprocal, fromPet: { ...profile, coverPhotoUrl: coverPhotoModeration === "APPROVED" ? coverPhotoUrl : null }, toPet: { id: toPet.id, name: toPet.name, isPublic: toPet.isPublic } };
      })
      .filter((interest) => !interest.isReciprocal || interest.fromPet.intent === "RESPONSIBLE_BREEDING");
  }

  async undoMatch(ownerId: string, matchId: string) {
    const match = await this.prisma.petMatch.findUnique({ where: { id: matchId }, select: { id: true, status: true, petAId: true, petBId: true, petA: { select: { ownerId: true } }, petB: { select: { ownerId: true } } } });
    if (!match || (match.petA.ownerId !== ownerId && match.petB.ownerId !== ownerId)) throw new NotFoundException("Match não encontrado.");
    if (match.status === "UNMATCHED") return { success: true, status: "UNMATCHED" };
    await this.prisma.$transaction(async (tx) => {
      await tx.petMatch.update({ where: { id: match.id }, data: { status: "UNMATCHED" } });
      await tx.petLike.updateMany({ where: { OR: [{ fromPetId: match.petAId, toPetId: match.petBId }, { fromPetId: match.petBId, toPetId: match.petAId }] }, data: { status: "PASSED" } });
      await tx.notification.createMany({ data: [match.petA.ownerId, match.petB.ownerId].map((recipientId) => ({ recipientId, actorId: ownerId, type: "CONNECTION_UPDATE" as const, entityId: match.id })) });
    });
    await this.chatGateway.publishMatchRemoved(match.id, [match.petA.ownerId, match.petB.ownerId]);
    return { success: true, status: "UNMATCHED" };
  }

  async listMatches(ownerId: string) {
    const blocked = await this.prisma.userBlock.findMany({ where: { OR: [{ blockerId: ownerId }, { blockedId: ownerId }] }, select: { blockerId: true, blockedId: true } });
    const excludedOwners = new Set([ownerId, ...blocked.flatMap(({ blockerId, blockedId }) => [blockerId, blockedId])]);
    return this.prisma.petMatch.findMany({
      where: { status: "ACTIVE", OR: [{ petA: { ownerId, isActive: true } }, { petB: { ownerId, isActive: true } }] },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, thread: { select: { id: true } }, petA: { select: { id: true, ownerId: true, name: true, species: true, breed: true, coverPhotoUrl: true } }, petB: { select: { id: true, ownerId: true, name: true, species: true, breed: true, coverPhotoUrl: true } } },
    }).then((matches) => matches.filter((match) => !excludedOwners.has(match.petA.ownerId === ownerId ? match.petB.ownerId : match.petA.ownerId)).map((match) => {
      const { ownerId: _aOwner, ...petA } = match.petA;
      const { ownerId: _bOwner, ...petB } = match.petB;
      return { ...match, petA: { ...petA, isMine: match.petA.ownerId === ownerId }, petB: { ...petB, isMine: match.petB.ownerId === ownerId } };
    }));
  }

  async applyForAdoption(applicantId: string, petId: string, input: AdoptionApplicationDto) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId }, select: { id: true, ownerId: true, intent: true, isActive: true, isPublic: true } });
    if (!pet || !pet.isActive || !pet.isPublic || pet.intent !== "ADOPTION") throw new NotFoundException("Este animal não está disponível para adoção.");
    if (pet.ownerId === applicantId) throw new BadRequestException("Você não pode se candidatar para o animal do seu próprio perfil.");
    const blocked = await this.prisma.userBlock.findFirst({ where: { OR: [{ blockerId: applicantId, blockedId: pet.ownerId }, { blockerId: pet.ownerId, blockedId: applicantId }] }, select: { id: true } });
    if (blocked) throw new NotFoundException("Este perfil não está disponível.");
    return this.prisma.adoptionApplication.create({ data: { petId, applicantId, message: input.message.trim(), livingDetails: input.livingDetails.trim() }, select: { id: true, petId: true, status: true, createdAt: true } });
  }

  async adoptionApplications(userId: string) {
    return this.prisma.adoptionApplication.findMany({ where: { OR: [{ applicantId: userId }, { pet: { ownerId: userId } }] }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, petId: true, applicantId: true, status: true, message: true, livingDetails: true, createdAt: true, reviewedAt: true,
        pet: { select: { name: true, intent: true, ownerId: true } },
        applicant: { select: { tutor: { select: { displayName: true, city: true, state: true } } } },
      },
    }).then((applications) => applications.map(({ applicantId, pet, ...application }) => ({ ...application, pet, isMine: applicantId === userId, applicant: application.applicant })));
  }

  async decideAdoptionApplication(ownerId: string, applicationId: string, status: "APPROVED" | "DECLINED") {
    const application = await this.prisma.adoptionApplication.findUnique({ where: { id: applicationId }, select: { id: true, status: true, petId: true, pet: { select: { ownerId: true, intent: true, isActive: true } } } });
    if (!application || application.pet.ownerId !== ownerId || application.pet.intent !== "ADOPTION") throw new NotFoundException("Candidatura não encontrada.");
    if (application.status === "APPROVED" || application.status === "DECLINED" || application.status === "WITHDRAWN") throw new BadRequestException("Esta candidatura já foi concluída.");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.adoptionApplication.update({ where: { id: application.id }, data: { status, reviewedAt: new Date() }, select: { id: true, status: true, reviewedAt: true } });
      if (status === "APPROVED") {
        await tx.adoptionApplication.updateMany({ where: { petId: application.petId, id: { not: application.id }, status: { in: ["SUBMITTED", "IN_REVIEW"] } }, data: { status: "DECLINED", reviewedAt: new Date() } });
        await tx.pet.update({ where: { id: application.petId }, data: { isPublic: false } });
      }
      return updated;
    });
  }

  async withdrawAdoptionApplication(applicantId: string, applicationId: string) {
    const application = await this.prisma.adoptionApplication.findUnique({ where: { id: applicationId }, select: { id: true, applicantId: true, status: true } });
    if (!application || application.applicantId !== applicantId) throw new NotFoundException("Candidatura não encontrada.");
    if (["APPROVED", "DECLINED", "WITHDRAWN"].includes(application.status)) throw new BadRequestException("Esta candidatura já foi concluída.");
    return this.prisma.adoptionApplication.update({ where: { id: applicationId }, data: { status: "WITHDRAWN" }, select: { id: true, status: true } });
  }
}
