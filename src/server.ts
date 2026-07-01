import express, { Application } from 'express';
import { toNodeHandler } from "better-auth/node";
import {auth} from "../lib/auth"
import { prisma } from '../lib/prisma';
import cors from 'cors';

const PORT = process.env.PORT || 3000;
const app: Application = express();
app.use(express.json());
app.use(cors({
  origin: "http://localhost:4000",
  credentials: true,
}));

app.all("/api/auth/*splat", toNodeHandler(auth));

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

app.get("/", (req, res) => {
  res.send("Hello World, How are you?");
});
