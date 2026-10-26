import { INestApplication, Logger } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { ServerOptions } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

export class RedisIoAdapter extends IoAdapter {
  private readonly redisLogger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplication) { super(app); }

  async connectToRedis(url: string) {
    const publisher = createClient({ url });
    const subscriber = publisher.duplicate();
    publisher.on("error", () => this.redisLogger.error("Socket.IO Redis publisher connection error"));
    subscriber.on("error", () => this.redisLogger.error("Socket.IO Redis subscriber connection error"));
    await Promise.all([publisher.connect(), subscriber.connect()]);
    this.adapterConstructor = createAdapter(publisher, subscriber);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, { ...options, maxHttpBufferSize: 64 * 1024 });
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
