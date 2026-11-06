<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/helpers.php';

$userId = verifyToken();
$db = (new Database())->getConnection();

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

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $input = getInput();

    if (!isset($input['action'])) {
        jsonResponse(["error" => "Action is required (increment/decrement/set)"], 400);
    }

    $action = sanitize($input['action']);
    // Negative amounts would silently invert increment/decrement, so clamp.
    $amount = clampInt($input['amount'] ?? 1, 0, 100000, 1);

    $currentStock = (int)$medicine['current_stock'];

    switch ($action) {
        case 'increment':
            $newStock = min(100000, $currentStock + $amount);
            break;
        case 'decrement':
            $newStock = max(0, $currentStock - $amount);
            break;
        case 'set':
            $newStock = max(0, $amount);
            break;
        default:
            jsonResponse(["error" => "Invalid action"], 400);
    }

    $stmt = $db->prepare("UPDATE medicines SET current_stock = ? WHERE id = ? AND user_id = ?");
    $stmt->execute([$newStock, $medicineId, $userId]);

    $isLow = $newStock <= (int)$medicine['low_stock_threshold'];

    jsonResponse([
        "message" => "Stock updated successfully",
        "current_stock" => $newStock,
        "is_low_stock" => $isLow
    ]);

} else {
    jsonResponse(["error" => "Method not allowed"], 405);
}
?>
