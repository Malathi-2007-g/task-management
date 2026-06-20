// ============================================================
// firebase-config.js
// Initialize Firebase app + export shared service instances
// Replace the firebaseConfig object with YOUR project values
// from: Firebase Console → Project Settings → Your apps
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── ✏️ REPLACE WITH YOUR FIREBASE PROJECT CONFIG ──────────
const firebaseConfig = {
  apiKey: "AIzaSyDpFN8pBCnB2CoR1v_frT0yHQ3N_--IyA4",
  authDomain: "task-manager-7d2ce.firebaseapp.com",
  projectId: "task-manager-7d2ce",
  storageBucket: "task-manager-7d2ce.firebasestorage.app",
  messagingSenderId: "178746184035",
  appId: "1:178746184035:web:5798619bb26a339c158356",
  measurementId: "G-2BH66EM7EP"
};
// ────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);