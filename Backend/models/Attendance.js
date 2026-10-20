import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    lecture: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lecture",
      required: true,
    },

    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      default: null,
    },

    attendanceDate: {
      type: Date,
      required: true,
    },

    markedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },

    location: {
      latitude: {
        type: Number,
        required: true,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        required: true,
        min: -180,
        max: 180,
      },
      distanceMeters: {
        type: Number,
        required: true,
        min: 0,
      },
    },

    status: {
      type: String,
      enum: ["present", "flagged"],
      default: "present",
      required: true,
    },

    verificationNote: {
      type: String,
      default: "",
      trim: true,
    },

    // Admin verification status
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: function () {
        return this.status === "flagged" ? "pending" : "approved";
      },
    },

    // Admin who reviewed the attendance
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    // Date and time of Admin verification
    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// One student can have only one attendance record per lecture.
attendanceSchema.index(
  { student: 1, lecture: 1 },
  { unique: true }
);

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
