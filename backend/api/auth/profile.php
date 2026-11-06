<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/helpers.php';

$userId = verifyToken();
$db = (new Database())->getConnection();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->prepare("SELECT id, name, email, phone, age, emergency_contact, notification_reminders, notification_low_stock, notification_missed, notification_daily_summary, notification_emergency, reminder_sound, created_at FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonResponse(["error" => "User not found"], 404);
    }

    $user['id'] = (int)$user['id'];
    jsonResponse(["user" => $user]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $input = getInput();

    $fields = [];
    $values = [];

    $allowed = ['name', 'phone', 'age', 'emergency_contact'];
    foreach ($allowed as $field) {
        if (!isset($input[$field])) {
            continue;
        }

        if ($field === 'age') {
            if ($input[$field] === '' || $input[$field] === null) {
                continue;
            }
            $fields[] = "$field = ?";
            $values[] = clampInt($input[$field], 0, 150, 0);
            continue;
        }

        $value = sanitize($input[$field]);
        if ($field === 'name') {
            if ($value === '' || mb_strlen($value) > 100) {
                jsonResponse(["error" => "Name must be between 1 and 100 characters"], 400);
            }
        } elseif (mb_strlen($value) > 20) {
            jsonResponse(["error" => "Phone numbers must not exceed 20 characters"], 400);
        }

        $fields[] = "$field = ?";
        $values[] = $value;
    }

    $notiFields = ['notification_reminders', 'notification_low_stock', 'notification_missed', 'notification_daily_summary', 'notification_emergency', 'reminder_sound'];
    foreach ($notiFields as $field) {
        if (!isset($input[$field])) {
            continue;
        }

        $fields[] = "$field = ?";
        if ($field === 'reminder_sound') {
            $values[] = enumValue($input[$field], ['default_chime', 'gentle_bell', 'soft_notification', 'silent'], 'default_chime');
        } else {
            $values[] = $input[$field] ? 1 : 0;
        }
    }

    if (empty($fields)) {
        jsonResponse(["error" => "No fields to update"], 400);
    }

    $values[] = $userId;
    $sql = "UPDATE users SET " . implode(", ", $fields) . " WHERE id = ?";
    $stmt = $db->prepare($sql);
    $stmt->execute($values);

    jsonResponse(["message" => "Profile updated successfully"]);

} else {
    jsonResponse(["error" => "Method not allowed"], 405);
}
?>
