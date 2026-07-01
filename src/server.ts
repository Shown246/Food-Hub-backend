import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { app } from './app';


const PORT = process.env.PORT || 3000;

try {
  await prisma.$connect();
  app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
  });
} catch (error) {
  console.error("Error connecting to database", error);
  process.exit(1);
}finally {
  await prisma.$disconnect();
}
