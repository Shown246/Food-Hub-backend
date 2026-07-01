import express, { Application } from 'express';
import { toNodeHandler } from "better-auth/node";
import {auth} from "../lib/auth"
import cors from 'cors';

export const app: Application = express();
app.use(express.json());
app.use(cors({
  origin: "http://localhost:4000",
  credentials: true,
}));

app.all("/api/auth/*splat", toNodeHandler(auth));

app.get("/", (req, res) => {
  res.send("Hello World, How are you?");
});