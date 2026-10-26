import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { GroupVisibility } from "../../generated/prisma/client";
export class CreateGroupDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsString() @MinLength(5) @MaxLength(1000) description!: string;
  @IsOptional() @IsEnum(GroupVisibility) visibility?: GroupVisibility;
}
