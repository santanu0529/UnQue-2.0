import { HttpError } from "../models/error.js";

import {
  getAvailabilityByProfessor,
} from "../models/availability.js";

import {
  createAppointment,
  getAppointmentsByStudent,
} from "../models/appointment.js";

import { getUserById } from "../models/user.js";

import moment from "moment";

// ==========================================
// 1. Get available slots of a professor
// ==========================================

const getAvailableSlots = async (req, res, next) => {
  try {
    const { professorId } = req.params;

    if (!professorId) {
      return next(
        new HttpError("Professor ID is required", 400)
      );
    }

    const professor = await getUserById(professorId);

    if (!professor || professor.role !== "professor") {
      return next(
        new HttpError("Professor not found", 404)
      );
    }

    const availability =
      await getAvailabilityByProfessor(professorId);

    if (!availability || availability.length === 0) {
      return next(
        new HttpError(
          "No availability found for this professor",
          404
        )
      );
    }

    const availableSlots = availability.map((slot) => ({
      availabilityId: slot.availabilityId,
      StartTime: moment.utc(slot.startTime).format(
        "MMMM Do YYYY, h:mm:ss a"
      ),
      EndTime: moment.utc(slot.endTime).format(
        "MMMM Do YYYY, h:mm:ss a"
      ),
    }));

    return res.status(200).json({
      success: true,
      availableSlots,
    });

  } catch (error) {
    console.error(
      "Get availability error:",
      error.name,
      error.message
    );

    return next(
      new HttpError("Failed to fetch availability", 500)
    );
  }
};

// ==========================================
// 2. Book an appointment
// ==========================================

const bookAppointment = async (req, res, next) => {
  try {
    const { professorId, time } = req.body;
    const studentId = req.user.id;

    if (!professorId || !time) {
      return next(
        new HttpError(
          "Professor ID and time are required",
          400
        )
      );
    }

    // Validate professor
    const professor = await getUserById(professorId);

    if (!professor || professor.role !== "professor") {
      return next(
        new HttpError("Professor not found", 404)
      );
    }

    // Validate appointment time
    const appointmentTime = new Date(time);

    if (isNaN(appointmentTime.getTime())) {
      return next(
        new HttpError("Invalid appointment time", 400)
      );
    }

    // Check professor availability
    const availability =
      await getAvailabilityByProfessor(professorId);

    const matchingSlot = availability.find((slot) => {
      const start = new Date(slot.startTime);
      const end = new Date(slot.endTime);

      return (
        appointmentTime >= start &&
        appointmentTime < end
      );
    });

    if (!matchingSlot) {
      return next(
        new HttpError(
          "Selected time is not available",
          400
        )
      );
    }

    // Create appointment and reserve professor's time
    const appointment = await createAppointment({
      studentId,
      professorId,
      time: appointmentTime,
    });

    return res.status(201).json({
      success: true,
      message: "Appointment booked successfully",
      appointment,
    });

  } catch (error) {
    console.error(
      "Booking error:",
      error.name,
      error.message
    );

    if (
      error.name === "TransactionCanceledException" ||
      error.name === "ConditionalCheckFailedException"
    ) {
      return next(
        new HttpError(
          "This professor's time slot is already booked",
          409
        )
      );
    }

    return next(
      new HttpError("Failed to book appointment", 500)
    );
  }
};

// ==========================================
// 3. Get student's pending appointments
// ==========================================

const getStudentAppointments = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    if (!studentId) {
      return next(
        new HttpError(
          "Student authentication required",
          401
        )
      );
    }

    // Retrieve appointments using StudentAppointmentIndex
    const appointments =
      await getAppointmentsByStudent(studentId);

    if (!appointments || appointments.length === 0) {
      return next(
        new HttpError("You have no appointments", 404)
      );
    }

    // Keep only booked appointments
    const pendingAppointments = appointments.filter(
      (appointment) => appointment.status === "booked"
    );

    if (pendingAppointments.length === 0) {
      return next(
        new HttpError(
          "You have no pending appointments",
          404
        )
      );
    }

    // Retrieve professor details
    const formattedAppointments = await Promise.all(
      pendingAppointments.map(async (appointment) => {
        const professor = await getUserById(
          appointment.professorId
        );

        return {
          appointmentId: appointment.appointmentId,
          professorId: appointment.professorId,
          professor: professor?.name || "Unknown professor",
          appointmentTime: moment
            .utc(appointment.time)
            .format("MMMM Do YYYY, h:mm:ss a"),
          status: appointment.status,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Your upcoming appointments",
      totalAppointments: formattedAppointments.length,
      appointments: formattedAppointments,
    });

  } catch (error) {
    console.error(
      "Get student appointments error:",
      error.name,
      error.message
    );

    console.error(
      "AWS error details:",
      error.$metadata
    );

    return next(
      new HttpError(
        "Failed to retrieve appointments",
        500
      )
    );
  }
};

// ==========================================
// EXPORT CONTROLLERS
// ==========================================

export {
  getAvailableSlots,
  bookAppointment,
  getStudentAppointments,
};