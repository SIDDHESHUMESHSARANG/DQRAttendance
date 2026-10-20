
import mongoose from "mongoose";

const classroomSchema = new mongoose.Schema(
    {
        classroomName: {
            type: String,
            required: true,
            trim: true,
        },

        building: {
            type: String,
            trim: true,
            default: "",
        },

        // Optional legacy fields.
        // Classroom creation no longer requires GPS coordinates.
        latitude: {
            type: Number,
            required: false,
            min: -90,
            max: 90,
        },

        longitude: {
            type: Number,
            required: false,
            min: -180,
            max: 180,
        },

        radiusMeters: {
            type: Number,
            default: 30,
            min: 1,
            max: 500,
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

// Classroom name must be unique within the same building.
classroomSchema.index(
    { classroomName: 1, building: 1 },
    { unique: true }
);

const Classroom = mongoose.model("Classroom", classroomSchema);

export default Classroom;
