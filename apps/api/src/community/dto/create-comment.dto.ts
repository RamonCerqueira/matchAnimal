import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCommentDto {
  @IsString() @MinLength(1) @MaxLength(1200) body!: string;
  @IsOptional() @IsString() parentId?: string;
}
