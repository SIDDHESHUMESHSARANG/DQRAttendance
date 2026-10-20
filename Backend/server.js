import express from "express";
import connectDB from "./config/db.js";
import dotenv from "dotenv";
import cors from "cors";

import adminRoutes from "./routes/adminRoutes.js";
import professorRoutes from "./routes/professorRoutes.js";
import lectureRoutes from "./routes/lectureRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import classroomRoutes from "./routes/classroomRoutes.js";

dotenv.config();

const app = express();

// CORS configuration for the Vite frontend
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// API routes
app.use("/api/admin", adminRoutes);
app.use("/api/professors", professorRoutes);
app.use("/api/lectures", lectureRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/classrooms", classroomRoutes);

// Health check
app.get("/", (req, res) => {
  res.send("DQRAttendance Backend Running");
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
