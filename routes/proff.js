import express from "express";
import {
  setAvailability,
  updateAvailability,
  cancelAppointments
} from "../controllers/proff.js";

import {
  authMiddleware,
  profMiddleware
} from "../middleware/auth.js";

const router = express.Router();

router.post(
  "/availability",
  authMiddleware,
  profMiddleware,
  setAvailability
);

router.patch(
  "/availability/:availabilityId",
  authMiddleware,
  profMiddleware,
  updateAvailability
);

router.patch(
  "/cancel-appointments/:studentId",
  authMiddleware,
  profMiddleware,
  cancelAppointments
);

export default router;