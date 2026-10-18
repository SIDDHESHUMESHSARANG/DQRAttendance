import express from "express";
import connectDB from "./config/db.js";
import dotenv from "dotenv";
import adminRoutes from "./routes/adminRoutes.js";
import professorRoutes from "./routes/professorRoutes.js";
import lectureRoutes from "./routes/lectureRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import classroomRoutes from "./routes/classroomRoutes.js";

dotenv.config();

const app = express();

app.use(express.json());

app.use("/api/admin", adminRoutes);
app.use("/api/professors", professorRoutes);
app.use("/api/lectures", lectureRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/classrooms", classroomRoutes);
app.get("/", (req, res) => {
    res.send("QR Based Attendance System Backend Running");
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await connectDB();

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Failed to connect to database:", error.message);
        process.exit(1);
    }
};

startServer();
