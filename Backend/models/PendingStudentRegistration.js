
import mongoose from "mongoose";

const pendingStudentRegistrationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      unique: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    otpHash: {
      type: String,
      required: true,
      select: false,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
  },
  { timestamps: true }
);

const PendingStudentRegistration = mongoose.model(
  "PendingStudentRegistration",
  pendingStudentRegistrationSchema
);

export default PendingStudentRegistration;
