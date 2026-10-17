import mongoose from "mongoose";

const pendingProfessorRegistrationSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        },

        otpHash: {
            type: String,
            required: true,
            select: false,
        },

        expiresAt: {
            type: Date,
            required: true,
            index: {
                expires: 0,
            },
        },

        attempts: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },
    },
    {
        timestamps: true,
    }
);

const PendingProfessorRegistration = mongoose.model(
    "PendingProfessorRegistration",
    pendingProfessorRegistrationSchema
);

export default PendingProfessorRegistration;