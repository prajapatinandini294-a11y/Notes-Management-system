const Note = require("../models/Note");

/* ---------- helpers ---------- */

// "Work, work , #Ideas" -> ["work", "ideas"]  (max 10 tags, 20 chars each)
const normalizeTags = (tags) => {
  const list = Array.isArray(tags)
    ? tags
    : typeof tags === "string"
    ? tags.split(",")
    : [];

  const cleaned = list
    .map((t) => String(t).trim().toLowerCase().replace(/^#/, "").slice(0, 20))
    .filter(Boolean);

  return [...new Set(cleaned)].slice(0, 10);
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Base filter for each sidebar tab
const buildViewFilter = (view, userId) => {
  if (view === "public") {
    return { visibility: "public", isDeleted: false, isArchived: false };
  }

  const filter = { user: userId };

  if (view === "private") {
    Object.assign(filter, { visibility: "private", isDeleted: false, isArchived: false });
  } else if (view === "favorites") {
    Object.assign(filter, { isFavorite: true, isDeleted: false, isArchived: false });
  } else if (view === "archived") {
    Object.assign(filter, { isArchived: true, isDeleted: false });
  } else if (view === "trash") {
    filter.isDeleted = true;
  } else {
    Object.assign(filter, { isDeleted: false, isArchived: false });
  }

  return filter;
};

const SORTS = {
  newest: { updatedAt: -1 },
  oldest: { updatedAt: 1 },
  az: { title: 1 },
  za: { title: -1 }
};

/* ---------- create / read ---------- */

// Create a note
exports.createNote = async (req, res) => {
  try {
    const { title, description, visibility, tags } = req.body;

    if (!title || !description || !title.trim() || !description.trim()) {
      return res.status(400).json({
        message: "Title and description are required"
      });
    }

    const note = await Note.create({
      title,
      description,
      tags: normalizeTags(tags),
      visibility: visibility === "public" ? "public" : "private",
      user: req.user.id
    });

    res.status(201).json({
      message: "Note created successfully",
      note
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get notes: ?view=all|private|public|favorites|archived|trash
//            &q=search text  &tag=work  &sort=newest|oldest|az|za
exports.getNotes = async (req, res) => {
  try {
    const { view = "all", q = "", tag = "", sort = "newest" } = req.query;

    const filter = buildViewFilter(view, req.user.id);

    const search = String(q).trim();
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ title: regex }, { description: regex }, { tags: regex }];
    }

    const tagFilter = String(tag).trim().toLowerCase().replace(/^#/, "");
    if (tagFilter) filter.tags = tagFilter;

    // Pinned notes come first, but only in personal views (pinning is personal,
    // so it must not reorder the shared Public tab for everyone else)
    const sortBy = SORTS[sort] || SORTS.newest;
    const finalSort = ["trash", "archived", "public"].includes(view)
      ? sortBy
      : { isPinned: -1, ...sortBy };

    const notes = await Note.find(filter)
      .populate("user", "name") // never expose other users' emails
      .sort(finalSort)
      .collation({ locale: "en" }); // case-insensitive A-Z

    res.json(notes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Counts for the sidebar + dashboard (always accurate, whatever tab is open)
exports.getStats = async (req, res) => {
  try {
    const uid = req.user.id;

    const [all, privateCount, publicMine, favorites, archived, trash, publicAll] =
      await Promise.all([
        Note.countDocuments(buildViewFilter("all", uid)),
        Note.countDocuments(buildViewFilter("private", uid)),
        Note.countDocuments({ user: uid, visibility: "public", isDeleted: false, isArchived: false }),
        Note.countDocuments(buildViewFilter("favorites", uid)),
        Note.countDocuments(buildViewFilter("archived", uid)),
        Note.countDocuments(buildViewFilter("trash", uid)),
        Note.countDocuments(buildViewFilter("public", uid))
      ]);

    res.json({
      all,
      private: privateCount,
      publicMine,
      favorites,
      archived,
      trash,
      publicAll,
      total: all + archived
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// All tags used in a tab (for the tag filter chips)
exports.getTags = async (req, res) => {
  try {
    const { view = "all" } = req.query;
    const tags = await Note.distinct("tags", buildViewFilter(view, req.user.id));
    res.json(tags.sort());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* ---------- update ---------- */

// Update a note (only owner)
exports.updateNote = async (req, res) => {
  try {
    const { title, description, visibility, tags } = req.body;

    const note = await Note.findOne({
      _id: req.params.id,
      user: req.user.id,
      isDeleted: false
    });

    if (!note) {
      return res.status(404).json({
        message: "Note not found or access denied"
      });
    }

    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({ message: "Title cannot be empty" });
      }
      note.title = title;
    }

    if (description !== undefined) {
      if (!String(description).trim()) {
        return res.status(400).json({ message: "Description cannot be empty" });
      }
      note.description = description;
    }

    if (tags !== undefined) note.tags = normalizeTags(tags);

    if (visibility !== undefined) {
      if (!["public", "private"].includes(visibility)) {
        return res.status(400).json({ message: "Invalid visibility" });
      }
      note.visibility = visibility;
    }

    await note.save();

    res.json({
      message: "Note updated successfully",
      note
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Generic owner-only boolean toggle
const toggleField = (field, onMsg, offMsg) => async (req, res) => {
  try {
    const note = await Note.findOne({
      _id: req.params.id,
      user: req.user.id,
      isDeleted: false
    });

    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }

    note[field] = !note[field];

    // An archived note shouldn't stay pinned
    if (field === "isArchived" && note.isArchived) note.isPinned = false;

    await note.save();

    res.json({ message: note[field] ? onMsg : offMsg, note });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.toggleFavorite = toggleField("isFavorite", "Added to favorites", "Removed from favorites");
exports.togglePin = toggleField("isPinned", "Note pinned", "Note unpinned");
exports.toggleArchive = toggleField("isArchived", "Note archived", "Note unarchived");

/* ---------- delete / restore ---------- */

// Move note to trash
exports.deleteNote = async (req, res) => {
  try {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, isDeleted: false },
      { isDeleted: true, isPinned: false },
      { new: true }
    );

    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }

    res.json({ message: "Note moved to trash" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Restore from trash
exports.restoreNote = async (req, res) => {
  try {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, isDeleted: true },
      { isDeleted: false },
      { new: true }
    );

    if (!note) {
      return res.status(404).json({ message: "Note not found in trash" });
    }

    res.json({ message: "Note restored successfully", note });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Permanently delete from trash
exports.permanentDelete = async (req, res) => {
  try {
    const note = await Note.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
      isDeleted: true
    });

    if (!note) {
      return res.status(404).json({ message: "Note not found in trash" });
    }

    res.json({ message: "Note permanently deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
