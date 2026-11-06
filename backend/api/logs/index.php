<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/helpers.php';

$userId = verifyToken();
$db = (new Database())->getConnection();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $date = $_GET['date'] ?? date('Y-m-d');
    $startDate = $_GET['start_date'] ?? date('Y-m-d', strtotime('-7 days'));
    $endDate = $_GET['end_date'] ?? date('Y-m-d');

    if (!isValidDate($startDate) || !isValidDate($endDate)) {
        jsonResponse(["error" => "Invalid date range. Expected YYYY-MM-DD."], 400);
    }

    if ($startDate > $endDate) {
        jsonResponse(["error" => "start_date must not be after end_date"], 400);
    }

    // Get logs for date range
    $stmt = $db->prepare("
        SELECT l.*, s.time as scheduled_time, s.meal_relation,
               m.name as medicine_name, m.dosage
        FROM logs l
        JOIN schedules s ON l.schedule_id = s.id
        JOIN medicines m ON s.medicine_id = m.id
        WHERE m.user_id = ? AND l.log_date BETWEEN ? AND ?
        ORDER BY l.log_date DESC, s.time ASC
    ");
    $stmt->execute([$userId, $startDate, $endDate]);
    $logs = $stmt->fetchAll();

    foreach ($logs as &$log) {
        $log['id'] = (int)$log['id'];
        $log['schedule_id'] = (int)$log['schedule_id'];
    }
    unset($log);

    // Calculate compliance stats
    $statsStmt = $db->prepare("
        SELECT
            l.status,
            COUNT(*) as count
        FROM logs l
        JOIN schedules s ON l.schedule_id = s.id
        JOIN medicines m ON s.medicine_id = m.id
        WHERE m.user_id = ? AND l.log_date BETWEEN ? AND ?
        GROUP BY l.status
    ");
    $statsStmt->execute([$userId, $startDate, $endDate]);
    $stats = $statsStmt->fetchAll();

    $totalTaken = 0;
    $totalSkipped = 0;
    $totalSnoozed = 0;
    foreach ($stats as $stat) {
        switch ($stat['status']) {
            case 'taken': $totalTaken = (int)$stat['count']; break;
            case 'skipped': $totalSkipped = (int)$stat['count']; break;
            case 'snoozed': $totalSnoozed = (int)$stat['count']; break;
        }
    }
    $totalAll = $totalTaken + $totalSkipped + $totalSnoozed;
    $complianceRate = $totalAll > 0 ? round(($totalTaken / $totalAll) * 100) : 0;

    jsonResponse([
        "logs" => $logs,
        "stats" => [
            "taken" => $totalTaken,
            "skipped" => $totalSkipped,
            "snoozed" => $totalSnoozed,
            "total" => $totalAll,
            "compliance_rate" => $complianceRate
        ],
        "period" => [
            "start_date" => $startDate,
            "end_date" => $endDate
        ]
    ]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = getInput();

    if (empty($input['schedule_id']) || empty($input['status'])) {
        jsonResponse(["error" => "Schedule ID and status are required"], 400);
    }

    $scheduleId = (int)$input['schedule_id'];
    $status = sanitize($input['status']);
    $logDate = sanitize($input['log_date'] ?? date('Y-m-d'));

    if (!in_array($status, ['taken', 'skipped', 'snoozed'], true)) {
        jsonResponse(["error" => "Invalid status. Must be: taken, skipped, or snoozed"], 400);
    }

    if (!isValidDate($logDate)) {
        jsonResponse(["error" => "Invalid log_date. Expected YYYY-MM-DD."], 400);
    }

    // Verify schedule ownership
    $checkStmt = $db->prepare("
        SELECT s.id, s.medicine_id FROM schedules s
        JOIN medicines m ON s.medicine_id = m.id
        WHERE s.id = ? AND m.user_id = ?
    ");
    $checkStmt->execute([$scheduleId, $userId]);
    $ownedSchedule = $checkStmt->fetch();
    if (!$ownedSchedule) {
        jsonResponse(["error" => "Schedule not found"], 404);
    }

    // Look at the existing log first: repeatedly toggling "taken" used to
    // decrement the stock on every call.
    $existingStmt = $db->prepare("SELECT status FROM logs WHERE schedule_id = ? AND log_date = ?");
    $existingStmt->execute([$scheduleId, $logDate]);
    $previousStatus = $existingStmt->fetchColumn();
    $previousStatus = $previousStatus === false ? null : $previousStatus;

    $db->beginTransaction();
    try {
        // Upsert log (update if exists for same date)
        $stmt = $db->prepare("
            INSERT INTO logs (schedule_id, log_date, action_time, status)
            VALUES (?, ?, NOW(), ?)
            ON DUPLICATE KEY UPDATE action_time = NOW(), status = VALUES(status)
        ");
        $stmt->execute([$scheduleId, $logDate, $status]);

        $medicineId = (int)$ownedSchedule['medicine_id'];

        // Decrement stock only when the dose becomes "taken" for the first time.
        if ($status === 'taken' && $previousStatus !== 'taken') {
            $stockStmt = $db->prepare("UPDATE medicines SET current_stock = GREATEST(0, current_stock - 1) WHERE id = ? AND user_id = ?");
            $stockStmt->execute([$medicineId, $userId]);
        } elseif ($status !== 'taken' && $previousStatus === 'taken') {
            // Undo the decrement when a "taken" dose is corrected.
            $stockStmt = $db->prepare("UPDATE medicines SET current_stock = current_stock + 1 WHERE id = ? AND user_id = ?");
            $stockStmt->execute([$medicineId, $userId]);
        }

        $db->commit();
    } catch (PDOException $exception) {
        $db->rollBack();
        error_log("MedRemind log write failed: " . $exception->getMessage());
        jsonResponse(["error" => "Could not record the dose"], 500);
    }

    jsonResponse([
        "message" => "Log recorded successfully",
        "status" => $status
    ], 201);

} else {
    jsonResponse(["error" => "Method not allowed"], 405);
}
?>
