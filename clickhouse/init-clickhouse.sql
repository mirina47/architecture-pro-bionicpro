-- Таблица для сырых событий телеметрии (пример)
CREATE TABLE IF NOT EXISTS telemetry_events (
    event_id UUID,
    user_id String,
    event_type String,
    event_date Date,
    recorded_at DateTime,
    response_time_ms UInt32,
    battery_level Float32,
    is_anomaly UInt8
) ENGINE = MergeTree()
ORDER BY (user_id, event_date);

-- Витрина: агрегат по пользователям и дате
CREATE TABLE IF NOT EXISTS reports_mart (
    user_id String,
    email String,
    name String,
    report_date Date,
    total_actions UInt32,
    avg_response_ms Float32,
    max_response_ms UInt32,
    battery_avg_level Float32,
    anomaly_count UInt32,
    etl_updated_at DateTime
) ENGINE = ReplacingMergeTree(etl_updated_at)
ORDER BY (user_id, report_date);