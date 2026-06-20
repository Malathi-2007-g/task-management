// ============================================================
// auth.js – Authentication helpers
// Used by: login.html, register.html, dashboard.html
// ============================================================

import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── Route guard: redirect unauthenticated users to login ────
export function requireAuth(callback) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "login.html";
    } else {
      callback(user);
    }
  });
}

// ── Route guard: redirect already-logged-in users to dash ──
export function redirectIfLoggedIn() {
  onAuthStateChanged(auth, (user) => {
    if (user) window.location.href = "dashboard.html";
  });
}

// ── Register new user ────────────────────────────────────────
export async function registerUser(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  return cred.user;
}

// ── Sign in existing user ────────────────────────────────────
export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// ── Sign out ─────────────────────────────────────────────────
export async function logoutUser() {
  await signOut(auth);
  window.location.href = "login.html";
}

// ============================================================
// tasks.js – All Firestore CRUD + UI rendering for tasks
// Imported by: dashboard.html
// ============================================================

import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Module-level state ────────────────────────────────────────
let currentUser = null;
let allTasks = []; // master copy from Firestore
let editingTaskId = null; // null = create mode, string = edit mode
let unsubscribe = null; // Firestore real-time listener cleanup

// ── Bootstrap after auth confirmed ────────────────────────────
requireAuth((user) => {
  currentUser = user;
  initUI(user);
  subscribeToTasks();
});

// ── Initialise static UI elements ─────────────────────────────
function initUI(user) {
  // User info in sidebar + dropdown
  document
    .querySelectorAll(".user-display-name")
    .forEach((el) => (el.textContent = user.displayName || "User"));
  document
    .querySelectorAll(".user-email")
    .forEach((el) => (el.textContent = user.email));

  // Avatar initials
  const initials = (user.displayName || user.email || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  document
    .querySelectorAll(".user-avatar-initials")
    .forEach((el) => (el.textContent = initials));

  // Logout buttons
  document
    .querySelectorAll(".btn-logout")
    .forEach((btn) => btn.addEventListener("click", confirmLogout));

  // Dark mode toggle
  const dmToggle = document.getElementById("darkModeToggle");
  if (localStorage.getItem("darkMode") === "true") enableDark();
  dmToggle?.addEventListener("change", () => {
    dmToggle.checked ? enableDark() : disableDark();
  });

  // Task form submit
  document
    .getElementById("taskForm")
    ?.addEventListener("submit", handleTaskFormSubmit);

  // Search + filter + sort listeners
  document
    .getElementById("searchInput")
    ?.addEventListener("input", renderTasks);
  document
    .getElementById("filterStatus")
    ?.addEventListener("change", renderTasks);
  document
    .getElementById("filterPriority")
    ?.addEventListener("change", renderTasks);
  document.getElementById("sortBy")?.addEventListener("change", renderTasks);

  // Modal reset when closed
  document
    .getElementById("taskModal")
    ?.addEventListener("hidden.bs.modal", resetTaskForm);
}

// ── Real-time Firestore listener ───────────────────────────────
function subscribeToTasks() {
  if (unsubscribe) unsubscribe(); // cleanup previous

  const q = query(
    collection(db, "tasks"),
    where("uid", "==", currentUser.uid),
    orderBy("createdAt", "desc")
  );

  unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      allTasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderTasks();
      updateStats();
    },
    (err) => {
      console.error("Firestore listener error:", err);
      showToast("Failed to sync tasks. Check your connection.", "danger");
    }
  );
}

// ── CRUD Operations ────────────────────────────────────────────

