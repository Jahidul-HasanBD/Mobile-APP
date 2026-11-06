// MedRemind — offline data store
//
// Every reminder-related thing (medicines, stock, schedules, dose logs,
// profile) is kept in localStorage, scoped per signed-in user, and handled
// here. Nothing in this file touches the network, so all of these screens work
// with the phone in flight mode and without XAMPP running anywhere.
//
// The operations keep the response shapes of the old PHP API so the pages and
// their rendering code did not have to change.

const LocalData = (function () {
  const PREFIX = "medremind.v2";

  const DEFAULT_PROFILE = {
    notification_reminders: 1,
    notification_low_stock: 1,
    notification_missed: 1,
    notification_daily_summary: 0,
    notification_emergency: 0,
    reminder_sound: "default_chime"
  };

  /* ---------------------------------------------------------------------
   * Storage primitives
   * ------------------------------------------------------------------ */

  function userId() {
    const user = Auth.getUser();
    return user && user.id ? String(user.id) : "guest";
  }

  function storageKey(name) {
    return PREFIX + "." + userId() + "." + name;
  }

  function read(name, fallback) {
    try {
      const raw = localStorage.getItem(storageKey(name));
      if (raw === null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (error) {
      console.warn("LocalData: could not read " + name, error);
      return fallback;
    }
  }

  function write(name, value) {
    try {
      localStorage.setItem(storageKey(name), JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("LocalData: could not save " + name, error);
      return false;
    }
  }

  function persist(name, value) {
    if (!write(name, value)) {
      throw new Error("Could not save on this device. Free up storage space and try again.");
    }
    return value;
  }

  function nextId(collection) {
    const items = read(collection, []);
    const meta = read("meta", {});
    meta.seq = meta.seq || {};

    let highest = Number(meta.seq[collection]) || 0;
    items.forEach(function (item) {
      const id = Number(item && item.id) || 0;
      if (id > highest) highest = id;
    });

    const id = highest + 1;
    meta.seq[collection] = id;
    write("meta", meta);
    return id;
  }

  /* ---------------------------------------------------------------------
   * Small helpers (mirror the old server side validation)
   * ------------------------------------------------------------------ */

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function dateKey(date) {
    const d = date instanceof Date ? date : new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function todayStr() {
    return dateKey(new Date());
  }

  function isValidDate(value) {
    const candidate = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return false;
    const parsed = new Date(candidate + "T00:00:00");
    return !Number.isNaN(parsed.getTime()) && dateKey(parsed) === candidate;
  }

  function text(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  }

  function clampInt(value, min, max, fallback) {
    if (value === null || value === undefined || value === "" || isNaN(Number(value))) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(Number(value))));
  }

  function enumValue(value, allowed, fallback) {
    const candidate = text(value);
    return allowed.indexOf(candidate) === -1 ? fallback : candidate;
  }

  function normalizeTime(value, fallback) {
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text(value));
    if (!match) return fallback || "08:00:00";

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const second = Number(match[3] || 0);
    if (hour > 23 || minute > 59 || second > 59) return fallback || "08:00:00";

    return pad2(hour) + ":" + pad2(minute) + ":" + pad2(second);
  }

  function normalizeCustomDays(value) {
    if (value === null || value === undefined || value === "") return null;
    const parts = Array.isArray(value) ? value : String(value).split(",");
    const days = [];
    parts.forEach(function (part) {
      const candidate = text(part);
      if (/^[0-6]$/.test(candidate) && days.indexOf(Number(candidate)) === -1) {
        days.push(Number(candidate));
      }
    });
    if (!days.length) return null;
    days.sort();
    return days.join(",");
  }

  function sortByTime(list) {
    return list.sort(function (a, b) {
      return String(a.time || "").localeCompare(String(b.time || ""));
    });
  }

  function buildScheduleRecord(input, medicineId) {
    const source = input || {};
    return {
      id: nextId("schedules"),
      medicine_id: Number(medicineId),
      time: normalizeTime(source.time, "08:00:00"),
      meal_relation: enumValue(source.meal_relation, ["before_meal", "after_meal", "no_relation"], "no_relation"),
      repeat_type: enumValue(source.repeat_type, ["daily", "weekly", "custom"], "daily"),
      custom_days: normalizeCustomDays(source.custom_days),
      status: enumValue(source.status, ["active", "inactive"], "active"),
      created_at: nowIso(),
      updated_at: nowIso()
    };
  }

  /* ---------------------------------------------------------------------
   * Medicines
   * ------------------------------------------------------------------ */

  const medicines = {
    all() {
      return read("medicines", []);
    },

    /** Same shape as the old GET /medicines/index.php (active schedules inlined). */
    list() {
      const schedules = read("schedules", []);
      return this.all()
        .slice()
        .sort(function (a, b) {
          return String(b.created_at || "").localeCompare(String(a.created_at || ""));
        })
        .map(function (medicine) {
          return Object.assign({}, medicine, {
            schedules: schedules.filter(function (schedule) {
              return schedule.medicine_id === medicine.id && schedule.status === "active";
            })
          });
        });
    },

    find(id) {
      const target = Number(id);
      return this.all().find(function (medicine) {
        return medicine.id === target;
      }) || null;
    },

    create(input) {
      const data = input || {};
      const name = text(data.name);
      const dosage = text(data.dosage);

      if (!name || !dosage) return { error: "Name and dosage are required" };
      if (name.length > 150) return { error: "Name must be between 1 and 150 characters" };
      if (dosage.length > 50) return { error: "Dosage must not exceed 50 characters" };

      const totalStock = clampInt(data.total_stock, 0, 100000, 0);
      const currentStock = clampInt(data.current_stock, 0, 100000, totalStock);
      const lowStockThreshold = clampInt(data.low_stock_threshold, 0, 100000, 10);

      const medicine = {
        id: nextId("medicines"),
        name: name,
        dosage: dosage,
        instructions: text(data.instructions),
        total_stock: totalStock,
        current_stock: currentStock,
        low_stock_threshold: lowStockThreshold,
        created_at: nowIso(),
        updated_at: nowIso()
      };

      persist("medicines", this.all().concat([medicine]));

      if (Array.isArray(data.schedules) && data.schedules.length) {
        const schedules = read("schedules", []);
        data.schedules.forEach(function (entry) {
          if (!entry || typeof entry !== "object") return;
          schedules.push(buildScheduleRecord(entry, medicine.id));
        });
        persist("schedules", schedules);
      }

      return { message: "Medicine added successfully", id: medicine.id };
    },

    update(id, input) {
      const medicine = this.find(id);
      if (!medicine) return { error: "Medicine not found" };

      const data = input || {};
      const list = this.all();
      const index = list.findIndex(function (item) {
        return item.id === medicine.id;
      });

      if (Object.prototype.hasOwnProperty.call(data, "name")) {
        const name = text(data.name);
        if (!name || name.length > 150) return { error: "Name must be between 1 and 150 characters" };
        list[index].name = name;
      }

      if (Object.prototype.hasOwnProperty.call(data, "dosage")) {
        const dosage = text(data.dosage);
        if (!dosage || dosage.length > 50) return { error: "Dosage must be between 1 and 50 characters" };
        list[index].dosage = dosage;
      }

      if (Object.prototype.hasOwnProperty.call(data, "instructions")) {
        list[index].instructions = text(data.instructions);
      }

      ["total_stock", "current_stock", "low_stock_threshold"].forEach(function (field) {
        if (!Object.prototype.hasOwnProperty.call(data, field)) return;
        list[index][field] = clampInt(data[field], 0, 100000, 0);
      });

      list[index].updated_at = nowIso();
      persist("medicines", list);

      // Replacing the schedule list, exactly like the old PUT behaviour.
      if (Array.isArray(data.schedules)) {
        const currentSchedules = read("schedules", []);
        const removedIds = currentSchedules
          .filter(function (schedule) {
            return schedule.medicine_id === medicine.id;
          })
          .map(function (schedule) {
            return schedule.id;
          });

        const kept = currentSchedules.filter(function (schedule) {
          return schedule.medicine_id !== medicine.id;
        });

        // Existing logs belong to the removed schedules, so drop them too.
        dropLogsForSchedules(removedIds);

        data.schedules.forEach(function (entry) {
          if (!entry || typeof entry !== "object") return;
          kept.push(buildScheduleRecord(entry, medicine.id));
        });

        persist("schedules", kept);
      }

      return { message: "Medicine updated successfully" };
    },

    remove(id) {
      const medicine = this.find(id);
      if (!medicine) return { error: "Medicine not found" };

      const removedScheduleIds = read("schedules", [])
        .filter(function (schedule) {
          return schedule.medicine_id === medicine.id;
        })
        .map(function (schedule) {
          return schedule.id;
        });

      persist("medicines", this.all().filter(function (item) {
        return item.id !== medicine.id;
      }));
      persist("schedules", read("schedules", []).filter(function (schedule) {
        return schedule.medicine_id !== medicine.id;
      }));
      dropLogsForSchedules(removedScheduleIds);

      return { message: "Medicine deleted successfully" };
    },

    updateStock(id, input) {
      const medicine = this.find(id);
      if (!medicine) return { error: "Medicine not found" };

      const data = input || {};
      const action = text(data.action);
      const amount = clampInt(data.amount, 0, 100000, 1);
      const currentStock = Number(medicine.current_stock) || 0;

      let newStock;
      if (action === "increment") newStock = Math.min(100000, currentStock + amount);
      else if (action === "decrement") newStock = Math.max(0, currentStock - amount);
      else if (action === "set") newStock = Math.max(0, amount);
      else return { error: "Invalid action" };

      const list = this.all().map(function (item) {
        if (item.id !== medicine.id) return item;
        return Object.assign({}, item, { current_stock: newStock, updated_at: nowIso() });
      });
      persist("medicines", list);

      return {
        message: "Stock updated successfully",
        current_stock: newStock,
        is_low_stock: newStock <= Number(medicine.low_stock_threshold)
      };
    }
  };

  /* ---------------------------------------------------------------------
   * Schedules
   * ------------------------------------------------------------------ */

  const schedules = {
    all() {
      return read("schedules", []);
    },

    find(id) {
      const target = Number(id);
      return this.all().find(function (schedule) {
        return schedule.id === target;
      }) || null;
    },

    /** Active schedules joined with their medicine, plus the log for `date`. */
    listForDate(date) {
      const day = isValidDate(date) ? String(date) : todayStr();
      const logs = read("logs", []);
      const meds = medicines.all();

      const list = [];
      this.all().forEach(function (schedule) {
        if (schedule.status !== "active") return;
        const medicine = meds.find(function (item) {
          return item.id === schedule.medicine_id;
        });
        if (!medicine) return;

        const log = logs.find(function (entry) {
          return entry.schedule_id === schedule.id && entry.log_date === day;
        });

        list.push(Object.assign({}, schedule, {
          medicine_name: medicine.name,
          dosage: medicine.dosage,
          logged: !!log,
          log_status: log ? log.status : null
        }));
      });

      return sortByTime(list);
    },

    create(input) {
      const data = input || {};
      if (!data.medicine_id || !data.time) {
        return { error: "Medicine ID and time are required" };
      }

      const medicine = medicines.find(data.medicine_id);
      if (!medicine) return { error: "Medicine not found" };

      const record = buildScheduleRecord(data, medicine.id);
      persist("schedules", this.all().concat([record]));

      return { message: "Schedule added successfully", id: record.id };
    },

    update(id, input) {
      const schedule = this.find(id);
      if (!schedule) return { error: "Schedule not found" };

      const data = input || {};
      const next = Object.assign({}, schedule);
      let changed = false;

      if (data.time !== undefined) {
        next.time = normalizeTime(data.time, schedule.time);
        changed = true;
      }
      if (data.meal_relation !== undefined) {
        next.meal_relation = enumValue(data.meal_relation, ["before_meal", "after_meal", "no_relation"], "no_relation");
        changed = true;
      }
      if (data.repeat_type !== undefined) {
        next.repeat_type = enumValue(data.repeat_type, ["daily", "weekly", "custom"], "daily");
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(data, "custom_days")) {
        next.custom_days = normalizeCustomDays(data.custom_days);
        changed = true;
      }
      if (data.status !== undefined) {
        next.status = enumValue(data.status, ["active", "inactive"], "active");
        changed = true;
      }

      if (!changed) return { error: "No fields to update" };

      next.updated_at = nowIso();
      persist("schedules", this.all().map(function (item) {
        return item.id === schedule.id ? next : item;
      }));

      return { message: "Schedule updated successfully" };
    },

    remove(id) {
      const schedule = this.find(id);
      if (!schedule) return { error: "Schedule not found" };

      persist("schedules", this.all().filter(function (item) {
        return item.id !== schedule.id;
      }));
      dropLogsForSchedules([schedule.id]);

      return { message: "Schedule deleted successfully" };
    }
  };

  /* ---------------------------------------------------------------------
   * Dose logs
   * ------------------------------------------------------------------ */

  function dropLogsForSchedules(scheduleIds) {
    if (!scheduleIds || !scheduleIds.length) return;
    const ids = scheduleIds.map(Number);
    persist("logs", read("logs", []).filter(function (log) {
      return ids.indexOf(log.schedule_id) === -1;
    }));
  }

  function joinedLogs() {
    const meds = medicines.all();
    const scheds = schedules.all();

    return read("logs", []).map(function (log) {
      const schedule = scheds.find(function (item) {
        return item.id === log.schedule_id;
      });
      if (!schedule) return null;
      const medicine = meds.find(function (item) {
        return item.id === schedule.medicine_id;
      });
      if (!medicine) return null;

      return Object.assign({}, log, {
        scheduled_time: schedule.time,
        meal_relation: schedule.meal_relation,
        medicine_name: medicine.name,
        dosage: medicine.dosage
      });
    }).filter(Boolean);
  }

  function complianceStats(logs) {
    const stats = { taken: 0, skipped: 0, snoozed: 0 };
    logs.forEach(function (log) {
      if (stats[log.status] !== undefined) stats[log.status] += 1;
    });
    const total = stats.taken + stats.skipped + stats.snoozed;

    return Object.assign(stats, {
      total: total,
      compliance_rate: total > 0 ? Math.round((stats.taken / total) * 100) : 0
    });
  }

  const logs = {
    /** Today's active schedules with their log status (dashboard). */
    today() {
      const day = todayStr();
      const entries = schedules.listForDate(day);
      const stats = { total: entries.length, taken: 0, pending: 0, skipped: 0, snoozed: 0 };

      const medications = entries.map(function (entry) {
        if (stats[entry.log_status] !== undefined && entry.log_status) {
          stats[entry.log_status] += 1;
        } else {
          stats.pending += 1;
        }

        return {
          schedule_id: entry.id,
          time: entry.time,
          meal_relation: entry.meal_relation,
          medicine_id: entry.medicine_id,
          medicine_name: entry.medicine_name,
          dosage: entry.dosage,
          log_status: entry.log_status,
          action_time: null,
          logged: entry.logged
        };
      });

      return { date: day, medications: medications, stats: stats };
    },

    /** Logs between two dates with compliance stats (dashboard + calendar). */
    range(startDate, endDate) {
      const start = isValidDate(startDate) ? String(startDate) : todayStr();
      const end = isValidDate(endDate) ? String(endDate) : todayStr();
      if (start > end) return { error: "start_date must not be after end_date" };

      const inRange = joinedLogs().filter(function (log) {
        return log.log_date >= start && log.log_date <= end;
      });

      inRange.sort(function (a, b) {
        if (a.log_date !== b.log_date) return String(b.log_date).localeCompare(String(a.log_date));
        return String(a.scheduled_time || "").localeCompare(String(b.scheduled_time || ""));
      });

      return {
        logs: inRange,
        stats: complianceStats(inRange),
        period: { start_date: start, end_date: end }
      };
    },

    /** Records a dose, adjusting stock exactly like the old endpoint did. */
    record(input) {
      const data = input || {};
      if (!data.schedule_id || !data.status) {
        return { error: "Schedule ID and status are required" };
      }

      const status = text(data.status);
      if (["taken", "skipped", "snoozed"].indexOf(status) === -1) {
        return { error: "Invalid status. Must be: taken, skipped, or snoozed" };
      }

      const logDate = data.log_date === undefined || data.log_date === "" ? todayStr() : text(data.log_date);
      if (!isValidDate(logDate)) {
        return { error: "Invalid log_date. Expected YYYY-MM-DD." };
      }

      const schedule = schedules.find(data.schedule_id);
      if (!schedule) return { error: "Schedule not found" };

      const allLogs = read("logs", []);
      const existing = allLogs.find(function (log) {
        return log.schedule_id === schedule.id && log.log_date === logDate;
      });
      const previousStatus = existing ? existing.status : null;

      const entry = existing || {
        id: nextId("logs"),
        schedule_id: schedule.id,
        log_date: logDate,
        action_time: null,
        status: status
      };

      entry.action_time = nowIso();
      entry.status = status;

      const nextLogs = existing
        ? allLogs.map(function (log) {
            return log.id === entry.id ? entry : log;
          })
        : allLogs.concat([entry]);
      persist("logs", nextLogs);

      // Taking a dose uses one unit; correcting that entry puts it back.
      if (status === "taken" && previousStatus !== "taken") {
        medicines.updateStock(schedule.medicine_id, { action: "decrement", amount: 1 });
      } else if (status !== "taken" && previousStatus === "taken") {
        medicines.updateStock(schedule.medicine_id, { action: "increment", amount: 1 });
      }

      return { message: "Log recorded successfully", status: status };
    }
  };

  /* ---------------------------------------------------------------------
   * Profile (device copy of the user's settings)
   * ------------------------------------------------------------------ */

  const profile = {
    get() {
      const stored = read("profile", null);
      const user = Auth.getUser() || {};
      return Object.assign(
        {
          id: user.id || "",
          name: user.name || "",
          email: user.email || "",
          phone: user.phone || "",
          age: user.age === undefined ? null : user.age,
          emergency_contact: user.emergency_contact || ""
        },
        DEFAULT_PROFILE,
        stored || {}
      );
    },

    ensure(user) {
      const stored = read("profile", null);
      const identity = {
        id: (user && user.id) || "",
        name: (user && user.name) || "",
        email: (user && user.email) || ""
      };

      if (!stored) {
        // First sign-in on this device: seed from the Supabase user, never
        // overwriting anything the user already saved locally.
        persist("profile", Object.assign({}, DEFAULT_PROFILE, identity, {
          phone: (user && user.phone) || "",
          age: (user && user.age) || null,
          emergency_contact: (user && user.emergency_contact) || ""
        }));
        return;
      }

      const merged = Object.assign({}, stored, {
        id: identity.id || stored.id,
        email: identity.email || stored.email
      });
      if (!merged.name) merged.name = identity.name;
      persist("profile", merged);
    },

    update(input) {
      const data = input || {};
      const current = this.get();
      const next = Object.assign({}, current);

      if (Object.prototype.hasOwnProperty.call(data, "name")) {
        const name = text(data.name);
        if (!name) return { error: "Name cannot be empty" };
        if (name.length > 100) return { error: "Name must not exceed 100 characters" };
        next.name = name;
      }

      if (Object.prototype.hasOwnProperty.call(data, "phone")) next.phone = text(data.phone).slice(0, 20);
      if (Object.prototype.hasOwnProperty.call(data, "emergency_contact")) {
        next.emergency_contact = text(data.emergency_contact).slice(0, 20);
      }

      if (Object.prototype.hasOwnProperty.call(data, "age")) {
        next.age = data.age === null || data.age === "" ? null : clampInt(data.age, 0, 130, 0);
      }

      if (data.reminder_sound !== undefined) {
        next.reminder_sound = text(data.reminder_sound) || "default_chime";
      }

      Object.keys(DEFAULT_PROFILE).forEach(function (field) {
        if (field === "reminder_sound") return;
        if (!Object.prototype.hasOwnProperty.call(data, field)) return;
        next[field] = Number(data[field]) ? 1 : 0;
      });

      persist("profile", next);

      const user = Auth.getUser() || {};
      Auth.setUser(Object.assign({}, user, {
        name: next.name,
        phone: next.phone,
        age: next.age,
        emergency_contact: next.emergency_contact
      }));

      return { message: "Profile saved successfully!", user: next };
    }
  };

  /* ---------------------------------------------------------------------
   * Router: the path names are the historical API routes; every one of them
   * is answered locally now.
   * ------------------------------------------------------------------ */

  function handle(pathname, method, params, body) {
    const verb = String(method || "GET").toUpperCase();
    const id = params ? params.get("id") : null;
    const data = body || {};

    switch (pathname) {
      case "/medicines/index.php":
        if (verb === "GET") return { medicines: medicines.list() };
        if (verb === "POST") return medicines.create(data);
        return { error: "Method not allowed" };

      case "/medicines/single.php": {
        if (!Number(id) || Number(id) <= 0) return { error: "Invalid medicine ID" };
        if (verb === "GET") {
          const medicine = medicines.find(id);
          if (!medicine) return { error: "Medicine not found" };
          return {
            medicine: Object.assign({}, medicine, {
              schedules: schedules.all().filter(function (schedule) {
                return schedule.medicine_id === medicine.id;
              })
            })
          };
        }
        if (verb === "PUT") return medicines.update(id, data);
        if (verb === "DELETE") return medicines.remove(id);
        return { error: "Method not allowed" };
      }

      case "/medicines/stock.php": {
        if (!Number(id) || Number(id) <= 0) return { error: "Invalid medicine ID" };
        if (verb === "PUT") return medicines.updateStock(id, data);
        return { error: "Method not allowed" };
      }

      case "/schedules/index.php":
        if (verb === "GET") {
          const date = params && params.get("date") ? params.get("date") : todayStr();
          if (!isValidDate(date)) return { error: "Invalid date. Expected YYYY-MM-DD." };
          return { schedules: schedules.listForDate(date), date: date };
        }
        if (verb === "POST") return schedules.create(data);
        return { error: "Method not allowed" };

      case "/schedules/single.php": {
        if (!Number(id) || Number(id) <= 0) return { error: "Invalid schedule ID" };
        if (verb === "GET") {
          const schedule = schedules.find(id);
          if (!schedule) return { error: "Schedule not found" };
          return { schedule: schedule };
        }
        if (verb === "PUT") return schedules.update(id, data);
        if (verb === "DELETE") return schedules.remove(id);
        return { error: "Method not allowed" };
      }

      case "/logs/today.php":
        if (verb === "GET") return logs.today();
        return { error: "Method not allowed" };

      case "/logs/index.php":
        if (verb === "GET") {
          const start = params && params.get("start_date") ? params.get("start_date") : null;
          const end = params && params.get("end_date") ? params.get("end_date") : null;
          if ((start && !isValidDate(start)) || (end && !isValidDate(end))) {
            return { error: "Invalid date range. Expected YYYY-MM-DD." };
          }
          return logs.range(start, end);
        }
        if (verb === "POST") return logs.record(data);
        return { error: "Method not allowed" };

      case "/auth/profile.php":
        if (verb === "GET") return { user: profile.get() };
        if (verb === "PUT") return profile.update(data);
        return { error: "Method not allowed" };

      default:
        return { error: "Unknown offline endpoint: " + pathname };
    }
  }

  return {
    handle: handle,
    ensureProfile: function (user) {
      profile.ensure(user);
    },
    medicines: medicines,
    schedules: schedules,
    logs: logs,
    profile: profile,
    /** Used by the test page / debugging only. */
    storageKey: storageKey
  };
})();
