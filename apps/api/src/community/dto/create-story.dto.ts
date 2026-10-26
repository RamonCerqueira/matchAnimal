import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { PostVisibility } from "../../generated/prisma/client";
export class CreateStoryDto {
  @IsString() mediaKey!: string;
  @IsIn(["IMAGE", "VIDEO"]) mediaType!: "IMAGE" | "VIDEO";
  @IsOptional() @IsString() petId?: string;
  @IsOptional() @IsString() @MaxLength(300) caption?: string;
  @IsOptional() @IsEnum(PostVisibility) visibility?: PostVisibility;
}
