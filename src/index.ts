import "reflect-metadata";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import passport from "./config/passport";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { schema } from "./schema";
import session from "express-session";
import { MyContext } from "./types/MyContext";
import authRoutes from "./routes/authRoutes";
import dataSource from "./database/data-source"; 
import "./cronJob/cronJob";
import { WebhookController } from './controllers/webhook.controller';

dotenv.config();

async function startServer() {
  await dataSource.initialize();
  console.log("Data Source has been initialized!");

  const app = express();

  app.use(
    cors({
      origin: process.env.FRONTEND_URL,
      credentials: true,
      methods: "GET,POST,OPTIONS",
      allowedHeaders: "Content-Type, Authorization",
    })
  );

  app.use(express.json());
  app.use(
    session({
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false, httpOnly: true,sameSite: "lax" }
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(authRoutes);
  const webhookController = new WebhookController();
  app.post('/webhook', (req, res) => webhookController.handleSonarQubeWebhook(req, res));
  // Initialize Apollo Server with Schema and Context
  const apolloServer = new ApolloServer<MyContext>({
    schema: await schema(),
  });

  await apolloServer.start();

  app.use(
    "/graphql",
    expressMiddleware(apolloServer, {
      context: async ({ req, res }): Promise<MyContext> => {
        return {
          req,
          res,
          user: req.user
            ? (req.user as { u_id: string; email: string; username: string })
            : undefined,
        };
      },
    })
  );

  app.listen(4000, () => console.log(" Server running on http://localhost:4000/graphql"));
}

startServer().catch((err) => console.error("Server startup error:", err));