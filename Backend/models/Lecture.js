
import mongoose from "mongoose";

const lectureSchema = new mongoose.Schema(
    {
        professor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Professor",
            required: true,
        },

        professorName: {
            type: String,
            required: true,
            trim: true,
        },

        subject: {
            type: String,
            required: true,
            trim: true,
        },

        assignedClass: {
            type: String,
            required: true,
            trim: true,
        },

        // Optional reference to an existing Classroom record.
        // A database classroom record is not required.
        classroom: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Classroom",
            default: null,
        },

        // Classroom name entered by Admin.
        classroomName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },

        date: {
            type: Date,
            required: true,
        },

        startTime: {
            type: String,
            required: true,
        },

        endTime: {
            type: String,
            required: true,
        },

        status: {
            type: String,
            enum: ["scheduled", "ongoing", "completed", "cancelled"],
            default: "scheduled",
        },

        // Professor's location captured when attendance starts.
        professorLocation: {
            latitude: {
                type: Number,
                min: -90,
                max: 90,
            },

            longitude: {
                type: Number,
                min: -180,
                max: 180,
            },

            capturedAt: {
                type: Date,
            },
        },

        // Allowed attendance radius around professor's location.
        attendanceRadiusMeters: {
            type: Number,
            default: 30,
            min: 1,
        },
    },
    {
        timestamps: true,
    }
);

const Lecture = mongoose.model("Lecture", lectureSchema);

export default Lecture;
