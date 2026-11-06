<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/helpers.php';

$userId = verifyToken();
$db = (new Database())->getConnection();

$scheduleId = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if ($scheduleId <= 0) {
    jsonResponse(["error" => "Invalid schedule ID"], 400);
}

// Verify ownership via medicine
$stmt = $db->prepare("
    SELECT s.* FROM schedules s
    JOIN medicines m ON s.medicine_id = m.id
    WHERE s.id = ? AND m.user_id = ?
");
$stmt->execute([$scheduleId, $userId]);
$schedule = $stmt->fetch();

if (!$schedule) {
    jsonResponse(["error" => "Schedule not found"], 404);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $schedule['id'] = (int)$schedule['id'];
    $schedule['medicine_id'] = (int)$schedule['medicine_id'];
    jsonResponse(["schedule" => $schedule]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $input = getInput();

    $fields = [];
    $values = [];

    if (isset($input['time'])) {
        $fields[] = "time = ?";
        $values[] = normalizeTime($input['time'], $schedule['time']);
    }
    if (isset($input['meal_relation'])) {
        $fields[] = "meal_relation = ?";
        $values[] = enumValue($input['meal_relation'], ['before_meal', 'after_meal', 'no_relation'], 'no_relation');
    }
    if (isset($input['repeat_type'])) {
        $fields[] = "repeat_type = ?";
        $values[] = enumValue($input['repeat_type'], ['daily', 'weekly', 'custom'], 'daily');
    }
    if (array_key_exists('custom_days', $input)) {
        $fields[] = "custom_days = ?";
        $values[] = normalizeCustomDays($input['custom_days']);
    }
    if (isset($input['status'])) {
        $fields[] = "status = ?";
        $values[] = enumValue($input['status'], ['active', 'inactive'], 'active');
    }

    if (empty($fields)) {
        jsonResponse(["error" => "No fields to update"], 400);
    }

    $values[] = $scheduleId;
    $sql = "UPDATE schedules SET " . implode(", ", $fields) . " WHERE id = ?";
    $stmt = $db->prepare($sql);
    $stmt->execute($values);

    jsonResponse(["message" => "Schedule updated successfully"]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $stmt = $db->prepare("DELETE FROM schedules WHERE id = ?");
    $stmt->execute([$scheduleId]);

    jsonResponse(["message" => "Schedule deleted successfully"]);

} else {
    jsonResponse(["error" => "Method not allowed"], 405);
}
?>
