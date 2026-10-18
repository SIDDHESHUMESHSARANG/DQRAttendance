
import mongoose from "mongoose";
import { applyStudentMiddleware } from "../middleware/studentMiddleware.js";

const studentSchema = new mongoose.Schema(
    {
        // 1. Authentication & System Access
        email: {
            type: String,
            required: [true, "Email is mandatory"],
            trim: true,
            lowercase: true,
            match: [
                /^\S+@\S+\.\S+$/,
                "Please use a valid email address",
            ],
        },

        passwordHash: {
            type: String,
            required: false,
            select: false,
        },

        // Student activates account through email OTP
        isActivated: {
            type: Boolean,
            default: false,
        },

        // 2. Academic Identity & Grouping
        academicDetails: {
            fullName: {
                type: String,
                required: true,
                trim: true,
            },

            rollNo: {
                type: Number,
                required: true,
                min: 1,
                validate: {
                    validator: Number.isSafeInteger,
                    message: "Roll number must be a whole number",
                },
            },

            batch: {
                type: String,
                required: true,
                uppercase: true,
                trim: true,
            },

            class: {
                type: String,
                required: true,
                uppercase: true,
                trim: true,
            },

            division: {
                type: String,
                required: true,
                trim: true,
                uppercase: true,
            },
        },

        // Student contact information
        phone: {
            type: String,
            default: "",
            trim: true,
        },

        // 3. Device Security
        deviceSecurity: {
            deviceUuid: {
                type: String,
                default: undefined,
            },

            isLocked: {
                type: Boolean,
                default: false,
            },

            lastUsedPlatform: {
                type: String,
                default: "Unknown",
            },
        },

        // 4. Aggregated Attendance Metrics
        attendanceSummary: {
            totalSessionsConducted: {
                type: Number,
                default: 0,
            },

            totalSessionsAttended: {
                type: Number,
                default: 0,
            },

            attendancePercentage: {
                type: Number,
                default: 0,
                min: 0,
                max: 100,
            },
        },
    },
    {
        timestamps: true,
    }
);

// Unique email across all students
studentSchema.index(
    { email: 1 },
    { unique: true }
);

// Roll number unique within the same class
studentSchema.index(
    {
        "academicDetails.class": 1,
        "academicDetails.rollNo": 1,
    },
    {
        unique: true,
    }
);

// Device UUID unique when it contains a string
studentSchema.index(
    { "deviceSecurity.deviceUuid": 1 },
    {
        unique: true,
        partialFilterExpression: {
            "deviceSecurity.deviceUuid": { $type: "string" },
        },
    }
);

// Apply existing student middleware
applyStudentMiddleware(studentSchema);

const Student = mongoose.model("Student", studentSchema);

export default Student;
