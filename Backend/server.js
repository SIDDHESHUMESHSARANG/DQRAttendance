
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

/* =========================================
   CORS CONFIGURATION
   Local development + deployed frontend
   ========================================= */

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://10.132.240.22:5173",

  "https://localhost:5173",
  "https://127.0.0.1:5173",
  "https://10.132.240.22:5173",

  // Add deployed frontend URL in .env:
  // FRONTEND_URL=https://your-frontend-domain.com
];

const deployedFrontendUrls = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((url) => url.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const normalizedAllowedOrigins = [
  ...allowedOrigins,
  ...deployedFrontendUrls,
].map((url) => url.replace(/\/+$/, ""));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without Origin, e.g. server-side health checks.
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/+$/, "");

      if (normalizedAllowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      console.error("Blocked CORS origin:", origin);

      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/* =========================================
   MIDDLEWARE
   ========================================= */

app.use(express.json({ limit: "2mb" }));

/* =========================================
   API ROUTES
   Existing routes preserved
   ========================================= */

app.use("/api/admin", adminRoutes);
app.use("/api/professors", professorRoutes);
app.use("/api/lectures", lectureRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/classrooms", classroomRoutes);

/* =========================================
   HEALTH CHECK
   ========================================= */

app.get("/", (req, res) => {
<<<<<<< HEAD
  res.send("DQRSmartAttendance Backend Running");
=======
  res.status(200).json({
    success: true,
    message: "DQRAttendance Backend Running",
    status: "OK",
  });
>>>>>>> a3e500d64674ed8c8e6e248a4790f0f21d6f810e
});

/* =========================================
   ERROR HANDLER
   ========================================= */

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err.message === "Origin not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "Origin not allowed by CORS",
    });
  }

  console.error("Server error:", err);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

/* =========================================
   START SERVER
   ========================================= */

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDB();

    // 0.0.0.0 allows the server to accept network connections.
    // Deployment platforms can provide their own PORT.
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
