import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { ingestSapCatalog } from "../controllers/sap.catalog.controller.js";

const router = express.Router();

router.post("/catalog/ingest", requireAuth, ingestSapCatalog);

export default router;