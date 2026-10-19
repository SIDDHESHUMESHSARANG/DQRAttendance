import mongoose from "mongoose";
import Student from "../models/StudentModel.js";
import { sendWhatsAppMessage } from "../utils/whatsappService.js";

const LOW_ATTENDANCE_THRESHOLD = 75;

export const getLowAttendanceStudents = async (req, res) => {
  try {
    const students = await Student.find({
      "attendanceSummary.attendancePercentage": {
        $lt: LOW_ATTENDANCE_THRESHOLD,
      },
    })
      .select("email whatsappNumber academicDetails attendanceSummary")
      .sort({ "attendanceSummary.attendancePercentage": 1 });

    return res.status(200).json({
      threshold: LOW_ATTENDANCE_THRESHOLD,
      count: students.length,
      students: students.map((student) => ({
        id: student._id,
        name: student.academicDetails.fullName,
        email: student.email,
        whatsappNumber: student.whatsappNumber,
        rollNo: student.academicDetails.rollNo,
        batch: student.academicDetails.batch,
        class: student.academicDetails.class,
        attendanceSummary: student.attendanceSummary,
      })),
    });
  } catch (error) {
    console.error("Get low-attendance students error:", error.message);

    return res.status(500).json({
      message: "Server error while fetching low-attendance students",
    });
  }
};

export const sendLowAttendanceAlert = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ message: "Invalid student ID" });
    }

    const student = await Student.findById(studentId).select(
      "email whatsappNumber academicDetails attendanceSummary",
    );

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const attendancePercentage =
      student.attendanceSummary.attendancePercentage;

    if (attendancePercentage >= LOW_ATTENDANCE_THRESHOLD) {
      return res.status(409).json({
        message: `Student attendance is not below ${LOW_ATTENDANCE_THRESHOLD}%`,
      });
    }

    if (!student.whatsappNumber) {
      return res.status(400).json({
        message: "Student does not have a WhatsApp number on their profile",
      });
    }

    const studentName = student.academicDetails.fullName;

    const delivery = await sendWhatsAppMessage(
      student.whatsappNumber,
      `Hello ${studentName}, your current attendance is ${attendancePercentage}%. ` +
        `Please contact your professor and attend upcoming classes to improve it.`,
    );

    return res.status(200).json({
      message: "Low-attendance WhatsApp alert sent",
      student: {
        id: student._id,
        name: studentName,
        attendancePercentage,
      },
      messageSid: delivery.sid,
    });
  } catch (error) {
    console.error("Send low-attendance WhatsApp alert error:", error.message);

    return res.status(502).json({
      message: "WhatsApp alert could not be delivered",
    });
  }
};
