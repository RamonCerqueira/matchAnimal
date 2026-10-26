import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { RedisIoAdapter } from "./realtime/redis-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  if (process.env.REDIS_URL) {
    const adapter = new RedisIoAdapter(app);
    await adapter.connectToRedis(process.env.REDIS_URL);
    app.useWebSocketAdapter(adapter);
  }
  app.use(cookieParser());
  app.setGlobalPrefix("api");
  const webOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((origin) => origin.trim()).filter(Boolean);
  const nativeOrigins = ["https://localhost", "capacitor://localhost"];
  app.enableCors({ origin: [...new Set([...webOrigins, ...nativeOrigins])], credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
