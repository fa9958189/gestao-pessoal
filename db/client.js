const { PrismaClient } = require('@prisma/client');

let prisma = null;

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
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
};

const prisma = getPrisma();

const connectPrisma = async () => {
  await prisma.$connect();
  return prisma;
};

const disconnectPrisma = async () => {
  if (!prisma) return;
  await prisma.$disconnect();
};

module.exports = {
  prisma,
  connectPrisma,
  disconnectPrisma,
};
