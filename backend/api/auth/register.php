<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(["error" => "Method not allowed"], 405);
}

$input = getInput();

if (empty($input['name']) || empty($input['email']) || empty($input['password'])) {
    jsonResponse(["error" => "Name, email, and password are required"], 400);
}

$name = sanitize($input['name']);
$email = strtolower(sanitize($input['email']));
$password = is_string($input['password']) ? $input['password'] : '';
$phone = sanitize($input['phone'] ?? '');
$age = isset($input['age']) && $input['age'] !== '' ? clampInt($input['age'], 0, 150, 0) : null;
$emergency = sanitize($input['emergency_contact'] ?? '');

if ($name === '' || mb_strlen($name) > 100) {
    jsonResponse(["error" => "Name must be between 1 and 100 characters"], 400);
}

if (mb_strlen($password) < 8) {
    jsonResponse(["error" => "Password must be at least 8 characters"], 400);
}

if (mb_strlen($password) > 200) {
    jsonResponse(["error" => "Password must not exceed 200 characters"], 400);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 150) {
    jsonResponse(["error" => "Invalid email format"], 400);
}

if (mb_strlen($phone) > 20 || mb_strlen($emergency) > 20) {
    jsonResponse(["error" => "Phone numbers must not exceed 20 characters"], 400);
}

$db = (new Database())->getConnection();

// Check if email exists
$stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
$stmt->execute([$email]);
if ($stmt->fetch()) {
    jsonResponse(["error" => "Email already registered"], 409);
}

try {
    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $db->prepare("INSERT INTO users (name, email, password, phone, age, emergency_contact) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->execute([$name, $email, $hashedPassword, $phone, $age, $emergency]);
    $userId = (int)$db->lastInsertId();
} catch (PDOException $exception) {
    // A concurrent registration can still hit the UNIQUE index.
    error_log("MedRemind registration failed: " . $exception->getMessage());
    if ($exception->getCode() === '23000') {
        jsonResponse(["error" => "Email already registered"], 409);
    }
    jsonResponse(["error" => "Could not create the account"], 500);
}

$token = generateToken($userId);

jsonResponse([
    "message" => "Registration successful",
    "token" => $token,
    "user" => [
        "id" => $userId,
        "name" => $name,
        "email" => $email,
        "phone" => $phone,
        "age" => $age,
        "emergency_contact" => $emergency
    ]
], 201);
?>
