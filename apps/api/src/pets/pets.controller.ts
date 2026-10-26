import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn } from "class-validator";
import { ConnectionIntent, PetSpecies } from "../generated/prisma/client";
import { AuthenticatedRequest, JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreatePetDto } from "./dto/create-pet.dto";
import { InterestDto } from "./dto/interest.dto";
import { AdoptionApplicationDto } from "./dto/adoption-application.dto";
import { PetsService } from "./pets.service";
import { UpdatePetPhotosDto } from "./dto/update-pet-photos.dto";

class AdoptionDecisionDto { @IsIn(["APPROVED", "DECLINED"]) status!: "APPROVED" | "DECLINED"; }
class PetVisibilityDto { @IsBoolean() isPublic!: boolean; }

@Controller("pets")
@UseGuards(JwtAuthGuard)
export class PetsController {
  constructor(private readonly pets: PetsService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: CreatePetDto) { return this.pets.create(request.user.sub, body); }

  @Get("mine")
  mine(@Req() request: AuthenticatedRequest) { return this.pets.listMine(request.user.sub); }

  @Patch(":petId/photos")
  updatePhotos(@Req() request: AuthenticatedRequest, @Param("petId") petId: string, @Body() body: UpdatePetPhotosDto) { return this.pets.replacePhotos(request.user.sub, petId, body.mediaKeys); }

  @Patch(":petId/visibility")
  visibility(@Req() request: AuthenticatedRequest, @Param("petId") petId: string, @Body() body: PetVisibilityDto) { return this.pets.setVisibility(request.user.sub, petId, body.isPublic); }

  @Get("matches")
  matches(@Req() request: AuthenticatedRequest) { return this.pets.listMatches(request.user.sub); }

  @Get("interests/received")
  receivedInterests(@Req() request: AuthenticatedRequest) { return this.pets.receivedInterests(request.user.sub); }

  @Get("explore")
  explore(@Req() request: AuthenticatedRequest, @Query("species") species?: PetSpecies, @Query("intent") intent?: ConnectionIntent, @Query("viewerPetId") viewerPetId?: string, @Query("cursor") cursor?: string, @Query("limit") limit?: string, @Query("radiusKm") radiusKm?: string) {
    const validSpecies = Object.values(PetSpecies).includes(species as PetSpecies) ? species : undefined;
    const validIntent = Object.values(ConnectionIntent).includes(intent as ConnectionIntent) ? intent : undefined;
    return this.pets.explore(request.user.sub, { species: validSpecies, intent: validIntent, viewerPetId, cursor, limit: Math.max(1, Math.min(Number(limit) || 20, 50)), radiusKm: Math.max(1, Math.min(Number(radiusKm) || 50, 200)) });
  }

  @Get("adoption-applications")
  adoptionApplications(@Req() request: AuthenticatedRequest) { return this.pets.adoptionApplications(request.user.sub); }

  @Get(":petId")
  publicProfile(@Req() request: AuthenticatedRequest, @Param("petId") petId: string) { return this.pets.getPublicProfile(request.user.sub, petId); }

  @Post(":petId/interest")
  interest(@Req() request: AuthenticatedRequest, @Param("petId") petId: string, @Body() body: InterestDto) { return this.pets.expressInterest(request.user.sub, petId, body.fromPetId); }

  @Post(":petId/super-match")
  superMatch(@Req() request: AuthenticatedRequest, @Param("petId") petId: string, @Body() body: InterestDto) { return this.pets.expressInterest(request.user.sub, petId, body.fromPetId, true); }

  @Post(":petId/pass")
  pass(@Req() request: AuthenticatedRequest, @Param("petId") petId: string, @Body() body: InterestDto) { return this.pets.pass(request.user.sub, petId, body.fromPetId); }

  @Post("matches/:matchId/unmatch")
  unmatch(@Req() request: AuthenticatedRequest, @Param("matchId") matchId: string) { return this.pets.undoMatch(request.user.sub, matchId); }

  @Post(":petId/adoption-applications")
  applyForAdoption(@Req() request: AuthenticatedRequest, @Param("petId") petId: string, @Body() body: AdoptionApplicationDto) { return this.pets.applyForAdoption(request.user.sub, petId, body); }

  @Patch("adoption-applications/:applicationId")
  decideAdoption(@Req() request: AuthenticatedRequest, @Param("applicationId") applicationId: string, @Body() body: AdoptionDecisionDto) { return this.pets.decideAdoptionApplication(request.user.sub, applicationId, body.status); }

  @Post("adoption-applications/:applicationId/withdraw")
  withdrawAdoption(@Req() request: AuthenticatedRequest, @Param("applicationId") applicationId: string) { return this.pets.withdrawAdoptionApplication(request.user.sub, applicationId); }
}
