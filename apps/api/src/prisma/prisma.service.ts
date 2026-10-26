import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString?.trim()) {
      throw new Error("DATABASE_URL não foi configurada. Defina a URL PostgreSQL em apps/api/.env antes de iniciar a API.");
    }

    let databaseUrl: URL;
    try {
      databaseUrl = new URL(connectionString);
    } catch {
      throw new Error("DATABASE_URL inválida. Use uma URL PostgreSQL no formato postgresql://usuario:senha@host:5432/banco.");
    }
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) || !databaseUrl.username || !databaseUrl.password) {
      throw new Error("DATABASE_URL precisa conter o protocolo PostgreSQL, usuário e senha. Confira apps/api/.env.");
    }

    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
