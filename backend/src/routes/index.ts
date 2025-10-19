import { Router } from "express";
import { tokenRouter } from "./tokenRoutes.js";

export const createRouter = () => {
  const router = Router();
  router.use("/", tokenRouter);
  return router;
};
