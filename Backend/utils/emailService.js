import "dotenv/config";
import nodemailer from "nodemailer";

console.log("SMTP HOST:", process.env.SMTP_HOST);
console.log("SMTP PORT:", process.env.SMTP_PORT);

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// Admin Registration OTP
export const sendAdminOTP = async (email, otp) => {
    try {
        const result = await transporter.sendMail({
            from: process.env.MAIL_FROM,
            to: email,
            subject: "Admin Registration OTP - QR Attendance System",
            text: `Your Admin registration OTP is ${otp}. It is valid for 3 minutes. Do not share this OTP with anyone.`,
        });

        console.log(
            "Admin OTP email sent successfully:",
            result.messageId
        );

        return result;
    } catch (error) {
        console.error(
            "Admin OTP email failed:",
            error.code,
            error.message
        );
        throw error;
    }
};

// Professor Registration OTP
export const sendProfessorRegistrationOTP = async (email, otp) => {
    try {
        const result = await transporter.sendMail({
            from: process.env.MAIL_FROM,
            to: email,
            subject: "Professor Registration OTP - QR Attendance System",
            text: `Your Professor registration OTP is ${otp}. It is valid for 3 minutes. Do not share this OTP with anyone.`,
        });

        console.log(
            "Professor OTP email sent successfully:",
            result.messageId
        );

        return result;
    } catch (error) {
        console.error(
            "Professor OTP email failed:",
            error.code,
            error.message
        );
        throw error;
    }
};
