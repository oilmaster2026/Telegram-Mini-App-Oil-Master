import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.$connect();
console.log('Oil Master database ready.');
await db.$disconnect();
