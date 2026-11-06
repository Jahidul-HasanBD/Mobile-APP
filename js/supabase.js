// MedRemind — Supabase client (plain fetch, no bundler)
//
// Only two things in this app need the network:
//   1. authentication           -> Supabase Auth   (this file)
//   2. medicine name search     -> table public.medicine_catalog (this file)
//
// Everything else (medicines, stock, schedules, dose logs, profile) is stored
// on the device by js/store.js, so the app keeps working with no internet.

// Optional defaults. These may also be filled in from the app itself
// (index.html -> "Server settings"), which is stored in localStorage and
// wins over the values below.
const SUPABASE_URL = "https://jmaicawttnzzdtfetcyx.supabase.co";
// The anon key is a public client key; row level security decides what it can
// read. Fine to ship inside the APK (this is how Supabase mobile apps work).
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptYWljYXd0dG56emR0ZmV0Y3l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3Nzg5NjEsImV4cCI6MjEwOTM1NDk2MX0.Yarm8WPHuEOpPCMaKBrEpQHbLENFzYRZXR8pJVqKVJg";
// Either value can still be overridden from the app (index.html -> "Server
// settings"); whatever is stored on the device wins over the defaults above.

const SUPABASE_STORAGE = {
  url: "medremind.supabase.url",
  key: "medremind.supabase.key"
};

/**
 * Low level request helper.
 *
 * Always resolves with { status, data, offline, unconfigured } instead of
 * throwing, so callers can tell "the device has no internet" apart from
 * "Supabase said no".
 */
