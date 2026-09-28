
import jwt from "jsonwebtoken";
import crypto from "crypto";
import RevokedToken from "../models/RevokedToken.js";

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Access denied. Token required."
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Generate token hash
        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        // Check whether token is revoked
        const revokedToken = await RevokedToken.findOne({
            tokenHash
        });

        if (revokedToken) {
            return res.status(401).json({
                message: "Token has been revoked. Please login again."
            });
        }

        req.user = decoded;
        next();

    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                message: "Token expired. Please login again."
            });
        }

        if (
            error.name === "JsonWebTokenError" ||
            error.name === "NotBeforeError"
        ) {
            return res.status(401).json({
                message: "Invalid token"
            });
        }

        console.error("Authentication error:", error.message);
        return res.status(500).json({
            message: "Authentication service error"
        });
    }
};

export default authMiddleware;