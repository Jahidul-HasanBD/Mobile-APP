<?php
class Database {
    private $host;
    private $db_name;
    private $username;
    private $password;
    private $conn;

    public function __construct() {
        // Credentials can be overridden per machine (see README/CAPACITOR-SETUP.md)
        // without editing code, e.g. set MEDREMIND_DB_PASSWORD in the Apache env.
        $this->host = getenv("MEDREMIND_DB_HOST") ?: "localhost";
        $this->db_name = getenv("MEDREMIND_DB_NAME") ?: "medreminder";
        $this->username = getenv("MEDREMIND_DB_USER") ?: "root";
        $this->password = getenv("MEDREMIND_DB_PASSWORD") !== false ? getenv("MEDREMIND_DB_PASSWORD") : "";
    }

    public function getConnection() {
        $this->conn = null;
        try {
            $this->conn = new PDO(
                "mysql:host=" . $this->host . ";dbname=" . $this->db_name . ";charset=utf8mb4",
                $this->username,
                $this->password,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false
                ]
            );
        } catch (PDOException $exception) {
            // Never echo driver messages: they contain the DB user, host and
            // table details. Log locally and answer with a generic error.
            error_log("MedRemind database connection failed: " . $exception->getMessage());
            http_response_code(500);
            header("Content-Type: application/json; charset=UTF-8");
            echo json_encode(["error" => "Database unavailable. Please try again later."]);
            exit;
        }
        return $this->conn;
    }
}
?>
