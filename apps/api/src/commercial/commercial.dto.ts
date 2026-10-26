import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { AdCampaignStatus, AdPlacement, CommercialPartnerCategory, CommercialPartnerStatus, EventVisibility } from "../generated/prisma/client";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const trimUpper = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim().toUpperCase() : value;
const integerLimit = 2_147_483_647;

class PartnerDetailsDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(180) legalName?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(32) taxId?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) whatsapp?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) billingContact?: string | null;
  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(254) billingEmail?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(9) @Matches(/^[0-9]{5}-?[0-9]{3}$/, { message: "Informe um CEP com 8 dígitos." }) postalCode?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(180) street?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) addressNumber?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) complement?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) district?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) @Matches(/^[A-Za-z0-9_.]+$/, { message: "Informe o Instagram sem @ ou link." }) instagram?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) commercialOwner?: string | null;
}

export class CreatePartnerDto extends PartnerDetailsDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(160) businessName!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100) contactName!: string;
  @Transform(trim) @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsUrl({ protocols: ["https", "http"], require_protocol: true }) @MaxLength(2000) website?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) city?: string | null;
  @IsOptional() @Transform(trimUpper) @Matches(/^[A-Z]{2}$/) state?: string | null;
  @IsOptional() @IsEnum(CommercialPartnerCategory) category?: CommercialPartnerCategory;
  @IsOptional() @IsEnum(CommercialPartnerStatus) status?: CommercialPartnerStatus;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) notes?: string | null;
}

export class UpdatePartnerDto extends PartnerDetailsDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(160) businessName?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(100) contactName?: string;
  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsUrl({ protocols: ["https", "http"], require_protocol: true }) @MaxLength(2000) website?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) city?: string | null;
  @IsOptional() @Transform(trimUpper) @Matches(/^[A-Z]{2}$/) state?: string | null;
  @IsOptional() @IsEnum(CommercialPartnerCategory) category?: CommercialPartnerCategory;
  @IsOptional() @IsEnum(CommercialPartnerStatus) status?: CommercialPartnerStatus;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) notes?: string | null;
}

export class CreateCampaignDto {
  @IsString() @MinLength(1) @MaxLength(100) partnerId!: string;
  @IsString() @MinLength(1) @MaxLength(100) assetId!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100) headline!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(400) body?: string | null;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(40) ctaLabel!: string;
  @IsUrl({ protocols: ["https", "http"], require_protocol: true }) @MaxLength(2000) destinationUrl!: string;
  @IsEnum(AdPlacement) placement!: AdPlacement;
  @IsISO8601({ strict: true }) startsAt!: string;
  @IsISO8601({ strict: true }) endsAt!: string;
  @IsInt() @Min(0) @Max(integerLimit) amountCents!: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) targetCity?: string | null;
  @IsOptional() @Transform(trimUpper) @Matches(/^[A-Z]{2}$/) targetState?: string | null;
  @IsOptional() @IsEnum(AdCampaignStatus) status?: AdCampaignStatus;
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) partnerId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) assetId?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(100) headline?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(400) body?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(40) ctaLabel?: string;
  @IsOptional() @IsUrl({ protocols: ["https", "http"], require_protocol: true }) @MaxLength(2000) destinationUrl?: string;
  @IsOptional() @IsEnum(AdPlacement) placement?: AdPlacement;
  @IsOptional() @IsISO8601({ strict: true }) startsAt?: string;
  @IsOptional() @IsISO8601({ strict: true }) endsAt?: string;
  @IsOptional() @IsInt() @Min(0) @Max(integerLimit) amountCents?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) targetCity?: string | null;
  @IsOptional() @Transform(trimUpper) @Matches(/^[A-Z]{2}$/) targetState?: string | null;
  @IsOptional() @IsEnum(AdCampaignStatus) status?: AdCampaignStatus;
}

export class CreateInvoiceDto {
  @IsString() @MinLength(1) @MaxLength(100) partnerId!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) campaignId?: string | null;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(250) description!: string;
  @IsInt() @Min(1) @Max(integerLimit) amountCents!: number;
  @IsISO8601({ strict: true }) dueAt!: string;
}

export class ManualPaymentDto {
  @IsIn(["PIX", "BANK_TRANSFER", "CASH", "OTHER"]) method!: "PIX" | "BANK_TRANSFER" | "CASH" | "OTHER";
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(250) reference!: string;
  @IsOptional() @IsInt() @Min(1) @Max(integerLimit) amountCents?: number;
  @IsOptional() @IsISO8601({ strict: true }) paidAt?: string;
}

export class ManualRefundDto {
  @IsIn(["PIX", "BANK_TRANSFER", "CASH", "OTHER"]) method!: "PIX" | "BANK_TRANSFER" | "CASH" | "OTHER";
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(250) reference!: string;
  @IsOptional() @IsInt() @Min(1) @Max(integerLimit) amountCents?: number;
  @IsOptional() @IsISO8601({ strict: true }) refundedAt?: string;
}

export class CreateCommercialEventDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) partnerId?: string | null;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) title!: string;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(2000) description!: string;
  @IsISO8601({ strict: true }) startsAt!: string;
  @IsOptional() @IsISO8601({ strict: true }) endsAt?: string | null;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(180) locationLabel!: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number | null;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(10000) capacity?: number | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1200) rules?: string | null;
  @IsOptional() @IsEnum(EventVisibility) visibility?: EventVisibility;
  @IsOptional() @IsBoolean() isCancelled?: boolean;
}

export class UpdateCommercialEventDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) partnerId?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) title?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(5) @MaxLength(2000) description?: string;
  @IsOptional() @IsISO8601({ strict: true }) startsAt?: string;
  @IsOptional() @IsISO8601({ strict: true }) endsAt?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(180) locationLabel?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number | null;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(10000) capacity?: number | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1200) rules?: string | null;
  @IsOptional() @IsEnum(EventVisibility) visibility?: EventVisibility;
  @IsOptional() @IsBoolean() isCancelled?: boolean;
}
