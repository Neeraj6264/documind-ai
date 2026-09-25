import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Initializing pgvector and seeding initial data ---');

  // Ensure pgvector extension exists
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
  console.log('✓ Verified/Enabled pgvector extension in PostgreSQL.');

  // Create demo user
  const demoEmail = 'admin@documind.ai';
  const existingUser = await prisma.user.findUnique({
    where: { email: demoEmail },
  });

  if (!existingUser) {
    const passwordHash = await bcrypt.hash('DocuMind2026!', 10);
    const user = await prisma.user.create({
      data: {
        email: demoEmail,
        name: 'Enterprise Admin',
        passwordHash,
      },
    });

    const org = await prisma.organization.create({
      data: {
        name: 'Acme Enterprise Workspace',
        slug: 'acme-enterprise',
        plan: 'ENTERPRISE',
        ownerId: user.id,
        settings: {
          topK: 4,
          temperature: 0.15,
          maxUploadSizeMb: 50,
        },
      },
    });

    await prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: 'OWNER',
      },
    });

    console.log(`✓ Seeded demo tenant: ${org.name} (user: ${demoEmail}, password: DocuMind2026!)`);
  } else {
    console.log('Demo user already exists, skipping user creation.');
  }

  console.log('--- Database seeding completed successfully ---');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
