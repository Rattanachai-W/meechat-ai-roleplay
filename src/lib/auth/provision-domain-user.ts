import { prisma } from "@/lib/db/prisma";

export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim();
  return local && local.length > 0 ? local : "user";
}

/** Create domain User + EnergyWallet with the same UUID as Better Auth user.id */
export async function provisionDomainUser(input: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<void> {
  const displayName =
    (input.name && input.name.trim()) || displayNameFromEmail(input.email);

  await prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({
      where: { email: input.email, NOT: { id: input.id } },
    });

    await tx.user.upsert({
      where: { id: input.id },
      create: {
        id: input.id,
        email: input.email,
        displayName,
      },
      update: {
        email: input.email,
      },
    });

    await tx.energyWallet.upsert({
      where: { userId: input.id },
      create: { userId: input.id },
      update: {},
    });
  });
}
