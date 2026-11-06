<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/helpers.php';

$userId = verifyToken();
$db = (new Database())->getConnection();

// Get medicine ID from URL
$medicineId = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if ($medicineId <= 0) {
    jsonResponse(["error" => "Invalid medicine ID"], 400);
}

// Verify ownership
$stmt = $db->prepare("SELECT * FROM medicines WHERE id = ? AND user_id = ?");
$stmt->execute([$medicineId, $userId]);
$medicine = $stmt->fetch();

if (!$medicine) {
    jsonResponse(["error" => "Medicine not found"], 404);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $medicine['id'] = (int)$medicine['id'];
    $medicine['total_stock'] = (int)$medicine['total_stock'];
    $medicine['current_stock'] = (int)$medicine['current_stock'];
    $medicine['low_stock_threshold'] = (int)$medicine['low_stock_threshold'];

    // Get schedules
    $schedStmt = $db->prepare("SELECT * FROM schedules WHERE medicine_id = ?");
    $schedStmt->execute([$medicineId]);
    $schedules = $schedStmt->fetchAll();
    foreach ($schedules as &$schedule) {
        $schedule['id'] = (int)$schedule['id'];
        $schedule['medicine_id'] = (int)$schedule['medicine_id'];
    }
    unset($schedule);
    $medicine['schedules'] = $schedules;

    jsonResponse(["medicine" => $medicine]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $input = getInput();

    $fields = [];
    $values = [];

    $numericFields = ['total_stock', 'current_stock', 'low_stock_threshold'];
    $textFields = ['name', 'dosage', 'instructions'];

    foreach ($textFields as $field) {
        if (!isset($input[$field])) {
            continue;
        }
        $value = sanitize($input[$field]);
        if ($field === 'name' && ($value === '' || mb_strlen($value) > 150)) {
            jsonResponse(["error" => "Name must be between 1 and 150 characters"], 400);
        }
        if ($field === 'dosage' && ($value === '' || mb_strlen($value) > 50)) {
            jsonResponse(["error" => "Dosage must be between 1 and 50 characters"], 400);
        }
        $fields[] = "$field = ?";
        $values[] = $value;
    }

    foreach ($numericFields as $field) {
        if (!isset($input[$field])) {
            continue;
        }
        $fields[] = "$field = ?";
        $values[] = clampInt($input[$field], 0, 100000, 0);
    }

    if (!empty($fields)) {
        $values[] = $medicineId;
        $sql = "UPDATE medicines SET " . implode(", ", $fields) . " WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute($values);
    }

    // Update schedules if provided
    if (isset($input['schedules']) && is_array($input['schedules'])) {
        // Delete existing schedules
        $delStmt = $db->prepare("DELETE FROM schedules WHERE medicine_id = ?");
        $delStmt->execute([$medicineId]);

        // Insert new schedules
        foreach ($input['schedules'] as $sched) {
            if (!is_array($sched)) {
                continue;
            }

            $time = normalizeTime($sched['time'] ?? '08:00:00');
            $mealRelation = enumValue($sched['meal_relation'] ?? 'no_relation', ['before_meal', 'after_meal', 'no_relation'], 'no_relation');
            $repeatType = enumValue($sched['repeat_type'] ?? 'daily', ['daily', 'weekly', 'custom'], 'daily');
            $customDays = normalizeCustomDays($sched['custom_days'] ?? null);
            $status = enumValue($sched['status'] ?? 'active', ['active', 'inactive'], 'active');

            $schedStmt = $db->prepare("INSERT INTO schedules (medicine_id, time, meal_relation, repeat_type, custom_days, status) VALUES (?, ?, ?, ?, ?, ?)");
            $schedStmt->execute([$medicineId, $time, $mealRelation, $repeatType, $customDays, $status]);
        }
    }

    jsonResponse(["message" => "Medicine updated successfully"]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $stmt = $db->prepare("DELETE FROM medicines WHERE id = ? AND user_id = ?");
    $stmt->execute([$medicineId, $userId]);

    jsonResponse(["message" => "Medicine deleted successfully"]);

} else {
    jsonResponse(["error" => "Method not allowed"], 405);
}
?>
