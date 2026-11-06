import { HttpError } from "../models/error.js";

import {
  createAvailability,
  getAvailabilityByProfessor,
  getAvailabilityById,
  updateAvailability,
} from "../models/availability.js";

import {
  getAppointmentsByProfessor,
} from "../models/appointment.js";

import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../config/dynamodb.js";

const APPOINTMENTS_TABLE =
  process.env.DYNAMODB_APPOINTMENTS_TABLE || "UnQueAppointments";

// Add professor availability
const setAvailability = async (req, res, next) => {
  try {
    const { startTime, endTime } = req.body;
    const professorId = req.user.id;

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (
      !startTime ||
      !endTime ||
      isNaN(start.getTime()) ||
      isNaN(end.getTime()) ||
      start >= end
    ) {
      return next(new HttpError("Invalid start or end time", 400));
    }

    const existingSlots =
      await getAvailabilityByProfessor(professorId);

    const overlap = existingSlots.some((slot) => {
      const slotStart = new Date(slot.startTime);
      const slotEnd = new Date(slot.endTime);

      return start < slotEnd && end > slotStart;
    });

    if (overlap) {
      return next(
        new HttpError(
          "This availability overlaps an existing slot",
          400
        )
      );
    }

    const availability = await createAvailability({
      professorId,
      startTime: start,
      endTime: end,
    });

    res.status(201).json({
      message: "Availability added successfully",
      availability,
    });
  } catch (error) {
    console.error("Set availability error:", error);
    return next(new HttpError("Adding availability failed", 500));
  }
};

// Update an existing free availability slot
const updateAvailabilitySlot = async (req, res, next) => {
  try {
    const { availabilityId } = req.params;
    const { startTime, endTime } = req.body;
    const professorId = req.user.id;

    if (!availabilityId || !startTime || !endTime) {
      return next(
        new HttpError(
          "Availability ID, start time and end time are required",
          400
        )
      );
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (
      isNaN(start.getTime()) ||
      isNaN(end.getTime()) ||
      start >= end
    ) {
      return next(new HttpError("Invalid start or end time", 400));
    }

    const slot = await getAvailabilityById(
      professorId,
      availabilityId
    );

    if (!slot) {
      return next(new HttpError("Availability slot not found", 404));
    }

    const appointments =
      await getAppointmentsByProfessor(professorId);

    const bookedAppointment = appointments.find(
      (appointment) =>
        appointment.status === "booked" &&
        new Date(appointment.time) >= new Date(slot.startTime) &&
        new Date(appointment.time) < new Date(slot.endTime)
    );

    if (bookedAppointment) {
      return next(
        new HttpError(
          "Cannot update a slot that has a booked appointment",
          400
        )
      );
    }

    const existingSlots =
      await getAvailabilityByProfessor(professorId);

    const overlap = existingSlots.some((otherSlot) => {
      if (otherSlot.availabilityId === availabilityId) {
        return false;
      }

      return (
        start < new Date(otherSlot.endTime) &&
        end > new Date(otherSlot.startTime)
      );
    });

    if (overlap) {
      return next(
        new HttpError(
          "Updated time overlaps another availability slot",
          400
        )
      );
    }

    const availability = await updateAvailability({
      professorId,
      availabilityId,
      startTime: start,
      endTime: end,
    });

    res.status(200).json({
      message: "Availability updated successfully",
      availability,
    });
  } catch (error) {
    console.error("Update availability error:", error);
    return next(
      new HttpError("Updating availability failed", 500)
    );
  }
};

// Cancel booked appointments between a professor and student
const cancelAppointments = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const professorId = req.user.id;

    if (!studentId) {
      return next(new HttpError("Student ID is required", 400));
    }

    const appointments =
      await getAppointmentsByProfessor(professorId);

    const studentAppointments = appointments.filter(
      (appointment) =>
        appointment.studentId === studentId &&
        appointment.status === "booked"
    );

    if (studentAppointments.length === 0) {
      return next(
        new HttpError("No appointments found to cancel", 404)
      );
    }

    for (const appointment of studentAppointments) {
      await docClient.send(
        new UpdateCommand({
          TableName: APPOINTMENTS_TABLE,
          Key: {
            PK: appointment.PK,
            SK: appointment.SK,
          },
          UpdateExpression:
            "SET #status = :cancelled, updatedAt = :updated",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":cancelled": "cancelled",
            ":updated": new Date().toISOString(),
          },
        })
      );

      // Release the professor's time so it can be booked again.
      // The appointment record itself is retained as history.
      const { DeleteCommand } = await import(
        "@aws-sdk/lib-dynamodb"
      );

      await docClient.send(
        new DeleteCommand({
          TableName: APPOINTMENTS_TABLE,
          Key: {
            PK: appointment.PK,
            SK: `LOCK#${new Date(appointment.time).toISOString()}`,
          },
        })
      );
    }

    res.status(200).json({
      message: "Appointments cancelled successfully",
      cancelledCount: studentAppointments.length,
    });
  } catch (error) {
    console.error("Cancel appointments error:", error);
    return next(
      new HttpError("Cancelling appointments failed", 500)
    );
  }
};

export {
  setAvailability,
  updateAvailabilitySlot as updateAvailability,
  cancelAppointments,
};