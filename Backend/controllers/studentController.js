import Student from "../models/StudentModel.js";
import PendingStudentRegistration from "../models/PendingStudentRegistration.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import RevokedToken from "../models/RevokedToken.js";
import { sendStudentRegistrationOTP } from "../utils/emailService.js";
import { sendWhatsAppMessage } from "../utils/whatsappService.js";

import Lecture from "../models/Lecture.js";
import QRToken from "../models/QRToken.js";
import Classroom from "../models/Classroom.js";
import Attendance from "../models/Attendance.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const hashOTP = (otp) =>
  crypto
    .createHmac("sha256", process.env.OTP_SECRET || "")
    .update(String(otp))
    .digest("hex");

const safeCompare = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");

  return (
    bufferA.length > 0 &&
    bufferA.length === bufferB.length &&
    crypto.timingSafeEqual(bufferA, bufferB)
  );
};

const isValidObjectId = (value) =>
  typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6371000;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const safeA = Math.min(1, Math.max(0, a));

  return (
    2 *
    earthRadiusMeters *
    Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA))
  );
};

// 1. Request activation OTP for an Admin-created student record
export const registerStudent = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    if (!process.env.OTP_SECRET) {
      return res.status(500).json({
        success: false,
        message: "OTP configuration is missing.",
      });
    }

    const student = await Student.findOne({ email }).select("+passwordHash");

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "No Admin-created student record found for this email.",
      });
    }

    if (student.isActivated || student.passwordHash) {
      return res.status(409).json({
        success: false,
        message: "Account already activated. Please log in.",
      });
    }

    const existingPending = await PendingStudentRegistration.findOne({
      student: student._id,
    });

    if (existingPending && existingPending.expiresAt > new Date()) {
      return res.status(429).json({
        success: false,
        message: "An OTP was already sent. Please wait 3 minutes.",
      });
    }

    if (existingPending) {
      await PendingStudentRegistration.deleteOne({
        _id: existingPending._id,
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();

    const pending = await PendingStudentRegistration.create({
      student: student._id,
      email,
      otpHash: hashOTP(otp),
      expiresAt: new Date(Date.now() + 3 * 60 * 1000),
      attempts: 0,
    });

    try {
      await sendStudentRegistrationOTP(email, otp);
    } catch (emailError) {
      await PendingStudentRegistration.deleteOne({
        _id: pending._id,
      });

      console.error("Student OTP email failed:", emailError.message);

      return res.status(502).json({
        success: false,
        message: "Unable to send OTP email. Please try again later.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Activation OTP sent. It is valid for 3 minutes.",
    });
  } catch (error) {
    console.error("Student OTP request failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to start student activation.",
    });
  }
};

// 2. Verify OTP and set the student's password
export const verifyStudentOTP = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp ?? "");
    const password = req.body?.password;

    if (!emailRegex.test(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "A valid email and 6-digit OTP are required.",
      });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters.",
      });
    }

    if (!process.env.OTP_SECRET) {
      return res.status(500).json({
        success: false,
        message: "OTP configuration is missing.",
      });
    }

    const pending = await PendingStudentRegistration.findOne({
      email,
    }).select("+otpHash");

    if (!pending) {
      return res.status(400).json({
        success: false,
        message: "Activation request not found. Request a new OTP.",
      });
    }

    if (pending.expiresAt <= new Date()) {
      await PendingStudentRegistration.deleteOne({
        _id: pending._id,
      });

      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    if (!safeCompare(hashOTP(otp), pending.otpHash)) {
      pending.attempts += 1;

      if (pending.attempts >= 5) {
        await PendingStudentRegistration.deleteOne({
          _id: pending._id,
        });

        return res.status(429).json({
          success: false,
          message: "Too many incorrect attempts. Request a new OTP.",
        });
      }

      await pending.save();

      return res.status(400).json({
        success: false,
        message: "Incorrect OTP.",
        attemptsRemaining: 5 - pending.attempts,
      });
    }

    const student = await Student.findOne({
      _id: pending.student,
      email,
    }).select("+passwordHash");

    if (!student) {
      await PendingStudentRegistration.deleteOne({
        _id: pending._id,
      });

      return res.status(404).json({
        success: false,
        message: "Student record not found.",
      });
    }

    if (student.isActivated || student.passwordHash) {
      await PendingStudentRegistration.deleteOne({
        _id: pending._id,
      });

      return res.status(409).json({
        success: false,
        message: "Student account is already activated.",
      });
    }

    student.passwordHash = await bcrypt.hash(password, 10);
    student.isActivated = true;

    await student.save();

    await PendingStudentRegistration.deleteOne({
      _id: pending._id,
    });

    return res.status(200).json({
      success: true,
      message: "Student account activated. You can now log in.",
    });
  } catch (error) {
    console.error("Student OTP verification failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to verify student activation.",
    });
  }
};

