import { Transform } from "class-transformer";
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength, Equals, IsOptional, IsNumber, Min, Max } from "class-validator";

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(80)
  displayName!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254)
  email!: string;

  @IsString() @MinLength(8) @MaxLength(72)
  password!: string;

  @IsString() @MinLength(2) @MaxLength(80)
  city!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim().toUpperCase() : value)
  @IsString() @Length(2, 2) @Matches(/^[A-Z]{2}$/)
  state!: string;

  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  latitude?: number;

  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  longitude?: number;

  @Equals(true)
  consent!: boolean;
}
