import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";

import { notFound, errorMiddleware } from "./middleware/error.js";

import userRoutes from "./routes/user.js";
import professorRoutes from "./routes/proff.js";
import generalRoutes from "./routes/general.js";

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(morgan("common"));
app.use(cors());

// API Routes
app.use("/users", userRoutes);
app.use("/professor", professorRoutes);
app.use("/general", generalRoutes);

// Error Handling
app.use(notFound);
app.use(errorMiddleware);

// Server Configuration
const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from environment variables");
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();