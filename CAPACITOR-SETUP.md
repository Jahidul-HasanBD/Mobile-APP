# Capacitor Setup Guide — MedRemind Android App

> **Update:** the app is now offline-first and does not use XAMPP, PHP or MySQL.
> Sign in and medicine search go to Supabase; everything else is stored on the
> phone. Use **[SUPABASE-SETUP.md](SUPABASE-SETUP.md)** for the current setup.
> The LAN-IP steps below (Steps 4–5) are kept only as history of the old
> XAMPP-based flow and no longer apply.

> Website ke Android app e convert korar full guide — simple bhasha e, step by step.

---

## 🧠 Age Concept Ta Bujho — Ki Hocche Ekhere?

Apnar app er **2ta part**:

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  FRONTEND (face)        │         │  BACKEND (brain)         │
│  HTML/CSS/JS pages      │ ──────► │  PHP API + MySQL         │
│  index.html, dashboard  │ Wi-Fi   │  XAMPP e cholteche       │
│  EIGULO PHONE E JABE    │ diye    │  EIGULO PC TE THAKBE     │
└─────────────────────────┘         └──────────────────────────┘
```

- **Frontend** (design/pages) → phone er bhitore jabe (APK er moddhe)
- **Backend** (data/database) → apnar PC te XAMPP diye cholbe
- Phone ar PC **same Wi-Fi** te thakte hobe — phone PC er dike data pathabe IP address (`192.168.0.102`) diye

**Capacitor** holo ekta tool ja apnar HTML file gulo ke ekta **Android app er packet (APK)** e baniye dey.

> Simple kotha: Website ke app er poshak pore phone e pathano. 📱

**Ek line e saransho:**

> Website er file → Capacitor diye packet kora → Android Studio diye APK banano → phone e install → phone Wi-Fi diye PC er XAMPP theke data ante thakbe.

---

## ✅ Step 0: Ja Ja Age Thekei Ache (Verify Kora)

| Requirement | Status | Path / Version |
|---|---|---|
| Node.js | ✅ | v24.16.0 |
| npm | ✅ | v11.15.0 |
| Android Studio | ✅ | `C:\Program Files\Android\Android Studio` |
| Android SDK | ✅ | `C:\Users\<You>\AppData\Local\Android\Sdk` |
| XAMPP (Apache + MySQL) | ✅ | `C:\xampp2` |
| Local Wi-Fi IP | ✅ | `192.168.0.102` *(router change hole re-check korte hobe)* |

**⚠️ Important:** Phone ar PC **same Wi-Fi** te thakte hobe. Na hole app PC er sathe connect korte parbe na.

---

## 📦 Step 1: Capacitor Download Kora

PowerShell khule `C:\xampp2\htdocs\SMRP` folder e jao, tarpor:

```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/local-notifications
```

**Ki hocche:** Capacitor er tools gulo download hocche project e.
*Jemon game khelar age game install korte hoy — eta o same.*

---

## ⚙️ Step 2: Config File Banano

Project root e **`capacitor.config.json`** naam e file banao:

```json
{
  "appId": "com.medremind.app",
  "appName": "MedRemind",
  "webDir": "www",
  "server": {
    "androidScheme": "https"
  }
}
```

**Ki hocche:** Ei file e likha thake:
- App er naam ki hobe → `MedRemind`
- Kon folder er file gulo app e jabe → `www/`

---

## 📁 Step 3: `www/` Folder Banano (File Copy)

Apnar HTML file gulo **copy** kore `www/` folder e rakho:

```
SMRP/
├── www/                  ← shudhu frontend file (egula app e jabe)
│   ├── index.html
│   ├── dashboard.html
│   ├── medicines.html
│   ├── schedule.html
│   ├── profile.html
│   └── js/
│       └── config.js     ← server address ekhane likhbo
├── backend/              ← PC te thakbe, app e JABE NA
├── android/              ← Step 5 e auto toiri hobe
└── capacitor.config.json
```

**Ki hocche:** Capacitor shudhu `www/` folder takei app er moddhe pack kore. Backend PHP folder jabe na — oita PC tei cholbe.

### Bar bar copy na kore script diye koro

`package.json` file e ei script add koro:

```json
{
  "scripts": {
    "copy-web": "powershell -Command \"Copy-Item *.html www\\ -Force; if (!(Test-Path www\\js)) { New-Item -ItemType Directory www\\js | Out-Null }\""
  }
}
```

Tarpor shudhu ei command chalao:

```bash
npm run copy-web
```

---

## 🌐 Step 4: Server Address Lekha (SOBCHeye IMPORTANT!)

**`www/js/config.js`** file banao:

```javascript
// MedRemind API Configuration
// ⚠️ PC er LAN IP use korte hobe — localhost NA! (phone PC er localhost dhkte pare na)
const API_BASE = "http://192.168.0.102/SMRP/backend/api";