async function createTask(data) {
  await addDoc(collection(db, "tasks"), {
    ...data,
    uid: currentUser.uid,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

async function updateTask(id, data) {
  await updateDoc(doc(db, "tasks", id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

async function deleteTask(id) {
  await deleteDoc(doc(db, "tasks", id));
}

async function toggleComplete(id, currentStatus) {
  const newStatus = currentStatus === "completed" ? "pending" : "completed";
  await updateTask(id, { status: newStatus });
}

// ── Form handling ──────────────────────────────────────────────

async function handleTaskFormSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById("saveTaskBtn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Saving…`;

  const data = {
    title: document.getElementById("taskTitle").value.trim(),
    description: document.getElementById("taskDescription").value.trim(),
    priority: document.getElementById("taskPriority").value,
    dueDate: document.getElementById("taskDueDate").value,
    status: document.getElementById("taskStatus")?.value || "pending",
  };

  try {
    if (editingTaskId) {
      await updateTask(editingTaskId, data);
      showToast("Task updated successfully! ✅", "success");
    } else {
      await createTask(data);
      showToast("Task created successfully! 🎉", "success");
    }
    bootstrap.Modal.getInstance(document.getElementById("taskModal")).hide();
  } catch (err) {
    console.error(err);
    showToast("Something went wrong. Please try again.", "danger");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-check-lg me-1"></i>Save Task`;
  }
}

function resetTaskForm() {
  editingTaskId = null;
  document.getElementById("taskForm")?.reset();
  document.getElementById("taskModalLabel").textContent = "New Task";
  document.getElementById(
    "saveTaskBtn"
  ).innerHTML = `<i class="bi bi-check-lg me-1"></i>Save Task`;
}

// ── Populate form for editing ──────────────────────────────────
function openEditModal(task) {
  editingTaskId = task.id;
  document.getElementById("taskModalLabel").textContent = "Edit Task";
  document.getElementById("taskTitle").value = task.title || "";
  document.getElementById("taskDescription").value = task.description || "";
  document.getElementById("taskPriority").value = task.priority || "low";
  document.getElementById("taskDueDate").value = task.dueDate || "";
  document.getElementById("taskStatus").value = task.status || "pending";
  new bootstrap.Modal(document.getElementById("taskModal")).show();
}

// ── Delete with confirmation ───────────────────────────────────
function confirmDelete(id) {
  document.getElementById("confirmDeleteBtn").onclick = async () => {
    try {
      await deleteTask(id);
      showToast("Task deleted.", "warning");
      bootstrap.Modal.getInstance(
        document.getElementById("deleteModal")
      ).hide();
    } catch (err) {
      showToast("Delete failed. Try again.", "danger");
    }
  };
  new bootstrap.Modal(document.getElementById("deleteModal")).show();
}

// ── Render task cards ──────────────────────────────────────────
function renderTasks() {
  const search =
    document.getElementById("searchInput")?.value.toLowerCase() || "";
  const status = document.getElementById("filterStatus")?.value || "";
  const priority = document.getElementById("filterPriority")?.value || "";
  const sort = document.getElementById("sortBy")?.value || "newest";

  let tasks = [...allTasks];

  // Filter
  if (search)
    tasks = tasks.filter(
      (t) =>
        t.title?.toLowerCase().includes(search) ||
        t.description?.toLowerCase().includes(search)
    );
  if (status) tasks = tasks.filter((t) => t.status === status);
  if (priority) tasks = tasks.filter((t) => t.priority === priority);

  // Sort
  if (sort === "due-asc")
    tasks.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  if (sort === "due-desc")
    tasks.sort((a, b) => (b.dueDate || "").localeCompare(a.dueDate || ""));
  if (sort === "oldest")
    tasks.sort((a, b) => {
      const at = a.createdAt?.toMillis?.() || 0;
      const bt = b.createdAt?.toMillis?.() || 0;
      return at - bt;
    });

  const container = document.getElementById("tasksContainer");
  if (!container) return;

  if (tasks.length === 0) {
    container.innerHTML = emptyState();
    window.dispatchEvent(new Event("tasksReady"));
    return;
  }

  container.innerHTML = tasks.map(taskCard).join("");
  window.dispatchEvent(new Event("tasksReady"));

  // Bind card action buttons
  container.querySelectorAll(".btn-edit").forEach((btn) =>
    btn.addEventListener("click", () => {
      const task = allTasks.find((t) => t.id === btn.dataset.id);
      if (task) openEditModal(task);
    })
  );
  container
    .querySelectorAll(".btn-delete")
    .forEach((btn) =>
      btn.addEventListener("click", () => confirmDelete(btn.dataset.id))
    );
  container
    .querySelectorAll(".btn-complete")
    .forEach((btn) =>
      btn.addEventListener("click", () =>
        toggleComplete(btn.dataset.id, btn.dataset.status)
      )
    );
}

// ── Card HTML ─────────────────────────────────────────────────
function taskCard(task) {
  const priorityMap = {
    high: { cls: "badge-priority-high", icon: "🔴", label: "High" },
    medium: { cls: "badge-priority-medium", icon: "🟡", label: "Medium" },
    low: { cls: "badge-priority-low", icon: "🟢", label: "Low" },
  };
  const statusMap = {
    pending: { cls: "badge-status-pending", label: "Pending" },
    "in-progress": { cls: "badge-status-inprogress", label: "In Progress" },
    completed: { cls: "badge-status-completed", label: "Completed" },
  };

  const p = priorityMap[task.priority] || priorityMap.low;
  const s = statusMap[task.status] || statusMap.pending;
  const due = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "No due date";
  const isOverdue =
    task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    task.status !== "completed";
  const isDone = task.status === "completed";

  return ` <div class="col-12 col-md-6 col-xl-4"> <div class="task-card ${isDone ? "task-done" : ""} animate-in"> <div class="task-card-header"> <div class="d-flex gap-2 flex-wrap"> <span class="priority-badge ${p.cls}">${p.icon} ${p.label}</span> <span class="status-badge ${s.cls}">${s.label}</span> </div> <div class="task-actions"> <button class="btn-icon btn-complete" data-id="${ task.id }" data-status="${task.status}" title="${isDone ? "Mark pending" : "Mark complete"}"> <i class="bi ${ isDone ? "bi-arrow-counterclockwise" : "bi-check-circle" }"></i> </button> <button class="btn-icon btn-edit" data-id="${task.id}" title="Edit"> <i class="bi bi-pencil"></i> </button> <button class="btn-icon btn-delete" data-id="${ task.id }" title="Delete"> <i class="bi bi-trash3"></i> </button> </div> </div> <div class="task-card-body"> <h6 class="task-title ${ isDone ? "text-decoration-line-through" : "" }">${escHtml(task.title)}</h6> ${ task.description ? `<p class="task-desc">${escHtml(task.description)}</p>` : "" } </div> <div class="task-card-footer"> <span class="due-date ${isOverdue ? "overdue" : ""}"> <i class="bi bi-calendar3 me-1"></i>${due}${isOverdue ? " ⚠️" : ""} </span> </div> </div> </div>`;
}

// ── Stats ──────────────────────────────────────────────────────
function updateStats() {
  const total = allTasks.length;
  const pending = allTasks.filter((t) => t.status === "pending").length;
  const inProgress = allTasks.filter((t) => t.status === "in-progress").length;
  const completed = allTasks.filter((t) => t.status === "completed").length;

  setText("statTotal", total);
  setText("statPending", pending);
  setText("statInProgress", inProgress);
  setText("statCompleted", completed);

  // Progress bar
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const bar = document.getElementById("progressBar");
  if (bar) {
    bar.style.width = pct + "%";
    bar.textContent = pct + "%";
  }
}

// ── Empty state ───────────────────────────────────────────────
function emptyState() {
  return ` <div class="col-12 text-center py-5 empty-state"> <div class="empty-icon mb-3">📋</div> <h5 class="fw-semibold text-muted">No tasks found</h5> <p class="text-muted small">Add your first task or adjust your filters.</p> <button class="btn btn-primary mt-2" data-bs-toggle="modal" data-bs-target="#taskModal"> <i class="bi bi-plus-lg me-1"></i>Add Task </button> </div>`;
}

// ── Dark mode ─────────────────────────────────────────────────
function enableDark() {
  document.body.classList.add("dark");
  localStorage.setItem("darkMode", "true");
}
function disableDark() {
  document.body.classList.remove("dark");
  localStorage.setItem("darkMode", "false");
}

// ── Logout confirm ────────────────────────────────────────────
function confirmLogout() {
  new bootstrap.Modal(document.getElementById("logoutModal")).show();
  document.getElementById("confirmLogoutBtn").onclick = logoutUser;
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = "success") {
  const el = document.getElementById("liveToast");
  const body = document.getElementById("toastBody");
  if (!el || !body) return;
  body.textContent = msg;
  el.className = `toast align-items-center text-white bg-${type} border-0`;
  bootstrap.Toast.getOrCreateInstance(el).show();
}

// ── Helpers ───────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function escHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Expose to inline onclick (new task btn) ────────────────────
window.__openNewTaskModal = () => {
  resetTaskForm();
  new bootstrap.Modal(document.getElementById("taskModal")).show();
};