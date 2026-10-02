USE urja_mitra;

CREATE TABLE IF NOT EXISTS appliances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    appliance_name VARCHAR(100) NOT NULL,
    power_consumption DECIMAL(10,2) NOT NULL,
    priority ENUM('High', 'Medium', 'Low') DEFAULT 'Medium',
    flexible BOOLEAN DEFAULT TRUE,
    preferred_start TIME,
    preferred_end TIME,
    duration_minutes INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    appliance_id INT NOT NULL,
    scheduled_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    renewable_available DECIMAL(10,2) NOT NULL,
    estimated_grid_usage DECIMAL(10,2) DEFAULT 0,
    optimization_score DECIMAL(5,2),
    reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (appliance_id) REFERENCES appliances(id)
);

CREATE TABLE IF NOT EXISTS energy_alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL,
    alert_message VARCHAR(255) NOT NULL,
    alert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    severity ENUM('Info', 'Warning', 'Critical') DEFAULT 'Info',
    is_resolved BOOLEAN DEFAULT FALSE
);

INSERT INTO energy_generation
(reading_date, reading_time, renewable_generation, energy_consumption, grid_import)
VALUES
(CURDATE(), '06:00:00', 0.80, 1.40, 0.60),
(CURDATE(), '07:00:00', 1.20, 1.80, 0.60),
(CURDATE(), '08:00:00', 1.80, 2.20, 0.40),
(CURDATE(), '09:00:00', 2.60, 2.40, 0.00),
(CURDATE(), '10:00:00', 3.60, 2.70, 0.00),
(CURDATE(), '11:00:00', 4.50, 2.90, 0.00),
(CURDATE(), '12:00:00', 5.40, 3.10, 0.00),
(CURDATE(), '13:00:00', 5.60, 3.30, 0.00),
(CURDATE(), '14:00:00', 5.20, 3.40, 0.00),
(CURDATE(), '15:00:00', 4.60, 3.20, 0.00),
(CURDATE(), '16:00:00', 3.70, 2.90, 0.00),
(CURDATE(), '17:00:00', 2.50, 3.00, 0.50),
(CURDATE(), '18:00:00', 1.40, 3.20, 1.80),
(CURDATE(), '19:00:00', 0.80, 3.40, 2.60),
(CURDATE(), '20:00:00', 0.50, 3.20, 2.70),
(CURDATE(), '21:00:00', 0.30, 2.80, 2.50);

INSERT INTO appliances
(appliance_name, power_consumption, priority, flexible,
 preferred_start, preferred_end, duration_minutes)
VALUES
('Washing Machine', 0.50, 'Medium', TRUE, '09:00:00', '17:00:00', 60),
('Water Pump', 0.75, 'High', TRUE, '08:00:00', '16:00:00', 45),
('Dishwasher', 1.20, 'Medium', TRUE, '10:00:00', '16:00:00', 90),
('Electric Vehicle Charging', 3.50, 'High', TRUE, '10:00:00', '18:00:00', 120),
('Water Heater', 2.00, 'High', TRUE, '09:00:00', '15:00:00', 60),
('Refrigerator', 0.15, 'High', FALSE, '00:00:00', '23:59:00', 1440);

INSERT INTO energy_alerts
(alert_type, alert_message, severity)
VALUES
(
    'Renewable Surplus',
    'High renewable generation is available between 11:00 AM and 3:00 PM.',
    'Info'
),
(
    'Energy Waste',
    'Renewable energy may remain unused during the afternoon peak generation period.',
    'Warning'
);

SHOW TABLES;
ALTER USER 'root'@'localhost' IDENTIFIED BY 'Advait@2007';
FLUSH PRIVILEGES;