// Token helpers (login info mone rakhar jonno)
const Auth = {
  getToken: () => localStorage.getItem("medremind_token"),
  setToken: (t) => localStorage.setItem("medremind_token", t),
  clearToken: () => localStorage.removeItem("medremind_token"),
  getUser: () => JSON.parse(localStorage.getItem("medremind_user") || "null"),
  setUser: (u) => localStorage.setItem("medremind_user", JSON.stringify(u))
};

// Shared fetch wrapper (auth header soho)
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  const token = Auth.getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();

  if (res.status === 401) {
    Auth.clearToken();
    window.location.href = "index.html";
    return;
  }
  return data;
}
```

Prottek page er `<head>` e ei line add koro (onno script er age):

```html
<script src="js/config.js"></script>
```

**Ki hocche:** Phone jane na apnar PC kothay — tai address ta likhe dite hoy.
`localhost` likhle **kaj korbe na**, karon localhost mane phone nijerke! 🤦

### Apnar IP number ber korte:

```bash
ipconfig    # "IPv4 Address" er pashe je number ache oitai apnar IP
```

> Router change/new WiFi hole IP change hote pare. Tokhon `config.js` update koro → `npm run copy-web` → `npx cap sync` → abar build.

---

## 🔗 Step 5: Real API Wire Kora (Checklist)

Ekhon pages gulo te demo/fake JS ache. Real data ante hole egula replace korte hobe:

| Page | Ekhon ache (demo) | Real API te replace korbo |
|---|---|---|
| `index.html` | fake login redirect | `POST /auth/login.php` → token save → dashboard |
| `index.html` | fake register redirect | `POST /auth/register.php` → token save → dashboard |
| `dashboard.html` | hardcoded stats/list | `GET /logs/today.php` |
| `dashboard.html` | badge click = status change | `POST /logs/index.php` `{schedule_id, status}` |
| `medicines.html` | hardcoded cards | `GET /medicines/index.php` → JS diye render |
| `medicines.html` | add = alert only | `POST /medicines/index.php` |
| `medicines.html` | edit/delete = alert only | `PUT/DELETE /medicines/single.php?id=X` |
| `medicines.html` | Refill button | `PUT /medicines/stock.php?id=X` `{action:"set", amount:N}` |
| `schedule.html` | hardcoded time slots | `GET /schedules/index.php?date=YYYY-MM-DD` |
| `schedule.html` | add schedule = alert only | `POST /schedules/index.php` |
| `profile.html` | prefilled form | `GET /auth/profile.php` + `PUT /auth/profile.php` |

### Example — Real login handler:

```javascript
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  const data = await api("/auth/login.php", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  if (data.error) { showMessage(data.error, "error"); return; }

  Auth.setToken(data.token);
  Auth.setUser(data.user);
  window.location.href = "dashboard.html";
}
```

---

## 🔔 Step 6: Notification Engine (Medicine Reminder)

**`www/js/notifications.js`** file banao — platform auto-detect korbe:

> ⚠️ Ei project e kono bundler nei. Tai `import { LocalNotifications } from "@capacitor/local-notifications"` **kaj korbe na** (bare module specifier WebView resolve korte pare na). Capacitor nijei plugin-gulo page e inject kore, tai `Capacitor.Plugins.LocalNotifications` use koro.

```javascript
const ReminderEngine = {
  // App e cholche naki browser e? check kore
  isNative: () => typeof Capacitor !== "undefined" && Capacitor.isNativePlatform(),

  async requestPermission() {
    if (this.isNative()) {
      const LocalNotifications = Capacitor.Plugins.LocalNotifications;
      const result = await LocalNotifications.requestPermissions();
      return result.display === "granted";
    }
    if (!("Notification" in window)) return false;
    const perm = await Notification.requestPermission();
    return perm === "granted";
  },

  async scheduleAll(schedules) {
    // schedules = [{id, medicine_name, dosage, time}] — API theke asbe
    if (this.isNative()) {
      const LocalNotifications = Capacitor.Plugins.LocalNotifications;
      const notifications = schedules.map((s) => {
        const [h, m] = s.time.split(":");

        return {
          id: s.id,
          title: "Time for your medicine",
          body: `${s.medicine_name} (${s.dosage})`,
          // `on` + repeats = prottekdin same time e reminder
          schedule: { on: { hour: +h, minute: +m }, repeats: true, allowWhileIdle: true }
        };
      });
      await LocalNotifications.schedule({ notifications });
    } else {
      // Browser fallback — prottek minute check kore
      setInterval(() => {
        const now = new Date().toTimeString().slice(0, 5);
        schedules.forEach((s) => {
          if (s.time.slice(0, 5) === now && Notification.permission === "granted") {
            new Notification("MedRemind", {
              body: `${s.medicine_name} (${s.dosage})`,
            });
          }
        });
      }, 60000);
    }
  }
};
```

Dashboard load howar por call koro:

```javascript
const data = await api("/schedules/index.php");
await ReminderEngine.requestPermission();
await ReminderEngine.scheduleAll(data.schedules);
```

**Ki hocche:** App e cholle native notification jabe (app bondo thakleo), browser e cholle tab open thakle notification dekhabe.

---

## 🤖 Step 7: Android Project Toiri

```bash
npm run copy-web
npx cap add android
```

**Ki hocche:** Ekta `android/` folder toiri hobe — eta asol Android app er skeleton. Ei folder ta Android Studio bujhe.

### Permission dewa (HTTP + Notification)

**`android/app/src/main/AndroidManifest.xml`** file khule:

`<manifest>` tag er bhitore add koro:

```xml
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

