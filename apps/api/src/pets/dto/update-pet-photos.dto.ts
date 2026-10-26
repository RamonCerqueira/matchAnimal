import { ArrayMaxSize, IsArray, IsString, MaxLength } from "class-validator";

export class UpdatePetPhotosDto {
  @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(120, { each: true })
  mediaKeys!: string[];
}
