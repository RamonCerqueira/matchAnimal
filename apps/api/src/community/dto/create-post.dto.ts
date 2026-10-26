import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { PostKind, PostVisibility } from "../../generated/prisma/client";

export class CreatePostDto {
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
  @IsOptional() @IsString() petId?: string;
  @IsOptional() @IsEnum(PostKind) kind?: PostKind;
  @IsOptional() @IsEnum(PostVisibility) visibility?: PostVisibility;
  @IsOptional() @IsString() @MaxLength(120) locationLabel?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) mediaKeys?: string[];
}