`<application ...>` tag er bhitore add koro:

```xml
android:usesCleartextTraffic="true"
```

**Ki hocche:** HTTP network use korte paruk (PC er sathe kotha bolte) + notification dekhate paruk.

---

## 🏗️ Step 8: Sync & Android Studio Khola

Code change korar por bar bar ei command chalao:

```bash
npm run copy-web
npx cap sync
npx cap open android
```

**Ki hocche:**
- `copy-web` → HTML file gulo `www/` te copy hoy
- `sync` → `www/` er file gulo `android/` project er moddhe jay
- `open android` → Android Studio khule app soho

### Android Studio theke APK Banano

1. Gradle sync sesh howa porjo (prothom bar koyek minute lage)
2. **Debug APK (testing er jonno):**
   - Menu: `Build → Build Bundle(s)/APK(s) → Build APK(s)`
   - File pabe: `android/app/build/outputs/apk/debug/app-debug.apk`
3. **Release APK (distribution er jonno):**
   - `Build → Generate Signed Bundle/APK → APK`
   - Keystore banao (ekbar e), password set koro, build koro
4. Phone e install: APK transfer koro → "Install unknown apps" allow koro → install

### USB diye direct phone e run korte:

- Phone e **Developer Options** + **USB Debugging** on koro
- Android Studio toolbar e device select koro → ▶ Run chapo

---

## 🚨 Troubleshooting — Problem Hole Ei Table Dekho

| Problem | Fix |
|---|---|
| `JAVA_HOME not found` (CLI gradle) | Env var set koro: `JAVA_HOME = C:\Program Files\Android\Android Studio\jbr` |
| App chole kintu data ashe na | Phone & PC same Wi-Fi te ache? `API_BASE` er IP thik ache? Phone er browser e test koro: `http://192.168.0.102/SMRP/backend/api/auth/login.php` |
| Windows Firewall Apache block korche | Firewall e Apache HTTP Server ke Private networks er jonno allow koro |
| Blank white screen | `npx cap sync` bhule gecho; `www/index.html` ache kina check koro |
| Notification fire hocche na | Battery optimization app kill korche — MedRemind er jonno optimization off koro; exact alarm permission check koro |
| CORS error | Already handle kora ache (`cors.php` te). Tawo hole XAMPP Apache running ache kina dekho |
| Router restart er por IP changed | `js/config.js` update → `npm run copy-web` → `npx cap sync` → abar build |

---

## ⌨️ Quick Command Reference (Sob Ekjaygay)

```bash
# Prothom bar setup (ekbar e)
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/local-notifications
npx cap add android

# Protibar code change er por
npm run copy-web
npx cap sync
npx cap open android

# Development er somoy live reload (optional)
npx cap run android --livereload --external
```

---

## 📝 Saransho (Ek Line E)

> Website er file → Capacitor diye packet kora → Android Studio diye APK banano → phone e install → phone Wi-Fi diye PC er XAMPP theke data ante thakbe.

---

*Generated for SMRP v1.0 — Local IP at time of writing: `192.168.0.102`*
