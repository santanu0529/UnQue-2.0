import express from "express";

import {
  getAvailableSlots,
  bookAppointment,
  getStudentAppointments
} from "../controllers/general.js";

import {
  authMiddleware,
  studentMiddleware
} from "../middleware/auth.js";

const router = express.Router();

// View professor availability
// Accessible to authenticated students and professors
router.get(
  "/availability/:professorId",
  authMiddleware,
  getAvailableSlots
);

// Book an appointment
// Only authenticated students can book
router.post(
  "/book-appointment",
  authMiddleware,
  studentMiddleware,
  bookAppointment
);

// View personal appointments
// Only authenticated students can access
router.get(
  "/my-appointments",
  authMiddleware,
  studentMiddleware,
  getStudentAppointments
);

export default router;