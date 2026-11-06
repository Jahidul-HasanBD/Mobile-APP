// MedRemind — configuration and shared app layer
//
// Network is needed for exactly two things:
//   * signing in / creating an account   -> Supabase Auth  (js/supabase.js)
//   * searching the medicine catalog     -> Supabase table (js/supabase.js)
//
// Everything else is answered from the device by js/store.js, so no server and
// no XAMPP is involved. A signed-in session is kept in localStorage, which means
// the app opens straight into the dashboard even with no internet.

const SESSION_STORAGE_KEY = "medremind.session";
const USER_STORAGE_KEY = "medremind.user";

// Tokens issued by the old PHP backend are useless now; drop any leftovers.
try {
  localStorage.removeItem("medremind_token");
} catch (error) {
  /* storage disabled */
}

const Auth = {
  getSession() {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      return session && session.access_token ? session : null;
    } catch (error) {
      return null;
    }
  },

  setSession(session) {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session || {}));
    } catch (error) {
      console.error("Could not store the session:", error);
    }
  },

  getToken() {
    const session = this.getSession();
    return session ? session.access_token : null;
  },

  getUser() {
    let user = null;
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      user = raw ? JSON.parse(raw) : null;
    } catch (error) {
      user = null;
    }

    if (user && typeof user === "object") return user;

    const session = this.getSession();
    if (!session) return null;
    return { id: session.user_id || "", name: "", email: session.email || "" };
  },

  setUser(user) {
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user || {}));
    } catch (error) {
      console.error("Could not store the user:", error);
    }
  },

  isSignedIn() {
    const session = this.getSession();
    if (!session) return false;
    const user = this.getUser();
    return !!(user && user.id) || !!session.user_id;
  },

  clearToken() {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch (error) {
      /* storage disabled */
    }
  }
};

function requireAuth() {
  if (!Auth.isSignedIn()) {
    window.location.replace("index.html");
    return false;
  }
  return true;
}

function logout() {
  Auth.clearToken();
  window.location.replace("index.html");
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function formatTime(time) {
  if (!time) return "";
  const parts = String(time).split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || "0", 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = ((h + 11) % 12) + 1;
  return hour + ":" + String(m).padStart(2, "0") + " " + suffix;
}

function mealLabel(value) {
  return ({ before_meal: "Before meal", after_meal: "After meal", no_relation: "No specific relation" })[value] || "No specific relation";
}

function statusLabel(value) {
  return ({ taken: "Taken", skipped: "Skipped", snoozed: "Snoozed" })[value] || "Pending";
}

function statusClass(value) {
  return ({ taken: "status-taken", skipped: "status-skipped", snoozed: "status-snoozed" })[value] || "status-pending";
}

function setHeaderUser() {
  const user = Auth.getUser();
  document.querySelectorAll("[data-user-initials]").forEach((el) => {
    el.textContent = initials(user && user.name);
  });
}

/** True when the device currently has a network connection. */
function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function parseRoute(path) {
  const raw = String(path || "");
  const queryIndex = raw.indexOf("?");
  return {
    pathname: queryIndex === -1 ? raw : raw.slice(0, queryIndex),
    params: new URLSearchParams(queryIndex === -1 ? "" : raw.slice(queryIndex + 1))
  };
}

/**
 * Single entry point used by every page.
 *
 * The path strings are the historical API routes. The four routes that really
 * need the network go to Supabase; every other route is answered locally by
 * js/store.js. Failures always resolve to { error: "..." } so the existing page
 * code keeps working unchanged.
 */
async function api(path, options = {}) {
  const route = parseRoute(path);
  const method = String((options && options.method) || "GET").toUpperCase();

  let body = {};
  if (options && options.body) {
    try {
      body = JSON.parse(options.body);
    } catch (error) {
      body = {};
    }
  }

  try {
    switch (route.pathname) {
      case "/auth/login.php":
        return await SupabaseAuth.login(body);

      case "/auth/register.php":
        return await SupabaseAuth.register(body);

      case "/auth/change-password.php":
        return await SupabaseAuth.changePassword(body);

      case "/medicines/search.php":
        return await MedicineCatalog.search(route.params.get("q"));

      case "/auth/profile.php": {
        const result = LocalData.handle(route.pathname, method, route.params, body);
        // Keep the display name in Supabase metadata when we happen to be
        // online. Purely best effort: offline the device copy is enough.
        if (method === "PUT" && !result.error && result.user && Supabase.isConfigured()) {
          SupabaseAuth.syncProfile(result.user).catch(() => {});
        }
        return result;
      }

      default:
        return LocalData.handle(route.pathname, method, route.params, body);
    }
  } catch (error) {
    console.error("Request failed:", route.pathname, error);
    return { error: (error && error.message) || "Something went wrong. Please try again." };
  }
}
