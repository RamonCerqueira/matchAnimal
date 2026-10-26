import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SafetyController } from "./safety.controller";
import { SafetyService } from "./safety.service";

@Module({ imports: [AuthModule], controllers: [SafetyController], providers: [SafetyService] })
export class SafetyModule {}
