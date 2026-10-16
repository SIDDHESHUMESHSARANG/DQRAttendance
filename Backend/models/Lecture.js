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
    },
    {
        timestamps: true,
    }
);

const Lecture = mongoose.model("Lecture", lectureSchema);

export default Lecture;