async function supabaseFetch(path, options = {}) {
  const config = Supabase.config();
  if (!config.url || !config.key) {
    return { status: 0, data: null, offline: false, unconfigured: true };
  }

  const headers = {
    apikey: config.key,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  let response;
  try {
    response = await fetch(config.url + path, { ...options, headers: headers });
  } catch (error) {
    console.warn("Supabase request failed:", path, error);
    return { status: 0, data: null, offline: true, unconfigured: false };
  }

  let data = null;
  try {
    const raw = await response.text();
    data = raw ? JSON.parse(raw) : null;
  } catch (error) {
    data = null;
  }

  return { status: response.status, data: data, offline: false, unconfigured: false };
}

/** Turns Supabase auth error payloads into messages that make sense to users. */
function supabaseErrorMessage(data, status) {
  const code = data && (data.error_code || data.code) ? String(data.error_code || data.code) : "";
  const raw = (data && (data.msg || data.message || data.error_description || data.error)) || "";

  const known = {
    invalid_grant: "Incorrect email or password.",
    invalid_credentials: "Incorrect email or password.",
    email_not_confirmed: "Please confirm your email address before signing in.",
    user_already_exists: "An account with this email already exists.",
    email_exists: "An account with this email already exists.",
    weak_password: "That password is too weak. Use at least 8 characters.",
    over_email_send_rate_limit: "Too many attempts. Please wait a minute and try again.",
    over_request_rate_limit: "Too many attempts. Please wait a minute and try again.",
    signup_disabled: "New accounts are disabled for this Supabase project.",
    email_provider_disabled: "Email sign-in is disabled for this Supabase project.",
    validation_failed: "Please check the email address and password you entered."
  };

  if (known[code]) return known[code];
  if (status === 0) return "Cannot reach Supabase. Check your internet connection.";
  if (status === 401 || status === 403) return "Not allowed. Please sign in again.";
  return raw || "Something went wrong. Please try again.";
}

/** Reads the profile fields out of a Supabase user object. */
function supabaseProfile(user) {
  const source = user || {};
  const meta = source.user_metadata || {};
  const email = source.email || meta.email || "";
  const fallbackName = email ? String(email).split("@")[0] : "User";

  return {
    id: source.id || "",
    name: meta.name || meta.full_name || fallbackName,
    email: email,
    phone: meta.phone || source.phone || "",
    age: meta.age === undefined || meta.age === null || meta.age === "" ? null : Number(meta.age),
    emergency_contact: meta.emergency_contact || ""
  };
}

const Supabase = {
  config() {
    let storedUrl = "";
    let storedKey = "";
    try {
      storedUrl = localStorage.getItem(SUPABASE_STORAGE.url) || "";
      storedKey = localStorage.getItem(SUPABASE_STORAGE.key) || "";
    } catch (error) {
      storedUrl = "";
      storedKey = "";
    }

    return {
      url: String(storedUrl || SUPABASE_URL || "").trim().replace(/\/+$/, ""),
      key: String(storedKey || SUPABASE_ANON_KEY || "").trim()
    };
  },

  isConfigured() {
    const config = this.config();
    return /^https?:\/\/\S+$/i.test(config.url) && config.key.length > 12;
  },

  saveConfig(url, key) {
    const cleanUrl = String(url || "").trim().replace(/\/+$/, "");
    const cleanKey = String(key || "").trim();

    if (!/^https?:\/\/\S+$/i.test(cleanUrl)) {
      return { error: "Project URL must look like https://your-project.supabase.co" };
    }
    if (cleanKey.length <= 12) {
      return { error: "That does not look like a Supabase anon key." };
    }

    try {
      localStorage.setItem(SUPABASE_STORAGE.url, cleanUrl);
      localStorage.setItem(SUPABASE_STORAGE.key, cleanKey);
    } catch (error) {
      return { error: "Could not save the settings on this device." };
    }
    return { message: "Supabase connection saved." };
  },

  clearConfig() {
    try {
      localStorage.removeItem(SUPABASE_STORAGE.url);
      localStorage.removeItem(SUPABASE_STORAGE.key);
    } catch (error) {
      /* ignore */
    }
  },

  /**
   * Checks that the URL/key work and that the medicine catalogue table exists.
   * Used by the setup panel so misconfiguration is visible immediately.
   */
  async test() {
    const result = await supabaseFetch("/rest/v1/medicine_catalog?select=id&limit=1");
    if (result.unconfigured) return { error: "Add your Supabase project URL and anon key first." };
    if (result.offline) return { error: "Cannot reach that URL. Check your internet connection." };
    if (result.status === 404 || result.status === 400) {
      return {
        error: "Connected to Supabase, but the medicine catalog table is missing. Run supabase/schema.sql in the Supabase SQL editor."
      };
    }
    if (result.status === 401 || result.status === 403) {
      return { error: "Supabase rejected the anon key. Copy the anon public key from Project Settings -> API." };
    }
    return { message: "Supabase connected." };
  }
};

const SupabaseAuth = {
  sessionFromPayload(payload) {
    const data = payload || {};
    const user = data.user || {};

    return {
      access_token: data.access_token || "",
      refresh_token: data.refresh_token || "",
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      user_id: user.id || "",
      email: user.email || ""
    };
  },

  async login(input) {
    const email = String((input && input.email) || "").trim();
    const password = String((input && input.password) || "");

    if (!Supabase.isConfigured()) {
      return { error: "Supabase is not connected yet. Tap \"Server settings\" below and add your project URL and anon key." };
    }
    if (!email || !password) {
      return { error: "Please enter your email and password." };
    }

    const result = await supabaseFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: email, password: password })
    });

    if (result.offline) {
      return { error: "Signing in needs an internet connection. Once you are signed in, the app works offline." };
    }
    if (result.status >= 400 || !result.data || !result.data.access_token) {
      return { error: supabaseErrorMessage(result.data, result.status) };
    }

    Auth.setSession(this.sessionFromPayload(result.data));
    const user = supabaseProfile(result.data.user);
    Auth.setUser(user);
    LocalData.ensureProfile(user);

    return { message: "Signed in", user: Auth.getUser() };
  },

  async register(input) {
    const data = input || {};
    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim();
    const password = String(data.password || "");
    const phone = String(data.phone || "").trim();
    const emergencyContact = String(data.emergency_contact || "").trim();

    if (!Supabase.isConfigured()) {
      return { error: "Supabase is not connected yet. Tap \"Server settings\" below and add your project URL and anon key." };
    }
    if (!name || !email || !password) {
      return { error: "Please fill in all fields." };
    }
    if (password.length < 8) {
      return { error: "Password must be at least 8 characters." };
    }

    const result = await supabaseFetch("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({
        email: email,
        password: password,
        data: { name: name, phone: phone, emergency_contact: emergencyContact }
      })
    });

    if (result.offline) {
      return { error: "Creating an account needs an internet connection." };
    }
    if (result.status >= 400) {
      return { error: supabaseErrorMessage(result.data, result.status) };
    }

    // With "Confirm email" enabled Supabase creates the user but returns no
    // session, so the app must wait for the user to click the email link.
    if (!result.data || !result.data.access_token) {
      return {
        pending: true,
        message: "Account created. Open the confirmation email we sent you, then come back and sign in."
      };
    }

    Auth.setSession(this.sessionFromPayload(result.data));
    const user = supabaseProfile(result.data.user);
    Auth.setUser(user);
    LocalData.ensureProfile(user);

    return { message: "Account created", user: Auth.getUser() };
  },

  /** Returns a fresh access token, or null when that is not possible. */
  async refresh() {
    const session = Auth.getSession();
    if (!session || !session.refresh_token) return null;

    const result = await supabaseFetch("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });

    // Offline: keep the stored session so the app still opens offline.
    if (result.offline || result.unconfigured) return null;

    if (result.status >= 400 || !result.data || !result.data.access_token) {
      Auth.clearToken();
      return null;
    }

    Auth.setSession(this.sessionFromPayload(result.data));
    return result.data.access_token;
  },

  async accessToken() {
    const session = Auth.getSession();
    if (!session || !session.access_token) return null;

    const expiresAt = Number(session.expires_at) || 0;
    if (!expiresAt || expiresAt - Date.now() > 60 * 1000) {
      return session.access_token;
    }

    const refreshed = await this.refresh();
    return refreshed || session.access_token;
  },

  async changePassword(input) {
    const session = Auth.getSession();
    const currentPassword = String((input && input.current_password) || "");
    const newPassword = String((input && input.new_password) || "");

    if (!session) return { error: "Please sign in again." };
    if (!Supabase.isConfigured()) return { error: "Supabase is not connected." };
    if (!newPassword || newPassword.length < 8) {
      return { error: "New password must be at least 8 characters." };
    }
    if (!session.email) {
      return { error: "Signing in again is required before changing the password." };
    }

    // Re-authenticate first: it proves the current password is correct and
    // gives a token that Supabase accepts for a password update.
    const verify = await supabaseFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: session.email, password: currentPassword })
    });

    if (verify.offline) return { error: "Changing your password needs an internet connection." };
    if (verify.status >= 400 || !verify.data || !verify.data.access_token) {
      return { error: "Current password is incorrect." };
    }

    const update = await supabaseFetch("/auth/v1/user", {
      method: "PUT",
      headers: { Authorization: "Bearer " + verify.data.access_token },
      body: JSON.stringify({ password: newPassword })
    });

    if (update.offline) return { error: "Changing your password needs an internet connection." };
    if (update.status >= 400) return { error: supabaseErrorMessage(update.data, update.status) };

    Auth.setSession(this.sessionFromPayload(verify.data));
    return { message: "Password updated successfully!" };
  },

  /**
   * Best-effort copy of the profile into Supabase user metadata so the name
   * survives a reinstall or a new device. Offline/failed writes are ignored
   * because the device copy is the source of truth.
   */
  async syncProfile(profile) {
    const token = await this.accessToken();
    if (!token) return false;

    const result = await supabaseFetch("/auth/v1/user", {
      method: "PUT",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify({
        data: {
          name: profile.name || "",
          phone: profile.phone || "",
          age: profile.age === undefined || profile.age === null ? null : profile.age,
          emergency_contact: profile.emergency_contact || ""
        }
      })
    });

    return !result.offline && result.status < 400;
  }
};

