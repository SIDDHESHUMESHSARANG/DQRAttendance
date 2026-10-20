
import crypto from "crypto";
import Lecture from "../models/Lecture.js";
import QRToken from "../models/QRToken.js";

const isValidObjectId = (value) =>
  typeof value === "string" &&
  /^[a-f\d]{24}$/i.test(value);

// Professor ke ongoing lecture ka QR token generate karna
export const generateLectureQR = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lecture ID.",
      });
    }

    const lecture = await Lecture.findById(id);

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: "Lecture not found.",
      });
    }

    if (lecture.professor.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can generate QR only for your own lecture.",
      });
    }

    if (lecture.status !== "ongoing") {
      return res.status(400).json({
        success: false,
        message: "QR can be generated only for an ongoing lecture.",
      });
    }

    // Random secret token; database mein sirf hash store hoga.
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiresAt = new Date(Date.now() + 15 * 1000);

    
    await QRToken.deleteMany({
      lecture: lecture._id,
      expiresAt: { $lte: new Date() },
    });

    await QRToken.create({
      lecture: lecture._id,
      tokenHash,
      expiresAt,
      isUsed: false,
    });

    return res.status(201).json({
      success: true,
      message: "QR token generated successfully.",
      qrData: {
        lectureId: lecture._id,
        token: rawToken,
        expiresAt,
      },
    });
  } catch (error) {
    console.error("QR generation failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to generate QR token.",
    });
  }
};

// Student ke QR token ko validate karna
export const validateLectureQR = async (req, res) => {
  try {
    const { lectureId, token } = req.body || {};

    if (
      !isValidObjectId(lectureId) ||
      typeof token !== "string" ||
      !/^[a-f\d]{64}$/i.test(token)
    ) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "Invalid QR data.",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const qrToken = await QRToken.findOne({
      lecture: lectureId,
      tokenHash,
    });

    if (!qrToken) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "QR token is invalid or has been replaced.",
      });
    }

    if (qrToken.expiresAt <= new Date()) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "QR token has expired. Scan the latest QR.",
      });
    }

    const lecture = await Lecture.findById(lectureId);

    if (!lecture || lecture.status !== "ongoing") {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "Lecture is not active.",
      });
    }

    return res.status(200).json({
      success: true,
      valid: true,
      message: "QR token is valid.",
      lecture: {
        id: lecture._id,
        subject: lecture.subject,
        assignedClass: lecture.assignedClass,
        professorName: lecture.professorName,
      },
    });
  } catch (error) {
    console.error("QR validation failed:", error.message);

    return res.status(500).json({
      success: false,
      valid: false,
      message: "Unable to validate QR token.",
    });
  }
};
