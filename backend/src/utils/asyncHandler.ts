import type { Request, Response, NextFunction, RequestHandler } from "express";

export const asyncHandler =
  <TRequest extends Request = Request, TResponse extends Response = Response>(
    fn: (req: TRequest, res: TResponse, next: NextFunction) => Promise<unknown>
  ): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req as TRequest, res as TResponse, next)).catch(next);
  };
