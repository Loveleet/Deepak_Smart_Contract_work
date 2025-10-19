import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import { HttpError } from "../lib/httpError.js";

export const requireApiKey = (req: Request, _res: Response, next: NextFunction) => {
  const apiKey = req.header("X-API-Key");
  if (!apiKey || apiKey !== config.apiKeyAdmin) {
    throw new HttpError(401, "Unauthorized");
  }
  next();
};
