import { Router } from "express";
import {
  solmanLoginController,
  createChangeRequestController,
} from "../controllers/solman.controller.js";

const router = Router();

router.get("/ping", (req, res) => {
  res.json({ ok: true, message: "solman route works" });
});

router.post("/login", solmanLoginController);
router.post("/change-request/create", createChangeRequestController);

export default router;