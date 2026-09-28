
import mongoose from "mongoose";

const revokedTokenSchema = new mongoose.Schema({
    tokenHash: {
        type: String,
        required: true,
        unique: true
    },
    expiresAt: {
        type: Date,
        required: true,
        expires: 0
    }
}, {
    timestamps: true
});

const RevokedToken = mongoose.model(
    "RevokedToken",
    revokedTokenSchema
);

export default RevokedToken;