import mongoose from "mongoose";

const urlSchema = new mongoose.Schema(
  {
    originalUrl: {
      type: String,
      required: true,
    },

    shortId: {
      type: String,
      required: true,
      unique: true,
    },

    clicks: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Url = mongoose.model("Url", urlSchema);

export default Url;
