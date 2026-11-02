import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Lets Prisma Client generation run on a clean checkout; runtime config still requires DATABASE_URL.
    url:
      process.env.DATABASE_URL ??
      'postgresql://tarmeez:secret@localhost:5432/tarmeez',
  },
});
