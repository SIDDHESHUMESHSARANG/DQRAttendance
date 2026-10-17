import mongoose from "mongoose";

const professorSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        password: {
            type: String,
            required: function () {
                return this.isRegistered;
            },
            select: false,
        },

        subjects: {
            type: [String],
            default: [],
        },

        assignedClasses: {
            type: [String],
            default: [],
        },

        isRegistered: {
            type: Boolean,
            default: false,
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

const Professor = mongoose.model("Professor", professorSchema);

export default Professor;