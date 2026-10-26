import { IsString, MaxLength, MinLength } from "class-validator";

export class AdoptionApplicationDto {
  @IsString() @MinLength(20) @MaxLength(1500)
  message!: string;

  @IsString() @MaxLength(1000)
  livingDetails!: string;
}
