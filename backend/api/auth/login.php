<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(["error" => "Method not allowed"], 405);
}

$input = getInput();

if (empty($input['email']) || empty($input['password'])) {
    jsonResponse(["error" => "Email and password are required"], 400);
}

$email = strtolower(sanitize($input['email']));
$password = is_string($input['password']) ? $input['password'] : '';
$throttleKey = throttleKey($email);

$retryAfter = throttleCheck($throttleKey);
if ($retryAfter > 0) {
    header("Retry-After: " . $retryAfter);
    jsonResponse(["error" => "Too many failed attempts. Try again in " . ceil($retryAfter / 60) . " minute(s)."], 429);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
    throttleFail($throttleKey);
    jsonResponse(["error" => "Invalid email or password"], 401);
}

$db = (new Database())->getConnection();

$stmt = $db->prepare("SELECT * FROM users WHERE email = ?");
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password'])) {
    throttleFail($throttleKey);
    jsonResponse(["error" => "Invalid email or password"], 401);
}

throttleReset($throttleKey);

// Upgrade hashes transparently when PHP's default algorithm changes.
if (password_needs_rehash($user['password'], PASSWORD_DEFAULT)) {
    $rehashStmt = $db->prepare("UPDATE users SET password = ? WHERE id = ?");
    $rehashStmt->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
}

$token = generateToken($user['id']);

jsonResponse([
    "message" => "Login successful",
    "token" => $token,
    "user" => [
        "id" => (int)$user['id'],
        "name" => $user['name'],
        "email" => $user['email'],
        "phone" => $user['phone'],
        "age" => $user['age'],
        "emergency_contact" => $user['emergency_contact']
    ]
]);
?>
