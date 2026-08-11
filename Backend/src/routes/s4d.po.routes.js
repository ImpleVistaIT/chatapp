import { Router } from "express";
import { getS4dPurchaseOrderDetails } from "../controllers/s4d.po.controller.js";

export const s4dPoRoutes = Router();

s4dPoRoutes.get("/po/details/:poNumber", getS4dPurchaseOrderDetails);