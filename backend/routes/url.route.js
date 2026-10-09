import express from "express";
import { nanoid } from "nanoid";
import Url from "../models/url.model.js";

const validateUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return "Enter a URL to shorten.";
  const trimmed = value.trim();
  if (trimmed.length > 2048) return "URL must be 2048 characters or fewer.";

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "Only http:// and https:// URLs are supported.";
    }
  } catch {
    return "Enter a valid URL, including https://.";
  }
  return null;
};

const parseExpiration = (value) => {
  if (value === null || value === "") return { value: null };
  if (value === undefined) return { error: "Expiration value is invalid." };

  const expiration = new Date(value);
  if (Number.isNaN(expiration.getTime())) {
    return { error: "Enter a valid expiration date and time." };
  }
  if (expiration <= new Date()) {
    return { error: "Expiration must be in the future." };
  }
  return { value: expiration };
};

const presentUrl = (url, baseUrl) => ({
  id: url._id,
  shortId: url.shortId,
  shortUrl: `${baseUrl}/${url.shortId}`,
  originalUrl: url.originalUrl,
  clicks: url.clicks,
  createdAt: url.createdAt,
  updatedAt: url.updatedAt,
  expiresAt: url.expiresAt,
  status: url.expiresAt && url.expiresAt <= new Date() ? "expired" : "active",
});

export function createUrlApiRoutes({ baseUrl, requireAdmin }) {
  const router = express.Router();
  const checkAdmin = requireAdmin || ((_req, _res, next) => next());

  router.post("/", async (req, res, next) => {
    const originalUrl = typeof req.body?.originalUrl === "string" ? req.body.originalUrl.trim() : "";
    const urlError = validateUrl(originalUrl);
    if (urlError) return res.status(400).json({ error: urlError });

    let expiresAt = null;
    if (Object.hasOwn(req.body, "expiresAt")) {
      const parsedExpiration = parseExpiration(req.body.expiresAt);
      if (parsedExpiration.error) return res.status(400).json({ error: parsedExpiration.error });
      expiresAt = parsedExpiration.value;
    }

    try {
      let shortId;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = nanoid(7);
        if (!(await Url.exists({ shortId: candidate }))) {
          shortId = candidate;
          break;
        }
      }
      if (!shortId) return res.status(503).json({ error: "Could not allocate a short link. Try again." });

      const url = await Url.create({ originalUrl, shortId, expiresAt });
      return res.status(201).json(presentUrl(url, baseUrl));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/", checkAdmin, async (_req, res, next) => {
    try {
      const urls = await Url.find().sort({ createdAt: -1 }).limit(200).lean();
      return res.json(urls.map((url) => presentUrl(url, baseUrl)));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:shortId/stats", async (req, res, next) => {
    try {
      const url = await Url.findOne({ shortId: req.params.shortId }).lean();
      if (!url) return res.status(404).json({ error: "Short link not found." });
      return res.json(presentUrl(url, baseUrl));
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/:shortId", checkAdmin, async (req, res, next) => {
    const updates = {};

    if (Object.hasOwn(req.body ?? {}, "originalUrl")) {
      const originalUrl = typeof req.body.originalUrl === "string" ? req.body.originalUrl.trim() : "";
      const urlError = validateUrl(originalUrl);
      if (urlError) return res.status(400).json({ error: urlError });
      updates.originalUrl = originalUrl;
    }

    if (Object.hasOwn(req.body ?? {}, "expiresAt")) {
      const parsedExpiration = parseExpiration(req.body.expiresAt);
      if (parsedExpiration.error) return res.status(400).json({ error: parsedExpiration.error });
      updates.expiresAt = parsedExpiration.value;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Provide a new URL or expiration date." });
    }

    try {
      const url = await Url.findOneAndUpdate(
        { shortId: req.params.shortId },
        { $set: updates },
        { new: true, runValidators: true }
      ).lean();
      if (!url) return res.status(404).json({ error: "Short link not found." });
      return res.json(presentUrl(url, baseUrl));
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/:shortId", checkAdmin, async (req, res, next) => {
    try {
      const url = await Url.findOneAndDelete({ shortId: req.params.shortId });
      if (!url) return res.status(404).json({ error: "Short link not found." });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

export function createRedirectRoutes() {
  const router = express.Router();

  router.get("/:shortId", async (req, res, next) => {
    try {
      const url = await Url.findOne({ shortId: req.params.shortId });
      if (!url) return res.status(404).json({ error: "Short link not found." });
      if (url.expiresAt && url.expiresAt <= new Date()) {
        return res.status(410).send("This short link has expired.");
      }

      await Url.updateOne({ _id: url._id }, { $inc: { clicks: 1 } });
      return res.redirect(302, url.originalUrl);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
