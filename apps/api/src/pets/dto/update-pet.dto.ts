import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";
import { ConnectionIntent, PetSex, PetSize, PetSpecies } from "../../generated/prisma/client";

export class UpdatePetDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(40)
  name?: string;

  @IsOptional() @IsEnum(PetSpecies)
  species?: PetSpecies;

  @ValidateIf((input: UpdatePetDto) => input.species === PetSpecies.OTHER) @IsString() @MinLength(2) @MaxLength(40)
  speciesOther?: string;

  @IsOptional() @IsString() @MaxLength(60)
  breed?: string;

  @IsOptional() @IsEnum(PetSex)
  sex?: PetSex;

  @IsOptional() @IsEnum(PetSize)
  size?: PetSize;

  @IsOptional() @IsDateString()
  birthDate?: string | null;

  @IsOptional() @IsString() @MaxLength(700)
  bio?: string | null;

  @IsOptional() @IsEnum(ConnectionIntent)
  intent?: ConnectionIntent;

  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(50, { each: true })
  temperament?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(50, { each: true })
  preferences?: string[];

  @IsOptional() @IsBoolean()
  isPublic?: boolean;
}
