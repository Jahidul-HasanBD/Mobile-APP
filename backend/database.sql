-- Smart Medicine Reminder Database Schema
-- Run this in phpMyAdmin or MySQL CLI

CREATE DATABASE IF NOT EXISTS medreminder;
USE medreminder;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    age INT DEFAULT NULL,
    emergency_contact VARCHAR(20) DEFAULT NULL,
    notification_reminders TINYINT(1) DEFAULT 1,
    notification_low_stock TINYINT(1) DEFAULT 1,
    notification_missed TINYINT(1) DEFAULT 1,
    notification_daily_summary TINYINT(1) DEFAULT 0,
    notification_emergency TINYINT(1) DEFAULT 0,
    reminder_sound VARCHAR(50) DEFAULT 'default_chime',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Medicines Table
CREATE TABLE IF NOT EXISTS medicines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    dosage VARCHAR(50) NOT NULL,
    instructions TEXT DEFAULT NULL,
    total_stock INT DEFAULT 0,
    current_stock INT DEFAULT 0,
    low_stock_threshold INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Schedules Table
CREATE TABLE IF NOT EXISTS schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    medicine_id INT NOT NULL,
    time TIME NOT NULL,
    meal_relation ENUM('before_meal', 'after_meal', 'no_relation') DEFAULT 'no_relation',
    repeat_type ENUM('daily', 'weekly', 'custom') DEFAULT 'daily',
    custom_days VARCHAR(50) DEFAULT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Logs Table (Compliance Tracking)
CREATE TABLE IF NOT EXISTS logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT NOT NULL,
    log_date DATE NOT NULL,
    action_time DATETIME DEFAULT NULL,
    status ENUM('taken', 'skipped', 'snoozed') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
    UNIQUE KEY unique_schedule_date (schedule_id, log_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Indexes for performance
CREATE INDEX idx_medicines_user ON medicines(user_id);
CREATE INDEX idx_schedules_medicine ON schedules(medicine_id);
CREATE INDEX idx_logs_schedule ON logs(schedule_id);
CREATE INDEX idx_logs_date ON logs(log_date);
