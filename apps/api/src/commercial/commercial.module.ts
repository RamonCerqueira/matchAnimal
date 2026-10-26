import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { CommercialController } from "./commercial.controller";
import { CommercialDeliveryController } from "./commercial-delivery.controller";
import { CommercialMediaController } from "./commercial-media.controller";
import { CommercialService } from "./commercial.service";
import { CommercialDeliveryService } from "./commercial-delivery.service";
import { CommercialMediaService } from "./commercial-media.service";
import { StripeBillingService } from "./stripe-billing.service";
import { CommercialAdminGuard } from "./commercial-admin.guard";
import { AdminOperationsController } from "../admin/admin-operations.controller";
import { AdminOperationsService } from "../admin/admin-operations.service";
import { AdminDocumentsController } from "../admin/admin-documents.controller";
import { AdminDocumentsService } from "../admin/admin-documents.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CommercialController, CommercialDeliveryController, CommercialMediaController, AdminOperationsController, AdminDocumentsController],
  providers: [
    CommercialService,
    CommercialDeliveryService,
    CommercialMediaService,
    StripeBillingService,
    CommercialAdminGuard,
    AdminOperationsService,
    AdminDocumentsService,
  ],
  exports: [CommercialService, CommercialDeliveryService, CommercialMediaService, StripeBillingService],
})
export class CommercialModule {}
