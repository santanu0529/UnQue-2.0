import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    professorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    time: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["booked", "completed", "cancelled"],
      default: "booked",
    },
  },
  { timestamps: true }
);

// Only one active booking per professor at a particular time
appointmentSchema.index(
  { professorId: 1, time: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "booked" }
  }
);

const Appointment = mongoose.model("Appointment", appointmentSchema);

export { Appointment };