import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { createRateLimiter } from "./middleware/rateLimiter.js";
import { createRouter } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";

export const createApp = () => {
  const app = express();
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(
    cors({
      origin: "*"
    })
  );
  app.use(express.json());
  app.use(createRateLimiter());
  app.use(morgan("combined"));

  app.use("/", createRouter());

  app.use(errorHandler);

  return app;
};
