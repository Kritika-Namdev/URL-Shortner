import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { createRedirectRoutes, createUrlApiRoutes } from "./routes/url.route.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5000);
const baseUrl = (
  process.env.BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${port}`
).replace(/\/$/, "");
const frontendDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../frontend/dist"
);

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is missing. Add it to backend/.env or Render environment variables.");
  process.exit(1);
}

if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16) {
  console.error("ADMIN_PASSWORD must contain at least 16 characters to protect link management.");
  process.exit(1);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be a valid TCP port between 1 and 65535.");
  process.exit(1);
}

const getMongoUri = (uri) => {
  if (!uri) return "";
  const cleanedUri = uri.replace(/<([^>]+)>/g, "$1");
  if (!cleanedUri.startsWith("mongodb+srv://") && !cleanedUri.startsWith("mongodb://")) return cleanedUri;

  try {
    const parsedUri = new URL(cleanedUri);
    if (parsedUri.username && !parsedUri.searchParams.has("authSource")) {
      parsedUri.searchParams.set("authSource", "admin");
    }
    return parsedUri.toString();
  } catch {
    return cleanedUri;
  }
};

const mongoUri = getMongoUri(process.env.MONGO_URI);
const adminPassword = process.env.ADMIN_PASSWORD || "";

const requireAdmin = (req, res, next) => {
  if (!adminPassword) {
    return res.status(503).json({ error: "Set ADMIN_PASSWORD to enable link management." });
  }

  const expected = Buffer.from(adminPassword);
  const supplied = Buffer.from(req.get("x-admin-password") || "");
  const matches = supplied.length === expected.length && timingSafeEqual(supplied, expected);

  if (!matches) return res.status(401).json({ error: "Management password is incorrect." });
  return next();
};

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "10kb" }));

app.get("/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "starting",
    database: connected ? "connected" : "disconnected",
  });
});

app.use("/api/urls", createUrlApiRoutes({ baseUrl, requireAdmin }));
app.use(express.static(frontendDist, { index: false }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"), (error) => {
    if (error && !res.headersSent) {
      res.status(200).send("URL Shortener API is running. Start the Vite frontend for local development.");
    }
  });
});

app.use("/", createRedirectRoutes());

app.use((error, _req, res, _next) => {
  console.error("Request failed:", error.message);
  res.status(error.status || 500).json({ error: "Server error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`URL Shortener listening on port ${port}`);
});

const connectToMongoDB = async () => {
  let retryDelay = 1000;

  while (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
      console.log("Connected to MongoDB");
      return;
    } catch (error) {
      console.error(`MongoDB connection failed: ${error.message}`);
      console.error(`Retrying database connection in ${retryDelay / 1000}s.`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(retryDelay * 2, 30000);
    }
  }
};

void connectToMongoDB();
