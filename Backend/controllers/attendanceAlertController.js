import mongoose from "mongoose";
import Student from "../models/StudentModel.js";
import Attendance from "../models/Attendance.js";
import Lecture from "../models/Lecture.js";
import { sendWhatsAppMessage } from "../utils/whatsappService.js";

const LOW_ATTENDANCE_THRESHOLD = 75;

const getLiveAttendanceSummaries = async (students) => {
  const completedLectures = await Lecture.find({ status: "completed" })
    .select("_id assignedClass")
    .lean();
  const lectureIds = completedLectures.map((lecture) => lecture._id);
  const studentIds = students.map((student) => student._id);
  const records = lectureIds.length && studentIds.length
    ? await Attendance.find({
      lecture: { $in: lectureIds },
      student: { $in: studentIds },
    })
      .select("student lecture status verificationStatus")
      .lean()
    : [];
  const attendanceByPair = new Map(
    records.map((record) => [
      `${record.student}_${record.lecture}`,
      record,
    ]),
  );

  return new Map(students.map((student) => {
    const studentClass = String(student.academicDetails?.class || "")
      .trim()
      .toLowerCase();
    const assignedLectures = completedLectures.filter(
      (lecture) =>
        String(lecture.assignedClass || "").trim().toLowerCase() ===
        studentClass,
    );
    const attended = assignedLectures.filter((lecture) => {
      const record = attendanceByPair.get(
        `${student._id}_${lecture._id}`,
      );
      return record?.status === "present" ||
        (record?.status === "flagged" &&
          record?.verificationStatus === "approved");
    }).length;
    const conducted = assignedLectures.length;

    return [
      String(student._id),
      {
        totalSessionsConducted: conducted,
        totalSessionsAttended: attended,
        attendancePercentage: conducted
          ? Number(((attended / conducted) * 100).toFixed(2))
          : 0,
      },
    ];
  }));
};

export const getLowAttendanceStudents = async (req, res) => {
  try {
    const students = await Student.find({
    })
      .select("email whatsappNumber academicDetails")
      .lean();
    const summaries = await getLiveAttendanceSummaries(students);
    const lowAttendanceStudents = students
      .map((student) => ({
        ...student,
        attendanceSummary: summaries.get(String(student._id)),
      }))
      .filter(
        (student) =>
          student.attendanceSummary.attendancePercentage <
          LOW_ATTENDANCE_THRESHOLD,
      )
      .sort(
        (a, b) =>
          a.attendanceSummary.attendancePercentage -
          b.attendanceSummary.attendancePercentage,
      );

    return res.status(200).json({
      threshold: LOW_ATTENDANCE_THRESHOLD,
      count: lowAttendanceStudents.length,
      students: lowAttendanceStudents.map((student) => ({
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
      "email whatsappNumber academicDetails",
    ).lean();

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const summary = (await getLiveAttendanceSummaries([student]))
      .get(String(student._id));
    const attendancePercentage = summary.attendancePercentage;

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
