const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const {
  createNote,
  getNotes,
  getStats,
  getTags,
  updateNote,
  toggleFavorite,
  togglePin,
  toggleArchive,
  deleteNote,
  restoreNote,
  permanentDelete
} = require("../controllers/noteController");

const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

// Bad ids (e.g. /api/notes/abc) get a clean 404 instead of a 500 cast error
router.param("id", (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ message: "Note not found" });
  }
  next();
});

router.post("/", createNote);
router.get("/", getNotes);

// Must stay above any "/:id" routes
router.get("/stats", getStats);
router.get("/tags", getTags);

router.patch("/:id/favorite", toggleFavorite);
router.patch("/:id/pin", togglePin);
router.patch("/:id/archive", toggleArchive);
router.patch("/:id/restore", restoreNote);

router.delete("/:id/permanent", permanentDelete);
router.delete("/:id", deleteNote);

router.put("/:id", updateNote);

module.exports = router;
