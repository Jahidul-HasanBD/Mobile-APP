<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/helpers.php';

$userId = verifyToken();
$db = (new Database())->getConnection();

if ($_SERVER['REQUEST_METHOD'] !== 'PUT' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(["error" => "Method not allowed"], 405);
}

$input = getInput();

$currentPassword = isset($input['current_password']) && is_string($input['current_password']) ? $input['current_password'] : '';
$newPassword = isset($input['new_password']) && is_string($input['new_password']) ? $input['new_password'] : '';

if ($currentPassword === '' || $newPassword === '') {
    jsonResponse(["error" => "Current and new password are required"], 400);
}

if (mb_strlen($newPassword) < 8) {
    jsonResponse(["error" => "New password must be at least 8 characters"], 400);
}

if (mb_strlen($newPassword) > 200) {
    jsonResponse(["error" => "New password must not exceed 200 characters"], 400);
}

$stmt = $db->prepare("SELECT password FROM users WHERE id = ?");
$stmt->execute([$userId]);
$user = $stmt->fetch();

if (!$user || !password_verify($currentPassword, $user['password'])) {
    jsonResponse(["error" => "Current password is incorrect"], 400);
}

$hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);
$stmt = $db->prepare("UPDATE users SET password = ? WHERE id = ?");
$stmt->execute([$hashedPassword, $userId]);

jsonResponse(["message" => "Password updated successfully"]);
?>
