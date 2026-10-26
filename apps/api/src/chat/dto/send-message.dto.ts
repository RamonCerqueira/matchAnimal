import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsOptional() @IsString() @MaxLength(80)
  idempotencyKey?: string;
}