// 3. Student login with trusted-device verification
export const loginStudent = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const { password, incomingDeviceUuid, platformInfo } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    if (
      typeof incomingDeviceUuid !== "string" ||
      incomingDeviceUuid.trim().length < 16 ||
      incomingDeviceUuid.length > 2048
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid device identifier is required.",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "JWT configuration is missing.",
      });
    }

    const student = await Student.findOne({ email }).select("+passwordHash");

    if (!student || !student.isActivated || !student.passwordHash) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password, or account not activated.",
      });
    }

    const isMatch = await bcrypt.compare(password, student.passwordHash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const deviceHash = crypto
      .createHash("sha256")
      .update(incomingDeviceUuid)
      .digest("hex");

    if (!student.deviceSecurity) {
      student.deviceSecurity = {
        isLocked: false,
        lastUsedPlatform: "Unknown",
      };
    }

    if (!student.deviceSecurity.isLocked) {
      student.deviceSecurity.deviceUuid = deviceHash;
      student.deviceSecurity.isLocked = true;
      student.deviceSecurity.lastUsedPlatform =
        typeof platformInfo === "string"
          ? platformInfo.slice(0, 100)
          : "Unknown";

      await student.save();
    } else if (student.deviceSecurity.deviceUuid !== deviceHash) {
      return res.status(403).json({
        success: false,
        message:
          "This account is registered to another device. Contact Admin to reset your trusted device.",
      });
    }

    const token = jwt.sign(
      { id: student._id, role: "student" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      isDeviceRegistered: true,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This device is already linked to another account.",
      });
    }

    console.error("Student login failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Login failed.",
    });
  }
};

// 4. Get the logged-in student's dashboard

