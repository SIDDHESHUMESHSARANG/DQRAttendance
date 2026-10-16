import Student from "../models/Student.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// ==========================================
//           CORE CRUD OPERATIONS
// ==========================================

/**
 * 1. CREATE: STUDENT REGISTRATION
 * Creates a brand new student account with encrypted credentials.
 */
export const registerStudent = async (req, res) => {
  try {
    const {
      email,
      password,
      fullName,
      rollNo,
      batch,
      class: className,
    } = req.body;

    const existingStudent = await Student.findOne({
      email: email.toLowerCase(),
    });
    if (existingStudent) {
      return res
        .status(400)
        .json({ success: false, message: "Email is already registered." });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newStudent = new Student({
      email,
      passwordHash,
      academicDetails: { fullName, rollNo, batch, class: className },
    });

    await newStudent.save();
    return res
      .status(201)
      .json({
        success: true,
        message: "Student account created successfully! You can now log in.",
      });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Registration failed.",
        error: error.message,
      });
  }
};

/**
 * 2. LOGIN: STUDENT AUTHENTICATION
 * Authenticates credentials, runs device checks, and issues a secure JWT token.
 */
export const loginStudent = async (req, res) => {
  try {
    const { email, password, incomingDeviceUuid } = req.body;

    const student = await Student.findOne({ email: email.toLowerCase() });
    if (!student) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, student.passwordHash);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    if (
      student.deviceSecurity.isLocked &&
      student.deviceSecurity.deviceUuid !== incomingDeviceUuid
    ) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Security Access Denied: Device mismatch.",
        });
    }

    const token = jwt.sign(
      { id: student._id, role: student.role },
      process.env.JWT_SECRET || "fallback_secret_key",
      { expiresIn: "1d" },
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      isDeviceRegistered: student.deviceSecurity.isLocked,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Login failed.", error: error.message });
  }
};

/**
 * 3. READ: GET STUDENT PROFILE & DASHBOARD
 * Retrieves attendance metrics and academic information for the logged-in student.
 */
export const getStudentDashboard = async (req, res) => {
  try {
    const student = await Student.findById(req.user.id).select("-passwordHash");
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student record not found." });
    }
    return res.status(200).json({ success: true, data: student });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Server error while fetching dashboard.",
        error: error.message,
      });
  }
};

/**
 * 4. UPDATE: UPDATE STUDENT PROFILE
 * Allows students to update basic information like their name.
 */
export const updateStudentProfile = async (req, res) => {
  try {
    const { fullName } = req.body;

    const student = await Student.findById(req.user.id);
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });
    }

    if (fullName) student.academicDetails.fullName = fullName;
    await student.save();

    return res
      .status(200)
      .json({
        success: true,
        message: "Profile updated successfully.",
        data: student,
      });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to update profile.",
        error: error.message,
      });
  }
};

/**
 * 5. DELETE: DELETE STUDENT ACCOUNT
 * Permanently removes the logged-in student's account from the system.
 */
export const deleteStudentAccount = async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.user.id);
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });
    }
    return res
      .status(200)
      .json({ success: true, message: "Account deleted successfully." });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete account.",
        error: error.message,
      });
  }
};

// ==========================================
//       PROJECT-SPECIFIC SECURITY METRICS
// ==========================================

/**
 * 6. REGISTER DEVICE FINGERPRINT (One-Device, One-Student Policy)
 * Pairs the student's account to their smartphone device browser fingerprint during first setup.
 */
export const registerDeviceFingerprint = async (req, res) => {
  try {
    const { rawFingerprintData, platformInfo } = req.body;

    if (!rawFingerprintData) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Device hardware signature missing.",
        });
    }

    const generatedUuid = crypto
      .createHash("sha256")
      .update(rawFingerprintData)
      .digest("hex");
    const student = await Student.findById(req.user.id);

    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student record not found." });
    }

    if (student.deviceSecurity.isLocked) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Account locked to another physical device. Contact admin.",
        });
    }

    student.deviceSecurity.deviceUuid = generatedUuid;
    student.deviceSecurity.isLocked = true;
    student.deviceSecurity.lastUsedPlatform =
      platformInfo || "Unknown Browser Context";

    await student.save();
    return res
      .status(200)
      .json({
        success: true,
        message: "Device fingerprint registered successfully.",
      });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({
          success: false,
          message:
            "This physical device is already bound to another student account.",
        });
    }
    return res
      .status(500)
      .json({
        success: false,
        message: "Internal server registry error.",
        error: error.message,
      });
  }
};

// Helper function: Calculates distance between two points using the Haversine formula
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance returned in meters
};

/**
 * 7. SCAN AND SCANNER LOGIC (Core Dynamic Verification Engine)
 * Processes QR payload string, evaluates 3-5 second window, checks geofencing, updates stats.
 */
export const processQrAttendance = async (req, res) => {
  try {
    const {
      qrToken,
      clientTimestamp,
      latitude,
      longitude,
      incomingDeviceUuid,
    } = req.body;

    const student = await Student.findById(req.user.id);
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student record not found." });
    }

    if (student.deviceSecurity.deviceUuid !== incomingDeviceUuid) {
      return res
        .status(401)
        .json({
          success: false,
          message: "Security Violation: Device signature mismatch.",
        });
    }

    const currentTime = Date.now();
    const tokenAgeInMs = currentTime - clientTimestamp;

    if (tokenAgeInMs > 5000 || tokenAgeInMs < 0) {
      return res
        .status(410)
        .json({
          success: false,
          message: "QR Token expired. Refresh and rescan immediately.",
        });
    }

    const classroomLat = 19.2183;
    const classroomLon = 73.1843;
    const distanceMeters = calculateHaversineDistance(
      latitude,
      longitude,
      classroomLat,
      classroomLon,
    );

    if (distanceMeters > 30) {
      return res.status(403).json({
        success: false,
        message: `Geofence violation: Out of bounds. You are ${Math.round(distanceMeters)}m away from the classroom.`,
        isAnomaly: true,
      });
    }

    student.attendanceSummary.totalSessionsConducted += 1;
    student.attendanceSummary.totalSessionsAttended += 1;
    await student.save();

    return res.status(200).json({
      success: true,
      message: "Attendance recorded successfully.",
      newPercentage: student.attendanceSummary.attendancePercentage,
    });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Attendance validation failure.",
        error: error.message,
      });
  }
};
