// MedRemind Notification Engine
// Platform auto-detect: Capacitor native vs browser
//
// NOTE: this project intentionally ships without a bundler. A bare ESM
// specifier such as import("@capacitor/local-notifications") cannot be
// resolved by the WebView, so native plugins are reached through the bridge
// Capacitor injects into the page (window.Capacitor.Plugins.<PluginName>).
const ReminderEngine = {
  isNative: () => typeof Capacitor !== "undefined" && Capacitor.isNativePlatform && Capacitor.isNativePlatform(),

  plugin() {
    if (typeof Capacitor === "undefined") return null;
    const plugins = Capacitor.Plugins || {};
    return plugins.LocalNotifications || null;
  },

  parseTime(value) {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
    return { hour, minute };
  },

  async requestPermission() {
    if (this.isNative()) {
      const localNotifications = this.plugin();
      if (!localNotifications) {
        console.error("LocalNotifications plugin is not available. Run `npx cap sync android`.");
        return false;
      }
      try {
        let status = await localNotifications.checkPermissions();
        if (status.display !== "granted") {
          status = await localNotifications.requestPermissions();
        }
        return status.display === "granted";
      } catch (error) {
        console.error("Unable to request notification permission:", error);
        return false;
      }
    }

    if (!("Notification" in window)) return false;
    try {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    } catch (error) {
      return false;
    }
  },

  async cancelAll() {
    if (!this.isNative()) {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
      return;
    }

    const localNotifications = this.plugin();
    if (!localNotifications) return;
    try {
      if (typeof localNotifications.cancelAll === "function") {
        await localNotifications.cancelAll();
      } else {
        const pending = await localNotifications.getPending();
        if (pending && pending.notifications && pending.notifications.length) {
          await localNotifications.cancel({ notifications: pending.notifications });
        }
      }
    } catch (error) {
      console.error("Unable to clear scheduled reminders:", error);
    }
  },

  async scheduleAll(schedules) {
    const list = (Array.isArray(schedules) ? schedules : []).filter(Boolean);

    if (this.isNative()) {
      const localNotifications = this.plugin();
      if (!localNotifications) {
        console.error("LocalNotifications plugin is not available. Run `npx cap sync android`.");
        return false;
      }

      const notifications = [];
      const usedIds = new Set();

      list.forEach((schedule) => {
        const time = this.parseTime(schedule.time);
        if (!time) return;

        const id = Number(schedule.id);
        // Android notification ids are 32-bit signed integers.
        if (!Number.isInteger(id) || id <= 0 || id > 2147483647) return;
        if (usedIds.has(id)) return;
        usedIds.add(id);

        notifications.push({
          id: id,
          title: "Time for your medicine",
          body: String(schedule.medicine_name || "Medication") + " (" + String(schedule.dosage || "dose") + ")",
          autoCancel: true,
          // `on` + repeats delivers the reminder every day at the same time
          // instead of only once.
          schedule: {
            on: { hour: time.hour, minute: time.minute },
            repeats: true,
            allowWhileIdle: true
          }
        });
      });

      // Replace previously scheduled reminders so they do not pile up.
      await this.cancelAll();

      if (!notifications.length) return true;

      try {
        const result = await localNotifications.schedule({ notifications: notifications });
        if (result && result.warning) {
          console.warn("Reminder scheduling warning:", result.warning.message);
        }
        return true;
      } catch (error) {
        console.error("Unable to schedule reminders:", error);
        return false;
      }
    }

    // Browser fallback: only fires while the page stays open.
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }

    const usable = list.filter((schedule) => this.parseTime(schedule.time));
    if (!usable.length) return true;

    this._timer = setInterval(() => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const now = new Date();
      const current = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      usable.forEach((schedule) => {
        const time = this.parseTime(schedule.time);
        if (!time) return;
        const slot = String(time.hour).padStart(2, "0") + ":" + String(time.minute).padStart(2, "0");
        if (slot !== current) return;
        try {
          new Notification("MedRemind", {
            body: String(schedule.medicine_name || "Medication") + " (" + String(schedule.dosage || "dose") + ")"
          });
        } catch (error) {
          console.error("Unable to display notification:", error);
        }
      });
    }, 60000);

    return true;
  }
};
