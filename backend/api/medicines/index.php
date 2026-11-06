<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/helpers.php';

$userId = verifyToken();
$db = (new Database())->getConnection();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->prepare("SELECT * FROM medicines WHERE user_id = ? ORDER BY created_at DESC");
    $stmt->execute([$userId]);
    $medicines = $stmt->fetchAll();

    foreach ($medicines as &$med) {
        $med['id'] = (int)$med['id'];
        $med['total_stock'] = (int)$med['total_stock'];
        $med['current_stock'] = (int)$med['current_stock'];
        $med['low_stock_threshold'] = (int)$med['low_stock_threshold'];

        // Get schedules for this medicine
        $schedStmt = $db->prepare("SELECT * FROM schedules WHERE medicine_id = ? AND status = 'active'");
        $schedStmt->execute([$med['id']]);
        $schedules = $schedStmt->fetchAll();
        foreach ($schedules as &$schedule) {
            $schedule['id'] = (int)$schedule['id'];
            $schedule['medicine_id'] = (int)$schedule['medicine_id'];
        }
        unset($schedule);
        $med['schedules'] = $schedules;
    }
    unset($med);

    jsonResponse(["medicines" => $medicines]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = getInput();

    if (empty($input['name']) || empty($input['dosage'])) {
        jsonResponse(["error" => "Name and dosage are required"], 400);
    }

    $name = sanitize($input['name']);
    $dosage = sanitize($input['dosage']);
    $instructions = sanitize($input['instructions'] ?? '');

    if ($name === '' || mb_strlen($name) > 150) {
        jsonResponse(["error" => "Name must be between 1 and 150 characters"], 400);
    }

    if (mb_strlen($dosage) > 50) {
        jsonResponse(["error" => "Dosage must not exceed 50 characters"], 400);
    }

    $totalStock = clampInt($input['total_stock'] ?? 0, 0, 100000, 0);
    $currentStock = clampInt($input['current_stock'] ?? $totalStock, 0, 100000, $totalStock);
    $lowStockThreshold = clampInt($input['low_stock_threshold'] ?? 10, 0, 100000, 10);

    $stmt = $db->prepare("INSERT INTO medicines (user_id, name, dosage, instructions, total_stock, current_stock, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$userId, $name, $dosage, $instructions, $totalStock, $currentStock, $lowStockThreshold]);

    $medicineId = (int)$db->lastInsertId();

    // Add schedules if provided
    if (!empty($input['schedules']) && is_array($input['schedules'])) {
        foreach ($input['schedules'] as $sched) {
            if (!is_array($sched)) {
                continue;
            }

            $time = normalizeTime($sched['time'] ?? '08:00:00');
            $mealRelation = enumValue($sched['meal_relation'] ?? 'no_relation', ['before_meal', 'after_meal', 'no_relation'], 'no_relation');
            $repeatType = enumValue($sched['repeat_type'] ?? 'daily', ['daily', 'weekly', 'custom'], 'daily');
            $customDays = normalizeCustomDays($sched['custom_days'] ?? null);

            $schedStmt = $db->prepare("INSERT INTO schedules (medicine_id, time, meal_relation, repeat_type, custom_days) VALUES (?, ?, ?, ?, ?)");
            $schedStmt->execute([$medicineId, $time, $mealRelation, $repeatType, $customDays]);
        }
    }

    jsonResponse([
        "message" => "Medicine added successfully",
        "id" => $medicineId
    ], 201);

} else {
    jsonResponse(["error" => "Method not allowed"], 405);
}
?>
