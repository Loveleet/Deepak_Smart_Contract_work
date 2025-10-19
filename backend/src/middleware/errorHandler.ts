import type { ErrorRequestHandler } from "express";
import { HttpError } from "../lib/httpError.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (typeof err === "object" && err && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "ACTION_REJECTED" || code === "CALL_EXCEPTION") {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
  }

  if (err instanceof Error) {
    console.error(err);
    res.status(500).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: "Unknown error" });
};