const MedicineCatalog = {
  /** Searches the Supabase medicine catalog. Needs the network by design. */
  async search(query) {
    const term = String(query || "").trim();
    if (term.length < 2) return { results: [] };
    if (!Supabase.isConfigured()) {
      return { error: "Medicine search is not connected to Supabase yet." };
    }

    // Keep the PostgREST filter syntax safe (comma and parentheses are
    // structural characters inside or=(...)).
    const safe = term.replace(/[^a-z0-9\s\-.]/gi, " ").replace(/\s+/g, " ").trim();
    if (!safe) return { results: [] };

    const filter = "(name.ilike.*" + safe + "*,generic_name.ilike.*" + safe + "*)";
    const path =
      "/rest/v1/medicine_catalog" +
      "?select=id,name,generic_name,strength,form,manufacturer,instructions" +
      "&or=" + encodeURIComponent(filter) +
      "&order=name.asc&limit=8";

    const token = await SupabaseAuth.accessToken();
    const result = await supabaseFetch(path, {
      headers: token ? { Authorization: "Bearer " + token } : {}
    });

    if (result.unconfigured) return { error: "Medicine search is not connected to Supabase yet." };
    if (result.offline) return { error: "Medicine search needs an internet connection. You can still type the name yourself." };
    if (result.status === 404 || result.status === 400) {
      return { error: "Medicine catalog is not set up in Supabase yet (run supabase/schema.sql)." };
    }
    if (result.status >= 400) {
      return { error: "Medicine search is unavailable right now. You can still type the name yourself." };
    }

    return { results: Array.isArray(result.data) ? result.data : [] };
  }
};
