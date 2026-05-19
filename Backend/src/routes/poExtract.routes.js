import { Router } from "express";
import { poExtractController } from "../controllers/poExtract.controller.js";

export const poExtractRoutes = Router();
poExtractRoutes.post("/extract", poExtractController);