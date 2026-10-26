import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { PetsModule } from "./pets/pets.module";
import { ChatModule } from "./chat/chat.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { SafetyModule } from "./safety/safety.module";
import { CommunityModule } from "./community/community.module";
import { LocationModule } from "./location/location.module";
import { CommercialModule } from "./commercial/commercial.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]), PrismaModule, AuthModule, PetsModule, ChatModule, NotificationsModule, SafetyModule, CommunityModule, LocationModule, CommercialModule, HealthModule],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
