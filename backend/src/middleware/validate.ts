import type { RequestHandler } from "express";
import { ZodError, type AnyZodObject } from "zod";
import { HttpError } from "../lib/httpError.js";

export const validateBody = (schema: AnyZodObject): RequestHandler => {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issue = error.issues[0];
        next(new HttpError(400, issue?.message ?? "Invalid request body"));
      } else {
        next(error);
      }
    }
  };
};
