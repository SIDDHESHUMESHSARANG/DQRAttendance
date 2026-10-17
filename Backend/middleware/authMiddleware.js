
import jwt from "jsonwebtoken";
import crypto from "crypto";
import RevokedToken from "../models/RevokedToken.js";

// Authentication Middleware
const authMiddleware = async (req, res, next) => {
  try {
    // 1. Get Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Access denied. Token required.",
      });
    }

    // 2. Extract JWT token
    const token = authHeader.split(" ")[1];

    // 3. Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Generate token hash
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // 5. Check whether token has been revoked
    const revokedToken = await RevokedToken.findOne({
      tokenHash,
    });

    if (revokedToken) {
      return res.status(401).json({
        message: "Token has been revoked. Please login again.",
      });
    }

    // 6. Store decoded user information
    req.user = decoded;

    // 7. Continue to the next middleware or route
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Token expired. Please login again.",
      });
    }

    if (
      error.name === "JsonWebTokenError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        message: "Invalid token",
      });
    }

    console.error("Authentication error:", error.message);

    return res.status(500).json({
      message: "Authentication service error",
    });
  }
};

// Role-Based Authorization Middleware
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    // Check whether the user is authenticated
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    // Check whether the user's role is allowed
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message:
          "Access denied. You do not have permission to access this resource.",
      });
    }

    // User has the required role
    next();
  };
};

export { authorizeRoles };
export default authMiddleware;
