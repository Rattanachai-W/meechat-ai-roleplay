import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db/prisma";
import { provisionDomainUser } from "@/lib/auth/provision-domain-user";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  user: {
    // Avoid clashing with domain model User (@@map("users"))
    modelName: "authUser",
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await provisionDomainUser({
              id: user.id,
              email: user.email,
              name: user.name,
            });
          } catch {
            await prisma.authUser.delete({ where: { id: user.id } }).catch(() => null);
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Failed to provision application user",
            });
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});
