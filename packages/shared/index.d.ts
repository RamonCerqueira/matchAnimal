export type AccountType = "TUTOR" | "ORGANIZATION" | "PROTECTOR" | "PROFESSIONAL";
export type PetSpecies = "DOG" | "CAT" | "OTHER";
export type PetSex = "FEMALE" | "MALE" | "UNKNOWN";
export type PetSize = "SMALL" | "MEDIUM" | "LARGE" | "EXTRA_LARGE" | "UNKNOWN";
export type ConnectionIntent = "FRIENDSHIP" | "RESPONSIBLE_BREEDING" | "ADOPTION";
export type ApplicationStatus = "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "DECLINED" | "WITHDRAWN";

export interface TutorProfileSummary {
  id: string;
  displayName: string;
  city: string | null;
  state: string | null;
  profilePhotoUrl: string | null;
}

export interface PublicPetProfile {
  id: string;
  name: string;
  species: PetSpecies;
  speciesOther: string | null;
  breed: string | null;
  sex: PetSex;
  size: PetSize;
  birthDate: string | null;
  city: string | null;
  state: string | null;
  intent: ConnectionIntent;
  coverPhotoUrl: string | null;
}

export interface CompatibilityFactor {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  explanation: string;
}

export interface CompatibilitySummary {
  score: number | null;
  factors: CompatibilityFactor[];
  flow: "MUTUAL_INTEREST" | "ADOPTION_APPLICATION" | "HUMAN_REVIEW_REQUIRED";
  reproductionReview: "NOT_APPLICABLE" | "INCOMPLETE" | "READY_FOR_HUMAN_REVIEW";
  recommendsBreeding: false;
}

export type SocketCommand<T> = T & { requestId: string };

export interface SocketAck<T = unknown> {
  success: boolean;
  requestId: string;
  data?: T;
  error?: { code: string; message: string };
}

export interface ChatMessageEvent {
  messageId: string;
  clientMessageId: string;
  conversationId: string;
  senderId: string;
  type: "TEXT" | "IMAGE";
  content: string;
  createdAt: string;
}
