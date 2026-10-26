import { IsString, MinLength } from "class-validator";

export class InterestDto {
  @IsString() @MinLength(8)
  fromPetId!: string;
}
