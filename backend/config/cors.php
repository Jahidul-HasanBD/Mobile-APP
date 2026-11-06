<?php
/**
 * CORS policy.
 *
 * The API authenticates with bearer tokens, so only the app's own WebView
 * origins (plus anything listed in MEDREMIND_ALLOWED_ORIGINS) may read
 * responses cross-origin. Requests without an Origin header (native HTTP,
 * same-origin pages, curl) do not need CORS headers at all.
 */

$allowedOrigins = [
    "https://localhost",      // Capacitor Android (androidScheme: https)
    "capacitor://localhost",  // Capacitor iOS
    "http://localhost",
    "http://localhost:8100",  // `cap run --livereload`
    "ionic://localhost"
];

$configuredOrigins = getenv("MEDREMIND_ALLOWED_ORIGINS");
if (is_string($configuredOrigins) && trim($configuredOrigins) !== "") {
    foreach (explode(",", $configuredOrigins) as $extraOrigin) {
        $extraOrigin = trim($extraOrigin);
        if ($extraOrigin !== "") {
            $allowedOrigins[] = $extraOrigin;
        }
    }
}

$requestOrigin = $_SERVER["HTTP_ORIGIN"] ?? "";

header("Vary: Origin");
if ($requestOrigin !== "" && in_array($requestOrigin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: " . $requestOrigin);
}
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 600");
header("Content-Type: application/json; charset=UTF-8");

if (($_SERVER["REQUEST_METHOD"] ?? "") === "OPTIONS") {
    http_response_code(204);
    exit;
}
?>
