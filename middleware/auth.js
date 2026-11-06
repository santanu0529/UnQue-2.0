import jwt from "jsonwebtoken";
import { HttpError } from "../models/error.js";

// Verify JWT token
const authMiddleware = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return next(new HttpError("Unauthorized: No token provided", 401));
  }

  if (!process.env.JWT_SECRET) {
    return next(new HttpError("Server authentication configuration error", 500));
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, info) => {
    if (err || !info || typeof info !== "object") {
      return next(new HttpError("Unauthorized: Invalid token", 401));
    }

    if (
      !info.id ||
      !["student", "professor"].includes(info.role)
    ) {
      return next(new HttpError("Unauthorized: Invalid token payload", 401));
    }

    req.user = info;
    next();
  });
};

// Only professors can access
const profMiddleware = (req, res, next) => {
  if (req.user?.role !== "professor") {
    return next(new HttpError("Access denied: Professors only", 403));
  }

  next();
};

// Only students can access
const studentMiddleware = (req, res, next) => {
  if (req.user?.role !== "student") {
    return next(new HttpError("Access denied: Students only", 403));
  }

  next();
};

export { authMiddleware, profMiddleware, studentMiddleware };