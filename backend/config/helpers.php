<?php
/**
 * Shared helpers: JSON responses, input handling, validation and stateless
 * HMAC-signed auth tokens.
 */

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    if (!headers_sent()) {
        header("Content-Type: application/json; charset=UTF-8");
        header("X-Content-Type-Options: nosniff");
        header("Cache-Control: no-store");
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function getInput() {
    $raw = file_get_contents("php://input");
    if ($raw === false || $raw === "") {
        return [];
    }
    $input = json_decode($raw, true);
    return is_array($input) ? $input : [];
}

/**
 * Trim surrounding whitespace and drop control characters.
 *
 * Important: values are NOT HTML encoded here. They are stored as-is and
 * escaped at render time by the web client. Encoding on input corrupts data
 * (for example an email such as "o'brien@example.com" was stored as
 * "o&#039;brien@example.com" and could then never be used to log in).
 */
function sanitize($data) {
    if (is_bool($data)) {
        $data = $data ? "1" : "0";
    } elseif (!is_scalar($data)) {
        $data = "";
    }
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', "", (string)$data);
    return trim((string)$value);
}

function clampInt($value, $min, $max, $default = 0) {
    if (!is_numeric($value)) {
        return $default;
    }
    return max($min, min($max, (int)$value));
}

function enumValue($value, array $allowed, $default) {
    $candidate = sanitize($value);
    return in_array($candidate, $allowed, true) ? $candidate : $default;
}

function isValidDate($value) {
    $candidate = sanitize($value);
    $parsed = DateTime::createFromFormat("!Y-m-d", $candidate);
    return $parsed && $parsed->format("Y-m-d") === $candidate;
}

/** Returns a HH:MM:SS string, or $default when the value is not a valid time. */
function normalizeTime($value, $default = "08:00:00") {
    $candidate = sanitize($value);
    if (preg_match('/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/', $candidate, $matches)) {
        return $matches[1] . ":" . $matches[2] . ":" . (isset($matches[3]) && $matches[3] !== "" ? $matches[3] : "00");
    }
    return $default;
}

/** Normalizes "0,2,4" style weekday lists into a stable CSV, or null. */
function normalizeCustomDays($value) {
    if ($value === null || $value === "") {
        return null;
    }
    $parts = is_array($value) ? $value : explode(",", (string)$value);
    $days = [];
    foreach ($parts as $part) {
        $part = trim((string)$part);
        if ($part !== "" && preg_match('/^[0-6]$/', $part)) {
            $days[] = (int)$part;
        }
    }
    $days = array_values(array_unique($days));
    sort($days);
    return $days ? implode(",", $days) : null;
}

/* -------------------------------------------------------------------------
 * Auth tokens
 *
 * Tokens are "<payload>.<hmac>" where both parts are base64url encoded and
 * the HMAC is SHA-256 over the encoded payload. Without the signature the
 * previous implementation allowed anyone to mint a token for any user id.
 * ---------------------------------------------------------------------- */

function authSecret() {
    static $secret = null;
    if ($secret !== null) {
        return $secret;
    }

    $fromEnv = getenv("MEDREMIND_AUTH_SECRET");
    if (is_string($fromEnv) && strlen($fromEnv) >= 32) {
        $secret = $fromEnv;
        return $secret;
    }

    $secretFile = __DIR__ . DIRECTORY_SEPARATOR . ".auth_secret";
    if (is_readable($secretFile)) {
        $stored = trim((string)file_get_contents($secretFile));
        if (strlen($stored) >= 32) {
            $secret = $stored;
            return $secret;
        }
    }

    $generated = bin2hex(random_bytes(32));
    if (@file_put_contents($secretFile, $generated, LOCK_EX) !== false) {
        @chmod($secretFile, 0600);
        $secret = $generated;
        return $secret;
    }

    // Last resort when the config directory is read-only. Still a stable,
    // install-specific value so existing sessions keep working.
    error_log("MedRemind: could not persist auth secret, using derived fallback");
    $secret = hash("sha256", "medremind|" . __DIR__ . "|" . php_uname("n"));
    return $secret;
}

function base64UrlEncode($binary) {
    return rtrim(strtr(base64_encode($binary), "+/", "-_"), "=");
}

function base64UrlDecode($value) {
    $padded = strtr((string)$value, "-_", "+/");
    $remainder = strlen($padded) % 4;
    if ($remainder) {
        $padded .= str_repeat("=", 4 - $remainder);
    }
    $decoded = base64_decode($padded, true);
    return $decoded === false ? "" : $decoded;
}

function generateToken($userId) {
    $payload = [
        "user_id" => (int)$userId,
        "iat" => time(),
        "exp" => time() + (7 * 24 * 60 * 60) // 7 days
    ];
    $encodedPayload = base64UrlEncode(json_encode($payload));
    $signature = hash_hmac("sha256", $encodedPayload, authSecret(), true);
    return $encodedPayload . "." . base64UrlEncode($signature);
}

function requestAuthorizationHeader() {
    if (function_exists("getallheaders")) {
        $headers = getallheaders();
        if (is_array($headers)) {
            foreach ($headers as $name => $value) {
                if (strcasecmp($name, "Authorization") === 0) {
                    return (string)$value;
                }
            }
        }
    }
    if (!empty($_SERVER["HTTP_AUTHORIZATION"])) {
        return (string)$_SERVER["HTTP_AUTHORIZATION"];
    }
    if (!empty($_SERVER["REDIRECT_HTTP_AUTHORIZATION"])) {
        return (string)$_SERVER["REDIRECT_HTTP_AUTHORIZATION"];
    }
    if (function_exists("apache_request_headers")) {
        $headers = apache_request_headers();
        if (is_array($headers)) {
            foreach ($headers as $name => $value) {
                if (strcasecmp($name, "Authorization") === 0) {
                    return (string)$value;
                }
            }
        }
    }
    return "";
}

function verifyToken() {
    $auth = requestAuthorizationHeader();

    if ($auth === "" || !preg_match('/^Bearer\s+(\S+)$/i', $auth, $matches)) {
        jsonResponse(["error" => "Unauthorized"], 401);
    }

    $parts = explode(".", $matches[1]);
    if (count($parts) !== 2 || $parts[0] === "" || $parts[1] === "") {
        jsonResponse(["error" => "Invalid token"], 401);
    }

    $expected = hash_hmac("sha256", $parts[0], authSecret(), true);
    $provided = base64UrlDecode($parts[1]);
    if (!is_string($provided) || $provided === "" || !hash_equals($expected, $provided)) {
        jsonResponse(["error" => "Invalid token"], 401);
    }

    $payload = json_decode(base64UrlDecode($parts[0]), true);
    if (!is_array($payload) || !isset($payload["user_id"], $payload["exp"])) {
        jsonResponse(["error" => "Invalid token"], 401);
    }

    if ((int)$payload["exp"] < time()) {
        jsonResponse(["error" => "Token expired"], 401);
    }

    return (int)$payload["user_id"];
}

/* -------------------------------------------------------------------------
 * Login throttling
 *
 * Simple per-email/per-IP counter so the LAN API cannot be used to brute
 * force passwords. It fails open (a broken temp dir never locks anyone out).
 * ---------------------------------------------------------------------- */

function throttleKey($email) {
    $ip = $_SERVER["REMOTE_ADDR"] ?? "unknown";
    return hash("sha256", strtolower(sanitize($email)) . "|" . $ip);
}

function throttleFile($key) {
    return rtrim(sys_get_temp_dir(), "\\/") . DIRECTORY_SEPARATOR . "medremind_login_" . $key . ".json";
}

/** Returns seconds the caller must wait, or 0 when the attempt may proceed. */
function throttleCheck($key, $maxAttempts = 10, $window = 900) {
    $file = throttleFile($key);
    $handle = @fopen($file, "c+");
    if (!$handle) {
        return 0;
    }

    flock($handle, LOCK_EX);
    $raw = stream_get_contents($handle);
    $data = $raw ? json_decode($raw, true) : null;
    $now = time();

    if (!is_array($data) || !isset($data["count"], $data["first"]) || ($now - (int)$data["first"]) > $window) {
        $data = ["count" => 0, "first" => $now];
    }

    $blocked = (int)$data["count"] >= $maxAttempts;
    $retryAfter = max(0, $window - ($now - (int)$data["first"]));

    flock($handle, LOCK_UN);
    fclose($handle);

    return $blocked ? $retryAfter : 0;
}

function throttleFail($key, $window = 900) {
    $file = throttleFile($key);
    $handle = @fopen($file, "c+");
    if (!$handle) {
        return;
    }

    flock($handle, LOCK_EX);
    $raw = stream_get_contents($handle);
    $data = $raw ? json_decode($raw, true) : null;
    $now = time();

    if (!is_array($data) || !isset($data["count"], $data["first"]) || ($now - (int)$data["first"]) > $window) {
        $data = ["count" => 0, "first" => $now];
    }

    $data["count"] = (int)$data["count"] + 1;
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($data));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

function throttleReset($key) {
    @unlink(throttleFile($key));
}
?>
