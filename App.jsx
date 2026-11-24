import React, { useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:5000/api";

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "all", label: "All Notes", icon: "▤" },
  { id: "private", label: "Private Notes", icon: "🔒" },
  { id: "public", label: "Public Notes", icon: "🌐" },
  { id: "favorites", label: "Favorites", icon: "★" },
  { id: "archived", label: "Archived", icon: "▣" },
  { id: "trash", label: "Trash", icon: "♲" },
  { id: "profile", label: "My Profile", icon: "♙" }
];

const sortOptions = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "az", label: "Title A–Z" },
  { id: "za", label: "Title Z–A" }
];

const emptyStats = {
  all: 0, private: 0, publicMine: 0, favorites: 0,
  archived: 0, trash: 0, publicAll: 0, total: 0
};

const getInitialTheme = () => {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem("user") || "null")
  );
  const [theme, setTheme] = useState(getInitialTheme);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [notes, setNotes] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [availableTags, setAvailableTags] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // filters (all handled by the server)
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState("newest");

  // note form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [editingId, setEditingId] = useState(null);

  // auth form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState(null);

  const notify = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  /* ---------- theme ---------- */

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  /* ---------- api ---------- */

  const logout = (silent = false) => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    setNotes([]);
    setStats(emptyStats);
    setAvailableTags([]);
    setSearch("");
    setTagFilter("");
    setActiveTab("dashboard");
    if (!silent) notify("Logged out successfully!");
  };

  const request = async (url, options = {}) => {
    const response = await fetch(`${API}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      // token expired / invalid -> back to login
      logout(true);
      throw new Error("Session expired. Please login again.");
    }

    if (!response.ok) {
      throw new Error(data.message || "Something went wrong");
    }

    return data;
  };

  const refresh = () => setRefreshKey((k) => k + 1);

  /* ---------- auth ---------- */

  const handleAuth = async (e) => {
    e.preventDefault();

    if (!email || !password || (isRegister && !name)) {
      notify("Please fill all fields", "error");
      return;
    }

    if (isRegister && password.length < 6) {
      notify("Password must be at least 6 characters", "error");
      return;
    }

    setLoading(true);

    try {
      const endpoint = isRegister ? "register" : "login";
      const response = await fetch(`${API}/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister ? { name, email, password } : { email, password }
        )
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Invalid email or password");
      }

      if (isRegister) {
        notify("Account created! Please login.");
        setIsRegister(false);
        setPassword("");
      } else {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        setActiveTab("dashboard");
        notify("Login successful! Welcome to NoteSpace.");
      }
    } catch (error) {
      notify(error.message || "Server connection failed", "error");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- data loading ---------- */

  // debounce the search box so we don't hit the server on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const isNotesTab = activeTab !== "dashboard" && activeTab !== "profile";
  const listView = activeTab === "dashboard" ? "all" : activeTab;

  // notes list
  useEffect(() => {
    if (!token || activeTab === "profile") return;

    let cancelled = false;

    const params = new URLSearchParams({
      view: listView,
      sort: activeTab === "dashboard" ? "newest" : sort
    });
    if (isNotesTab && debouncedSearch) params.set("q", debouncedSearch);
    if (isNotesTab && tagFilter) params.set("tag", tagFilter);

    request(`/notes?${params.toString()}`)
      .then((data) => { if (!cancelled) setNotes(data); })
      .catch((error) => { if (!cancelled) notify(error.message, "error"); });

    return () => { cancelled = true; };
  }, [token, activeTab, debouncedSearch, tagFilter, sort, refreshKey]);

  // sidebar counts + tag chips
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    request("/notes/stats")
      .then((data) => { if (!cancelled) setStats(data); })
      .catch(() => {});

    if (isNotesTab) {
      request(`/notes/tags?view=${listView}`)
        .then((tags) => {
          if (cancelled) return;
          setAvailableTags(tags);
          // active tag no longer exists in this tab -> clear it
          if (tagFilter && !tags.includes(tagFilter)) setTagFilter("");
        })
        .catch(() => {});
    }

    return () => { cancelled = true; };
  }, [token, activeTab, refreshKey]);

  /* ---------- actions ---------- */

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setTagsInput("");
    setVisibility("private");
  };

  const changeTab = (tab) => {
    setActiveTab(tab);
    setSearch("");
    setDebouncedSearch("");
    setTagFilter("");
    resetForm();
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setTagFilter("");
  };

  const saveNote = async (e) => {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      notify("Please enter title and description", "error");
      return;
    }

    try {
      const url = editingId ? `/notes/${editingId}` : "/notes";
      const method = editingId ? "PUT" : "POST";

      await request(url, {
        method,
        body: JSON.stringify({ title, description, visibility, tags: tagsInput })
      });

      notify(editingId ? "Note updated successfully!" : "Note created successfully!");
      resetForm();
      refresh();
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const editNote = (note) => {
    setTitle(note.title);
    setDescription(note.description);
    setTagsInput((note.tags || []).join(", "));
    setVisibility(note.visibility || "private");
    setEditingId(note._id);
    setActiveTab("all");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const noteAction = async (id, action, method = "PATCH") => {
    try {
      const data = await request(`/notes/${id}/${action}`, { method });
      notify(data.message || "Action completed");
      refresh();
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const moveToTrash = async (id) => {
    if (!window.confirm("Move this note to Trash?")) return;
    try {
      const data = await request(`/notes/${id}`, { method: "DELETE" });
      notify(data.message);
      refresh();
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const permanentlyDelete = async (id) => {
    if (!window.confirm("Permanently delete this note? This cannot be undone.")) return;
    await noteAction(id, "permanent", "DELETE");
  };

  // clicking a #tag on a card filters by that tag
  const filterByTag = (tag) => {
    if (activeTab === "dashboard") setActiveTab("all");
    setSearch("");
    setDebouncedSearch("");
    setTagFilter(tag);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // login stores `user.id` (the API returns `id`, not `_id`)
  const isOwner = (note) => {
    const me = user?.id || user?._id;
    const ownerId = note.user?._id || note.user;
    return Boolean(ownerId && me && String(ownerId) === String(me));
  };

  const hasFilters = Boolean(debouncedSearch || tagFilter);

  const counts = {
    all: stats.all,
    private: stats.private,
    public: stats.publicAll,
    favorites: stats.favorites,
    archived: stats.archived,
    trash: stats.trash
  };

  const ThemeButton = (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle dark mode"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );

  /* ---------- auth screen ---------- */

  if (!token) {
    return (
      <div className="auth-page">
        {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
        <div className="auth-theme">{ThemeButton}</div>
        <div className="auth-card">
          <div className="logo-mark">✦</div>
          <h1>NoteSpace</h1>
          <p className="muted">Your thoughts. Your space. Your productivity.</p>

          <div className="auth-tabs">
            <button type="button" className={!isRegister ? "selected" : ""} onClick={() => setIsRegister(false)}>Login</button>
            <button type="button" className={isRegister ? "selected" : ""} onClick={() => setIsRegister(true)}>Register</button>
          </div>

          <form onSubmit={handleAuth}>
            {isRegister && (
              <label>Full Name
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </label>
            )}
            <label>Email Address
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <label>Password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isRegister ? "At least 6 characters" : "Enter password"} />
            </label>
            <button className="primary-btn full" disabled={loading}>
              {loading ? "Please wait..." : isRegister ? "Create Account →" : "Login →"}
            </button>
          </form>
          <p className="auth-foot">Organize your ideas in one secure place.</p>
        </div>
      </div>
    );
  }

  /* ---------- app ---------- */

  const cardProps = (note) => ({
    note,
    isOwner: isOwner(note),
    onEdit: editNote,
    onTrash: moveToTrash,
    onFavorite: () => noteAction(note._id, "favorite"),
    onPin: () => noteAction(note._id, "pin"),
    onArchive: () => noteAction(note._id, "archive"),
    onRestore: () => noteAction(note._id, "restore"),
    onPermanentDelete: () => permanentlyDelete(note._id),
    onTagClick: filterByTag,
    isTrash: activeTab === "trash"
  });

  return (
    <div className="layout">
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}

      <aside className="sidebar">
        <div className="brand"><span className="logo-mark">✦</span> NoteSpace</div>
        <p className="nav-caption">WORKSPACE</p>

        <nav>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => changeTab(tab.id)}
            >
              <span>{tab.icon}</span>{tab.label}
              {counts[tab.id] !== undefined && <small>{counts[tab.id]}</small>}
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{(user?.name || "U")[0].toUpperCase()}</div>
          <div className="user-info">
            <strong>{user?.name || "User"}</strong>
            <small>{user?.email}</small>
          </div>
          <button className="logout-icon" title="Logout" onClick={() => logout()}>↪</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">PERSONAL WORKSPACE</p>
            <h1>{tabs.find(t => t.id === activeTab)?.label}</h1>
          </div>
          <div className="top-user">
            <span>{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
            {ThemeButton}
            <div className="avatar">{(user?.name || "U")[0].toUpperCase()}</div>
          </div>
        </header>

        {activeTab === "dashboard" && (
          <>
            <section className="welcome">
              <div>
                <span className="eyebrow light">YOUR IDEAS, ORGANIZED</span>
                <h2>Welcome back, {user?.name || "there"}! 👋</h2>
                <p>Keep your thoughts organized and your ideas moving.</p>
                <button className="welcome-btn" onClick={() => changeTab("all")}>Explore my notes →</button>
              </div>
              <div className="welcome-art">✧</div>
            </section>

            <div className="stats-grid">
              <div className="stat"><span>▤</span><small>My Notes</small><strong>{stats.all}</strong></div>
              <div className="stat"><span>🔒</span><small>Private Notes</small><strong>{stats.private}</strong></div>
              <div className="stat"><span>🌐</span><small>Public Notes</small><strong>{stats.publicMine}</strong></div>
              <div className="stat"><span>★</span><small>Favorites</small><strong>{stats.favorites}</strong></div>
            </div>

            <div className="section-title">
              <div><h2>Recent Notes</h2><p>Your latest saved ideas</p></div>
              <button className="text-btn" onClick={() => changeTab("all")}>View all →</button>
            </div>

            {notes.length === 0 ? (
              <div className="empty">
                <div>▤</div><h3>No notes yet</h3>
                <p>Create your first note from the All Notes tab.</p>
              </div>
            ) : (
              <div className="notes-grid">
                {notes.slice(0, 4).map(note => (
                  <NoteCard key={note._id} {...cardProps(note)} />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "profile" && (
          <section className="profile-panel">
            <div className="profile-large">{(user?.name || "U")[0].toUpperCase()}</div>
            <h2>{user?.name || "User"}</h2>
            <p>{user?.email}</p>
            <div className="profile-details">
              <div><span>Account</span><strong>Active</strong></div>
              <div><span>Total Notes</span><strong>{stats.total}</strong></div>
              <div><span>Private Notes</span><strong>{stats.private}</strong></div>
              <div><span>Public Notes</span><strong>{stats.publicMine}</strong></div>
            </div>
            <button className="danger-btn" onClick={() => logout()}>Logout from account</button>
          </section>
        )}

        {isNotesTab && (
          <>
            {["all", "private"].includes(activeTab) && (
              <section className="create-panel">
                <div className="section-title">
                  <div><h2>{editingId ? "Edit Note" : "Create a Note"}</h2><p>Capture something worth remembering.</p></div>
                </div>
                <form onSubmit={saveNote} className="note-form">
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Note title..." />
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Write your thoughts here..." rows="4" />
                  <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="Tags (comma separated) e.g. work, ideas, study" />
                  <div className="form-bottom">
                    <label className="visibility-label">Visibility
                      <select value={visibility} onChange={e => setVisibility(e.target.value)}>
                        <option value="private">🔒 Private — Only me</option>
                        <option value="public">🌐 Public — Everyone can view</option>
                      </select>
                    </label>
                    <div className="form-buttons">
                      {editingId && <button type="button" className="secondary-btn" onClick={resetForm}>Cancel</button>}
                      <button className="primary-btn">{editingId ? "Save Changes" : "+ Add Note"}</button>
                    </div>
                  </div>
                </form>
              </section>
            )}

            <div className="section-title notes-heading">
              <div>
                <h2>{tabs.find(t => t.id === activeTab)?.label}</h2>
                <p>
                  {activeTab === "public" ? "Explore notes shared publicly by users." :
                   activeTab === "private" ? "Only you can see these notes." :
                   activeTab === "trash" ? "Restore notes or permanently delete them." :
                   "Manage your saved notes."}
                </p>
              </div>
              <div className="toolbar">
                <input className="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="⌕ Search title, text or #tag..." />
                <select className="sort-select" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort notes">
                  {sortOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {availableTags.length > 0 && (
              <div className="tag-filter">
                <button className={`tag-chip ${tagFilter === "" ? "active" : ""}`} onClick={() => setTagFilter("")}>All tags</button>
                {availableTags.map(tag => (
                  <button key={tag} className={`tag-chip ${tagFilter === tag ? "active" : ""}`} onClick={() => setTagFilter(tagFilter === tag ? "" : tag)}>
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {notes.length === 0 ? (
              <div className="empty">
                <div>▤</div>
                <h3>{hasFilters ? "No notes match your filters" : "No notes found"}</h3>
                <p>{hasFilters ? "Try a different search or tag." : "There are no notes in this section yet."}</p>
                {hasFilters && <button className="secondary-btn clear-btn" onClick={clearFilters}>Clear filters</button>}
              </div>
            ) : (
              <div className="notes-grid">
                {notes.map(note => (
                  <NoteCard key={note._id} {...cardProps(note)} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function NoteCard({ note, isOwner, onEdit, onTrash, onFavorite, onPin, onArchive, onRestore, onPermanentDelete, onTagClick, isTrash }) {
  const showPinned = isOwner && note.isPinned && !isTrash;

  return (
    <article className={`note-card ${showPinned ? "pinned" : ""}`}>
      <div className="note-card-head">
        <span className="note-type">{note.visibility === "public" ? "🌐 Public" : "🔒 Private"}</span>
        <span className="note-badges">
          {showPinned && <span className="note-pin" title="Pinned">📌</span>}
          {note.isFavorite && <span className="note-star">★</span>}
        </span>
      </div>

      <h3>{note.title}</h3>
      <p className="note-description">{note.description}</p>

      {note.tags?.length > 0 && (
        <div className="note-tags">
          {note.tags.map(tag => (
            <button key={tag} className="tag-chip small" onClick={() => onTagClick(tag)} title={`Show notes tagged #${tag}`}>
              #{tag}
            </button>
          ))}
        </div>
      )}

      {note.user?.name && <small className="note-author">By {note.user.name}</small>}

      <div className="note-meta">
        <span>{note.updatedAt ? new Date(note.updatedAt).toLocaleDateString("en-IN") : "Recently"}</span>
        <div className="note-actions">
          {isTrash ? (
            isOwner && <>
              <button title="Restore" onClick={onRestore}>↶</button>
              <button title="Permanently delete" onClick={onPermanentDelete}>×</button>
            </>
          ) : isOwner && (
            <>
              <button title={note.isPinned ? "Unpin" : "Pin to top"} onClick={onPin}>{note.isPinned ? "📌" : "📍"}</button>
              <button title="Favorite" onClick={onFavorite}>{note.isFavorite ? "★" : "☆"}</button>
              <button title={note.isArchived ? "Unarchive" : "Archive"} onClick={onArchive}>▣</button>
              <button title="Edit" onClick={() => onEdit(note)}>✎</button>
              <button title="Move to trash" onClick={() => onTrash(note._id)}>♲</button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export default App;
