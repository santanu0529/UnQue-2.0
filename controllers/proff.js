import { HttpError } from "../models/error.js";
import { Availability } from "../models/availability.js";
import { Appointment } from "../models/appointment.js";
import moment from "moment";
import mongoose from "mongoose";

// Add professor availability
const setAvailability = async (req, res, next) => {
  try {
    const { startTime, endTime } = req.body;
    const professorId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(professorId)) {
      return next(new HttpError("Invalid professor ID", 400));
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (!startTime || !endTime || isNaN(start) || isNaN(end) || start >= end) {
      return next(new HttpError("Invalid start or end time", 400));
    }

    const overlap = await Availability.findOne({
      professorId,
      startTime: { $lt: end },
      endTime: { $gt: start }
    });

    if (overlap) {
      return next(new HttpError("This availability overlaps an existing slot", 400));
    }

    const availability = await Availability.create({
      professorId,
      startTime: start,
      endTime: end
    });

    res.status(201).json({
      message: "Availability added successfully",
      availability
    });
  } catch (error) {
    console.error(error);
    return next(new HttpError("Adding availability failed", 500));
  }
};

// Update an existing free availability slot
const updateAvailability = async (req, res, next) => {
  try {
    const { availabilityId } = req.params;
    const { startTime, endTime } = req.body;
    const professorId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(availabilityId)) {
      return next(new HttpError("Invalid availability ID", 400));
    }

    if (!startTime || !endTime) {
      return next(new HttpError("Start time and end time are required", 400));
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start) || isNaN(end) || start >= end) {
      return next(new HttpError("Invalid start or end time", 400));
    }

    const slot = await Availability.findOne({
      _id: availabilityId,
      professorId
    });

    if (!slot) {
      return next(new HttpError("Availability slot not found", 404));
    }

    // Do not update a slot if it contains an existing appointment
    const bookedAppointment = await Appointment.findOne({
      professorId,
      time: { $gte: slot.startTime, $lt: slot.endTime },
      status: "booked"
    });

    if (bookedAppointment) {
      return next(new HttpError("Cannot update a slot that has a booked appointment", 400));
    }

    // Check overlap with other availability slots
    const overlap = await Availability.findOne({
      professorId,
      _id: { $ne: availabilityId },
      startTime: { $lt: end },
      endTime: { $gt: start }
    });

    if (overlap) {
      return next(new HttpError("Updated time overlaps another availability slot", 400));
    }

    slot.startTime = start;
    slot.endTime = end;
    await slot.save();

    res.status(200).json({
      message: "Availability updated successfully",
      availability: slot
    });
  } catch (error) {
    console.error(error);
    return next(new HttpError("Updating availability failed", 500));
  }
};

// Cancel appointments between a professor and student
const cancelAppointments = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const professorId = req.user.id;

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return next(new HttpError("Invalid or missing student ID", 400));
    }

    const result = await Appointment.updateMany(
      {
        studentId,
        professorId,
        status: "booked"
      },
      { $set: { status: "cancelled" } }
    );

    if (result.modifiedCount === 0) {
      return next(new HttpError("No appointments found to cancel", 404));
    }

    res.status(200).json({
      message: "Appointments cancelled successfully",
      cancelledCount: result.modifiedCount
    });
  } catch (error) {
    console.error(error);
    return next(new HttpError("Cancelling appointments failed", 500));
  }
};

export { setAvailability, updateAvailability, cancelAppointments };