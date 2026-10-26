import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PetsController } from "./pets.controller";
import { PetsService } from "./pets.service";
import { ChatModule } from "../chat/chat.module";

@Module({ imports: [AuthModule, ChatModule], controllers: [PetsController], providers: [PetsService] })
export class PetsModule {}
