import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { EventVisibility } from "../../generated/prisma/client";
export class CreateEventDto {
  @IsString() @MinLength(2) @MaxLength(120) title!: string;
  @IsString() @MinLength(5) @MaxLength(2000) description!: string;
  @IsISO8601() startsAt!: string;
  @IsOptional() @IsISO8601() endsAt?: string;
  @IsString() @MinLength(2) @MaxLength(180) locationLabel!: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(10000) capacity?: number;
  @IsOptional() @IsString() @MaxLength(1200) rules?: string;
  @IsOptional() @IsEnum(EventVisibility) visibility?: EventVisibility;
}
