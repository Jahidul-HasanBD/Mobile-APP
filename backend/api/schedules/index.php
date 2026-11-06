<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/helpers.php';

$userId = verifyToken();
$db = (new Database())->getConnection();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $date = isset($_GET['date']) ? sanitize($_GET['date']) : date('Y-m-d');
    if (!isValidDate($date)) {
        jsonResponse(["error" => "Invalid date. Expected YYYY-MM-DD."], 400);
    }

    $stmt = $db->prepare("
        SELECT s.*, m.name as medicine_name, m.dosage, m.user_id
        FROM schedules s
        JOIN medicines m ON s.medicine_id = m.id
        WHERE m.user_id = ? AND s.status = 'active'
        ORDER BY s.time ASC
    ");
    $stmt->execute([$userId]);
    $schedules = $stmt->fetchAll();

    foreach ($schedules as &$sched) {
        $sched['id'] = (int)$sched['id'];
        $sched['medicine_id'] = (int)$sched['medicine_id'];

        // Check if logged for this date
        $logStmt = $db->prepare("SELECT status FROM logs WHERE schedule_id = ? AND log_date = ?");
        $logStmt->execute([$sched['id'], $date]);
        $log = $logStmt->fetch();
        $sched['logged'] = $log ? true : false;
        $sched['log_status'] = $log ? $log['status'] : null;
    }
    unset($sched);

    jsonResponse(["schedules" => $schedules, "date" => $date]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = getInput();

    if (empty($input['medicine_id']) || empty($input['time'])) {
        jsonResponse(["error" => "Medicine ID and time are required"], 400);
    }

    $medicineId = (int)$input['medicine_id'];

    // Verify medicine ownership
    $checkStmt = $db->prepare("SELECT id FROM medicines WHERE id = ? AND user_id = ?");
    $checkStmt->execute([$medicineId, $userId]);
    if (!$checkStmt->fetch()) {
        jsonResponse(["error" => "Medicine not found"], 404);
    }

    $time = normalizeTime($input['time']);
    $mealRelation = enumValue($input['meal_relation'] ?? 'no_relation', ['before_meal', 'after_meal', 'no_relation'], 'no_relation');
    $repeatType = enumValue($input['repeat_type'] ?? 'daily', ['daily', 'weekly', 'custom'], 'daily');
    $customDays = normalizeCustomDays($input['custom_days'] ?? null);

    $stmt = $db->prepare("INSERT INTO schedules (medicine_id, time, meal_relation, repeat_type, custom_days) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$medicineId, $time, $mealRelation, $repeatType, $customDays]);

    jsonResponse([
        "message" => "Schedule added successfully",
        "id" => (int)$db->lastInsertId()
    ], 201);

} else {
    jsonResponse(["error" => "Method not allowed"], 405);
}
?>
