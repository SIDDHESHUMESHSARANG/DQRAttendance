
import mongoose from "mongoose";

const qrTokenSchema = new mongoose.Schema(
  {
    lecture: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lecture",
      required: true,
      index: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    isUsed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Expired QR token records ko automatically clean karne ke liye TTL index.
qrTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

const QRToken = mongoose.model("QRToken", qrTokenSchema);

export default QRToken;
