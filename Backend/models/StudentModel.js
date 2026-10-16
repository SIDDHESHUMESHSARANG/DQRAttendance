import mongoose from "mongoose";
import { applyStudentMiddleware } from "./studentMiddleware.js";

const studentSchema = new mongoose.Schema(
  {
    // 1. Authentication & System Access
    email: {
      type: String,
      required: [true, "Email is mandatory"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },

    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
    },

    // 2. Academic Identity & Grouping
    academicDetails: {
      fullName: { type: String, required: true, trim: true },
      rollNo: { type: Number, required: true }, // e.g., 81 or 86
      batch: { type: String, required: true, uppercase: true }, // e.g., "B4"
      class: { type: String, required: true, uppercase: true }, // e.g., "TYCS"
    },

    // 3. One-Device, One-Student Security Policy
    deviceSecurity: {
      deviceUuid: {
        type: String,
        default: null,
        unique: true, // Prevents two accounts from sharing the same device ID
        sparse: true, // Allows this field to remain null until the first login registration
      },
      isLocked: { type: Boolean, default: false },
      lastUsedPlatform: { type: String, default: "Unknown" },
    },

    // 4. Aggregated Attendance Metrics (For Dashboard & Low Attendance Alerts)
    attendanceSummary: {
      totalSessionsConducted: { type: Number, default: 0 },
      totalSessionsAttended: { type: Number, default: 0 },
      attendancePercentage: {
        type: Number,
        default: 0.0,
        min: 0,
        max: 100,
      },
    },
  },
  {
    timestamps: true,
  },
);

applyStudentMiddleware(studentSchema);

const Student = mongoose.model("Student", studentSchema);
export default Student;
