import { Availability } from "../models/availability.js";
import { HttpError } from "../models/error.js";
import {Appointment} from "../models/appointment.js"
import mongoose from 'mongoose';
import moment from 'moment';  

const getAvailableSlots = async (req, res, next) => {
    try {
        const { professorId } = req.params;

        
        console.log("Professor ID:", professorId, "Type:", typeof professorId);

        // Check if professorId is valid
        if (!mongoose.Types.ObjectId.isValid(professorId)) {
            return next(new HttpError("Invalid professor ID format", 400));
        }

        // Find availability slots for the professor
        const availability = await Availability.find({ professorId: new mongoose.Types.ObjectId(professorId) });

        if (!availability || availability.length === 0) {
            return next(new HttpError("No availability found for this professor", 404));
        }

        // Format the available slots using moment.js
        const availableSlots = availability.map(avail => ({
            StartTime: moment(avail.startTime).format('MMMM Do YYYY, h:mm:ss a'),
            EndTime: moment(avail.endTime).format('MMMM Do YYYY, h:mm:ss a'),
        }));

        res.status(200).json({ availableSlots });
    } catch (error) {
        return next(new HttpError("Failed to fetch availability", 500));
    }
};

const bookAppointment = async (req, res, next) => {
  try {
    const { professorId, time } = req.body;
    const studentId = req.user.id;

    if (!professorId || !time) {
      return next(new HttpError("Professor ID and time are required", 400));
    }

    if (!mongoose.Types.ObjectId.isValid(professorId)) {
      return next(new HttpError("Invalid professor ID", 400));
    }

    const formattedTime = new Date(time);

    if (isNaN(formattedTime.getTime())) {
      return next(new HttpError("Invalid appointment time", 400));
    }

    const availability = await Availability.findOne({
      professorId,
      startTime: { $lte: formattedTime },
      endTime: { $gt: formattedTime }
    });

    if (!availability) {
      return next(new HttpError("Selected time is not available", 400));
    }

    const appointment = await Appointment.create({
      studentId,
      professorId,
      time: formattedTime,
      status: "booked"
    });

    res.status(201).json({
      message: "Appointment booked successfully",
      appointment
    });

  } catch (error) {
    if (error.code === 11000) {
      return next(new HttpError("This professor's time slot is already booked", 409));
    }

    console.error("Booking error:", error);
    return next(new HttpError("Failed to book appointment", 500));
  }
};


  const getStudentAppointments = async (req, res, next) => {
    try {
      const studentId = req.user.id;  // Extract the student ID from the token (from authMiddleware)
      console.log("studentId from token:", studentId);
      console.log("Querying database with studentId:", new mongoose.Types.ObjectId(studentId));
       // debugging the id
      // Fetch all booked appointments for the student
      const appointments = await Appointment.find({
        studentId:new mongoose.Types.ObjectId(studentId),
        status: 'booked',  // Only show booked appointments
      }).populate('professorId', 'name');  // Populate professor's name in the response
        console.log(appointments);
      if (!appointments || appointments.length === 0) {
        return next(new HttpError("You have no pending appointments", 404));
      }
  
      // Format the response to show the appointment details and times
      const formattedAppointments = appointments.map(appointment => ({
        professor: appointment.professorId.name,  // Show professor's name
        appointmentTime: moment.utc(appointment.time).format('MMMM Do YYYY, h:mm:ss a'),  // Format time with moment.js
        status: appointment.status,
      }));
  
      res.status(200).json({
        message: "Your upcoming appointments:",
        appointments: formattedAppointments,
      });
  
    } catch (error) {
      console.error("Error fetching appointments:", error);
      return next(new HttpError("Failed to retrieve appointments", 500));
    }
  };

export { getAvailableSlots, bookAppointment, getStudentAppointments };