const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "private"
    },
    tags: {
      type: [String],
      default: []
    },
    isPinned: {
      type: Boolean,
      default: false
    },
    isFavorite: {
      type: Boolean,
      default: false
    },
    isArchived: {
      type: Boolean,
      default: false
    },
    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

noteSchema.index({ user: 1, isDeleted: 1, isArchived: 1 });
noteSchema.index({ visibility: 1, isDeleted: 1, isArchived: 1 });

module.exports = mongoose.model("Note", noteSchema);
