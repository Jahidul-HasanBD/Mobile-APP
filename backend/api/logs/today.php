<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/helpers.php';

$userId = verifyToken();
$db = (new Database())->getConnection();

$today = date('Y-m-d');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Get today's scheduled medications with log status
    $stmt = $db->prepare("
        SELECT s.id as schedule_id, s.time, s.meal_relation,
               m.id as medicine_id, m.name as medicine_name, m.dosage,
               l.status as log_status, l.action_time
        FROM schedules s
        JOIN medicines m ON s.medicine_id = m.id
        LEFT JOIN logs l ON l.schedule_id = s.id AND l.log_date = ?
        WHERE m.user_id = ? AND s.status = 'active'
        ORDER BY s.time ASC
    ");
    $stmt->execute([$today, $userId]);
    $todayMeds = $stmt->fetchAll();
    
    $taken = 0;
    $pending = 0;
    $skipped = 0;
    $snoozed = 0;
    
    foreach ($todayMeds as &$med) {
        $med['schedule_id'] = (int)$med['schedule_id'];
        $med['medicine_id'] = (int)$med['medicine_id'];
        $med['logged'] = $med['log_status'] ? true : false;
        
        switch ($med['log_status']) {
            case 'taken': $taken++; break;
            case 'skipped': $skipped++; break;
            case 'snoozed': $snoozed++; break;
            default: $pending++; break;
        }
    }
    
    jsonResponse([
        "date" => $today,
        "medications" => $todayMeds,
        "stats" => [
            "total" => count($todayMeds),
            "taken" => $taken,
            "pending" => $pending,
            "skipped" => $skipped,
            "snoozed" => $snoozed
        ]
    ]);
    
} else {
    jsonResponse(["error" => "Method not allowed"], 405);
}
?>