export const getStudentDashboard = async (req, res) => {
  try {
    const student = await Student.findById(req.user.id).select(
      "-passwordHash -deviceSecurity"
    );

    if (!student || !student.isActivated) {
      return res.status(404).json({
        success: false,
        message: "Student record not found.",
      });
    }

    const studentClass = student.academicDetails?.class?.trim();

    if (!studentClass) {
      return res.status(200).json({
        success: true,
        data: {
          ...student.toObject(),
          attendanceSummary: {
            totalSessionsConducted: 0,
            totalSessionsAttended: 0,
            attendancePercentage: 0,
          },
        },
      });
    }

    // Find completed lectures assigned to this student's class.
    const completedLectures = await Lecture.find({
      assignedClass: {
        $regex: `^${studentClass.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        $options: "i",
      },
      status: "completed",
    }).select("_id");

    const lectureIds = completedLectures.map((lecture) => lecture._id);

    let totalSessionsAttended = 0;

    if (lectureIds.length > 0) {
      totalSessionsAttended = await Attendance.countDocuments({
        student: student._id,
        lecture: { $in: lectureIds },
        $or: [
          { status: "present" },
          { status: "flagged", verificationStatus: "approved" },
        ],
      });
    }

    const totalSessionsConducted = lectureIds.length;

    const attendancePercentage =
      totalSessionsConducted > 0
        ? Number(
            (
              (totalSessionsAttended / totalSessionsConducted) *
              100
            ).toFixed(2)
          )
        : 0;

    return res.status(200).json({
      success: true,
      data: {
        ...student.toObject(),
        attendanceSummary: {
          totalSessionsConducted,
          totalSessionsAttended,
          attendancePercentage,
        },
      },
    });
  } catch (error) {
    console.error("Student dashboard error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch student dashboard.",
    });
  }
};

export const logoutStudent = async (req, res) => {
  try {
    const authorization = req.headers.authorization || "";
    const parts = authorization.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
      return res.status(401).json({
        success: false,
        message: "Bearer token is required.",
      });
    }

    if (!req.user?.exp) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token.",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(parts[1])
      .digest("hex");

    await RevokedToken.create({
      tokenHash,
      expiresAt: new Date(req.user.exp * 1000),
    });

    return res.status(200).json({
      success: true,
      message: "Logout successful.",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({
        success: true,
        message: "Logout successful.",
      });
    }

    console.error("Student logout error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to logout.",
    });
  }
};

// 5. Student can update only their own name
export const updateStudentProfile = async (req, res) => {
  try {
    const fullName = req.body?.fullName?.trim();

    if (!fullName || fullName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "A valid full name is required.",
      });
    }

    const student = await Student.findById(req.user.id);

    if (!student || !student.isActivated) {
      return res.status(404).json({
        success: false,
        message: "Student record not found.",
      });
    }

    student.academicDetails.fullName = fullName;
    await student.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: {
        id: student._id,
        email: student.email,
        academicDetails: student.academicDetails,
      },
    });
  } catch (error) {
    console.error("Student profile update failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update student profile.",
    });
  }
};

// 6. Register a trusted device for the authenticated student
export const registerDeviceFingerprint = async (req, res) => {
  try {
    const { rawFingerprintData, platformInfo } = req.body || {};

    if (
      typeof rawFingerprintData !== "string" ||
      rawFingerprintData.trim().length < 16 ||
      rawFingerprintData.length > 2048
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid device identifier is required.",
      });
    }

    const student = await Student.findById(req.user.id);

    if (!student || !student.isActivated) {
      return res.status(404).json({
        success: false,
        message: "Student record not found.",
      });
    }

    if (!student.deviceSecurity) {
      student.deviceSecurity = {
        isLocked: false,
        lastUsedPlatform: "Unknown",
      };
    }

    const deviceHash = crypto
      .createHash("sha256")
      .update(rawFingerprintData)
      .digest("hex");

    if (student.deviceSecurity.isLocked) {
      if (student.deviceSecurity.deviceUuid !== deviceHash) {
        return res.status(403).json({
          success: false,
          message: "This account is already registered to another device.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "This device is already registered.",
      });
    }

    student.deviceSecurity.deviceUuid = deviceHash;
    student.deviceSecurity.isLocked = true;
    student.deviceSecurity.lastUsedPlatform =
      typeof platformInfo === "string"
        ? platformInfo.slice(0, 100)
        : "Unknown";

    await student.save();

    return res.status(200).json({
      success: true,
      message: "Device registered successfully.",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This device identifier is already linked to another account.",
      });
    }

    console.error("Device registration failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to register device.",
    });
  }
};

// 7. QR attendance with database-based classroom location
export const processQrAttendance = async (req, res) => {
  try {
    const { lectureId, token, latitude, longitude } = req.body || {};
    const studentId = req.user?.id;

    if (
      !studentId ||
      !isValidObjectId(lectureId) ||
      typeof token !== "string" ||
      !/^[a-f\d]{64}$/i.test(token)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid student or QR data.",
      });
    }

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid location coordinates are required.",
      });
    }

    const student = await Student.findById(studentId);

    if (!student || !student.isActivated) {
      return res.status(403).json({
        success: false,
        message: "Student account is not activated.",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const qrToken = await QRToken.findOne({
      lecture: lectureId,
      tokenHash,
      expiresAt: { $gt: new Date() },
    });

    if (!qrToken) {
      return res.status(400).json({
        success: false,
        message: "QR token is invalid or expired. Scan the latest QR.",
      });
    }

    const lecture = await Lecture.findById(lectureId);

    if (!lecture || lecture.status !== "ongoing") {
      return res.status(400).json({
        success: false,
        message: "Lecture is not currently ongoing.",
      });
    }

    const studentClass = student.academicDetails?.class
      ?.trim()
      .toUpperCase();

    const lectureClass = lecture.assignedClass?.trim().toUpperCase();

    if (!studentClass || studentClass !== lectureClass) {
      return res.status(403).json({
        success: false,
        message: "This lecture is not assigned to your class.",
      });
    }

    // Always use the classroom coordinates saved in the database.
    const classroom = await Classroom.findById(lecture.classroom);

    if (
      !classroom ||
      !classroom.isActive ||
      !Number.isFinite(classroom.latitude) ||
      !Number.isFinite(classroom.longitude)
    ) {
      return res.status(400).json({
        success: false,
        message: "Classroom is missing, inactive, or has invalid coordinates.",
      });
    }

    const radiusMeters = classroom.radiusMeters ?? 30;

    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
      return res.status(500).json({
        success: false,
        message: "Classroom attendance radius is incorrectly configured.",
      });
    }

    const distanceMeters = calculateDistanceMeters(
      latitude,
      longitude,
      classroom.latitude,
      classroom.longitude
    );

    const isWithinRadius = distanceMeters <= radiusMeters;

    const existingAttendance = await Attendance.findOne({
      student: student._id,
      lecture: lecture._id,
    });

    if (existingAttendance) {
      return res.status(409).json({
        success: false,
        message: "Attendance has already been recorded for this lecture.",
      });
    }

    const attendanceDate = new Date();
    attendanceDate.setUTCHours(0, 0, 0, 0);

    const attendance = await Attendance.create({
      student: student._id,
      lecture: lecture._id,
      classroom: classroom._id,
      attendanceDate,
      markedAt: new Date(),
      location: {
        latitude,
        longitude,
        distanceMeters: Math.round(distanceMeters * 100) / 100,
      },
      status: isWithinRadius ? "present" : "flagged",
      verificationNote: isWithinRadius
        ? ""
        : `Outside classroom radius. Distance: ${Math.round(
            distanceMeters
          )}m; allowed radius: ${radiusMeters}m. Admin verification required.`,
    });

    // Try to alert Admin, but do not undo a saved attendance record if
    // WhatsApp delivery fails.
    let adminAlertSent = false;

    if (!isWithinRadius) {
      const adminWhatsappNumber = process.env.ADMIN_WHATSAPP_TO;

      if (adminWhatsappNumber) {
        try {
          await sendWhatsAppMessage(
            adminWhatsappNumber,
            `Out-of-range attendance scan: ${
              student.academicDetails?.fullName || "Student"
            } (roll ${
              student.academicDetails?.rollNo || "N/A"
            }, ${student.email}) is ${Math.round(
              distanceMeters
            )}m from classroom ${classroom.name || classroom._id}. ` +
              `Allowed radius: ${radiusMeters}m. Attendance flagged for review.`
          );

          adminAlertSent = true;
        } catch (error) {
          console.error(
            "Out-of-range WhatsApp admin alert failed:",
            error.message
          );
        }
      } else {
        console.warn(
          "ADMIN_WHATSAPP_TO is not configured; alert was not sent."
        );
      }
    }

    return res.status(201).json({
      success: true,
      message: isWithinRadius
        ? "Attendance recorded successfully."
        : "Attendance recorded but flagged for admin verification.",
      attendance: {
        id: attendance._id,
        lectureId: attendance.lecture,
        status: attendance.status,
        distanceMeters: attendance.location.distanceMeters,
        allowedRadiusMeters: radiusMeters,
        verificationRequired: !isWithinRadius,
        adminAlertSent,
        markedAt: attendance.markedAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Attendance has already been recorded for this lecture.",
      });
    }

    console.error("QR attendance recording failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to record attendance.",
    });
  }
};
