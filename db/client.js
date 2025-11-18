const { PrismaClient } = require('@prisma/client');

let prismaInstance = null;

const createPrismaClient = () => {
  const logging = [];
  if (process.env.PRISMA_LOG_QUERIES === 'true') logging.push('query');
  if (process.env.PRISMA_LOG_WARNINGS !== 'false') logging.push('warn');
  logging.push('error');

  return new PrismaClient({
    log: logging,
  });
};

const getPrisma = () => {
  if (!prismaInstance) {
    prismaInstance = createPrismaClient();
  }
  return prismaInstance;
};

const prisma = getPrisma();

const connectPrisma = async () => {
  await prisma.$connect();
  return prisma;
};

const disconnectPrisma = async () => {
  if (!prismaInstance) return;
  await prismaInstance.$disconnect();
};

module.exports = {
  prisma,
  getPrisma,
  connectPrisma,
  disconnectPrisma,
};
