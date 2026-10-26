import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateIf } from "class-validator";
import { ConnectionIntent, PetSex, PetSize, PetSpecies } from "../../generated/prisma/client";

export class CreatePetDto {
  @IsString() @MinLength(2) @MaxLength(40)
  name!: string;

  @IsEnum(PetSpecies)
  species!: PetSpecies;

  @ValidateIf((input: CreatePetDto) => input.species === PetSpecies.OTHER) @IsString() @MinLength(2) @MaxLength(40)
  speciesOther?: string;

  @IsOptional() @IsString() @MaxLength(60)
  breed?: string;

  @IsEnum(PetSex)
  sex!: PetSex;

  @IsEnum(PetSize)
  size!: PetSize;

  @IsOptional() @IsDateString()
  birthDate?: string;

  @IsOptional() @IsString() @MaxLength(700)
  bio?: string;

  @IsEnum(ConnectionIntent)
  intent!: ConnectionIntent;

  @IsArray() @ArrayMaxSize(8) @IsString({ each: true })
  temperament!: string[];

  @IsArray() @ArrayMaxSize(12) @IsString({ each: true })
  preferences!: string[];

  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(2048)
  coverPhotoUrl?: string;

  @IsOptional() @IsArray() @ArrayMinSize(0) @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(120, { each: true })
  mediaKeys?: string[];

  @Type(() => Boolean) @IsBoolean()
  isPublic!: boolean;
}
