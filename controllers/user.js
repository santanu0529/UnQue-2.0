import { HttpError } from "../models/error.js";

import {
  createUser,
  getUserByEmail,
  getUserById,
} from "../models/user.js";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// ==========================================
// 1. User Registration
// ==========================================

const register = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      confirmPassword,
      role,
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !email ||
      !password ||
      !confirmPassword ||
      !role
    ) {
      return next(
        new HttpError("Fill in all the fields", 422)
      );
    }

    // Validate input types
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof confirmPassword !== "string" ||
      typeof role !== "string"
    ) {
      return next(
        new HttpError("Invalid input format", 422)
      );
    }

    const trimmedName = name.trim();
    const newEmail = email.trim().toLowerCase();

    // Validate name
    if (!trimmedName || trimmedName.length > 100) {
      return next(
        new HttpError("Name must be between 1 and 100 characters", 422)
      );
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      newEmail.length > 254 ||
      !emailRegex.test(newEmail)
    ) {
      return next(
        new HttpError("Please provide a valid email address", 422)
      );
    }

    // Validate role
    if (!["professor", "student"].includes(role)) {
      return next(
        new HttpError("Invalid user role", 422)
      );
    }

    // Validate password
    if (password.length < 8) {
      return next(
        new HttpError(
          "Password must contain at least 8 characters",
          422
        )
      );
    }

    if (password !== confirmPassword) {
      return next(
        new HttpError("Passwords do not match", 422)
      );
    }

    // Check whether email already exists
    const existingUser = await getUserByEmail(newEmail);

    if (existingUser) {
      return next(
        new HttpError("Email already exists", 409)
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 11);

    let newUser;

    try {
      newUser = await createUser({
        name: trimmedName,
        email: newEmail,
        password: hashedPassword,
        role,
      });
    } catch (error) {
      // Prevent duplicate email registration
      if (error.name === "ConditionalCheckFailedException") {
        return next(
          new HttpError("Email already exists", 409)
        );
      }

      throw error;
    }

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      user: {
        id: newUser.userId,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });

  } catch (error) {
    console.error(
      "Registration error:",
      error.name,
      error.message
    );

    return next(
      new HttpError("User registration failed", 500)
    );
  }
};

// ==========================================
// 2. User Login
// ==========================================

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (
      !email ||
      !password ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return next(
        new HttpError("Please provide valid login credentials", 422)
      );
    }

    // Check JWT configuration
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing");

      return next(
        new HttpError("Server authentication configuration error", 500)
      );
    }

    const newEmail = email.trim().toLowerCase();

    const user = await getUserByEmail(newEmail);

    if (!user) {
      return next(
        new HttpError("Invalid credentials", 401)
      );
    }

    // Compare password with stored hash
    const comparePassword = await bcrypt.compare(
      password,
      user.password
    );

    if (!comparePassword) {
      return next(
        new HttpError("Invalid credentials", 401)
      );
    }

    const {
      userId: id,
      name,
      role,
    } = user;

    // Generate JWT token
    const token = jwt.sign(
      { id, name, role },
      process.env.JWT_SECRET,
      { expiresIn: "2d" }
    );

    return res.status(200).json({
      success: true,
      token,
      id,
      name,
      role,
    });

  } catch (error) {
    console.error(
      "Login error:",
      error.name,
      error.message
    );

    return next(
      new HttpError("Login failed", 500)
    );
  }
};

// ==========================================
// 3. Get User Profile
// ==========================================

const getUserProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return next(
        new HttpError("User ID is required", 400)
      );
    }

    // Users can access only their own profile
    if (req.user.id !== id) {
      return next(
        new HttpError("Access denied", 403)
      );
    }

    const user = await getUserById(id);

    if (!user) {
      return next(
        new HttpError("User not found", 404)
      );
    }

    // Never expose password hash
    const {
      password,
      ...safeUser
    } = user;

    return res.status(200).json({
      success: true,
      user: safeUser,
    });

  } catch (error) {
    console.error(
      "Profile error:",
      error.name,
      error.message
    );

    return next(
      new HttpError("Failed to retrieve user profile", 500)
    );
  }
};

// ==========================================
// EXPORT CONTROLLERS
// ==========================================

export {
  register,
  login,
  getUserProfile,
};