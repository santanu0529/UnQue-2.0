import { HttpError } from "../models/error.js";
import {
  createUser,
  getUserByEmail,
  getUserById,
} from "../models/user.js";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// User Registration
const register = async (req, res, next) => {
  try {
    const { name, email, password, confirmPassword, role } = req.body;

    if (!name || !email || !password || !confirmPassword || !role) {
      return next(new HttpError("Fill in all the fields", 422));
    }

    if (!["professor", "student"].includes(role)) {
      return next(new HttpError("Invalid user role", 422));
    }

    if (password.length < 8) {
      return next(
        new HttpError("Password must contain at least 8 characters", 422)
      );
    }

    if (password !== confirmPassword) {
      return next(new HttpError("Passwords do not match", 422));
    }

    const newEmail = email.trim().toLowerCase();

    const existingUser = await getUserByEmail(newEmail);

    if (existingUser) {
      return next(new HttpError("Email already exists", 409));
    }

    const hashedPassword = await bcrypt.hash(password, 11);

    let newUser;

    try {
      newUser = await createUser({
        name: name.trim(),
        email: newEmail,
        password: hashedPassword,
        role,
      });
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException") {
        return next(new HttpError("Email already exists", 409));
      }
      throw error;
    }

    res.status(201).json({
      message: "Registration successful",
      user: {
        id: newUser.userId,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });

  } catch (error) {
    console.error("Registration error:", error);
    return next(new HttpError("User registration failed", 500));
  }
};

// User Login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new HttpError("Fill in all fields", 422));
    }

    const newEmail = email.trim().toLowerCase();

    const user = await getUserByEmail(newEmail);

    if (!user) {
      return next(new HttpError("Invalid credentials", 401));
    }

    const comparePassword = await bcrypt.compare(password, user.password);

    if (!comparePassword) {
      return next(new HttpError("Invalid credentials", 401));
    }

    const { userId: id, name, role } = user;

    const token = jwt.sign(
      { id, name, role },
      process.env.JWT_SECRET,
      { expiresIn: "2d" }
    );

    res.status(200).json({
      token,
      id,
      name,
      role,
    });

  } catch (error) {
    console.error("Login error:", error);
    return next(new HttpError("Login failed", 500));
  }
};

// Get User Profile
const getUserProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user.id !== id) {
      return next(new HttpError("Access denied", 403));
    }

    const user = await getUserById(id);

    if (!user) {
      return next(new HttpError("User not found", 404));
    }

    const { password, ...safeUser } = user;

    res.status(200).json(safeUser);

  } catch (error) {
    console.error("Profile error:", error);
    return next(new HttpError("Failed to retrieve user profile", 500));
  }
};

export { register, login, getUserProfile };