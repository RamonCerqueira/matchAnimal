import { IsBoolean } from "class-validator";
export class DecideFollowDto { @IsBoolean() accept!: boolean; }
