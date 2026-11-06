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

// Get available slots of a professor
const getAvailableSlots = async (req, res, next) => {
  try {
    const { professorId } = req.params;

    if (!professorId) {
      return next(new HttpError("Professor ID is required", 400));
    }

    const availability =
      await getAvailabilityByProfessor(professorId);

    if (availability.length === 0) {
      return next(
        new HttpError(
          "No availability found for this professor",
          404
        )
      );
    }

    const availableSlots = availability.map((slot) => ({
      availabilityId: slot.availabilityId,
      StartTime: moment(slot.startTime).format(
        "MMMM Do YYYY, h:mm:ss a"
      ),
      EndTime: moment(slot.endTime).format(
        "MMMM Do YYYY, h:mm:ss a"
      ),
    }));

    res.status(200).json({ availableSlots });
  } catch (error) {
    console.error("Get availability error:", error);
    return next(
      new HttpError("Failed to fetch availability", 500)
    );
  }
};

// Book an appointment
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

    const formattedTime = new Date(time);

    if (isNaN(formattedTime.getTime())) {
      return next(
        new HttpError("Invalid appointment time", 400)
      );
    }

    const availability =
      await getAvailabilityByProfessor(professorId);

    const matchingSlot = availability.find(
      (slot) =>
        formattedTime >= new Date(slot.startTime) &&
        formattedTime < new Date(slot.endTime)
    );

    if (!matchingSlot) {
      return next(
        new HttpError("Selected time is not available", 400)
      );
    }

    const appointment = await createAppointment({
      studentId,
      professorId,
      time: formattedTime,
    });

    res.status(201).json({
      message: "Appointment booked successfully",
      appointment,
    });
  } catch (error) {
    console.error("Booking error:", error);

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

// Get a student's pending appointments
const getStudentAppointments = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    const appointments =
      await getAppointmentsByStudent(studentId);

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

    const formattedAppointments = await Promise.all(
      pendingAppointments.map(async (appointment) => {
        const professor = await getUserById(
          appointment.professorId
        );

        return {
          professor: professor?.name || "Unknown professor",
          appointmentTime: moment
            .utc(appointment.time)
            .format("MMMM Do YYYY, h:mm:ss a"),
          status: appointment.status,
        };
      })
    );

    res.status(200).json({
      message: "Your upcoming appointments:",
      appointments: formattedAppointments,
    });
  } catch (error) {
    console.error("Get student appointments error:", error);

    return next(
      new HttpError(
        "Failed to retrieve appointments",
        500
      )
    );
  }
};

export {
  getAvailableSlots,
  bookAppointment,
  getStudentAppointments,
};