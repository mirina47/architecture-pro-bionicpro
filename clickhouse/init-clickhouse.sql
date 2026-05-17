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



-- Создание целевой таблицы
CREATE TABLE IF NOT EXISTS users_ch
(
    id Int32,
    keycloakUserId String,
    email String,
    name String,
    _sign Int8,
    _version Int64
)
ENGINE = ReplacingMergeTree(_version)
ORDER BY id;

-- Таблица Kafka
CREATE TABLE IF NOT EXISTS users_kafka
(
    payload String
)
ENGINE = Kafka
SETTINGS kafka_broker_list = 'kafka:9092',
         kafka_topic_list = 'dbz.public.users',
         kafka_group_name = 'clickhouse_consumer',
         kafka_format = 'JSONAsString',
         kafka_num_consumers = 1;

-- Материализованное представление
CREATE MATERIALIZED VIEW IF NOT EXISTS users_mv TO users_ch
AS SELECT
    JSONExtractInt(payload, 'after', 'id') AS id,
    JSONExtractString(payload, 'after', 'keycloakUserId') AS keycloakUserId,
    JSONExtractString(payload, 'after', 'email') AS email,
    JSONExtractString(payload, 'after', 'name') AS name,
    multiIf(JSONExtractString(payload, 'op') = 'd', -1, 1) AS _sign,
    JSONExtractInt(payload, 'ts_ms') AS _version
FROM users_kafka
WHERE JSONExtractString(payload, 'after', 'id') IS NOT NULL;



-- Словарь
CREATE DICTIONARY IF NOT EXISTS users_dict
(
    id Int32,
    email String,
    name String
)
PRIMARY KEY id
SOURCE(CLICKHOUSE(
    HOST 'localhost'
    PORT 9000
    USER 'default'
    PASSWORD ''
    DB 'default'
    TABLE 'users_ch'
))
LIFETIME(MIN 300 MAX 360)
LAYOUT(HASHED());

--Пересоздаём витрину reports_mart 
DROP TABLE IF EXISTS reports_mart;

CREATE TABLE reports_mart
(
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
)
ENGINE = ReplacingMergeTree(etl_updated_at)
ORDER BY (user_id, report_date);

-- Материализованное представление для автоматического обновления
CREATE MATERIALIZED VIEW IF NOT EXISTS reports_mv TO reports_mart
AS
SELECT
    user_id,
    dictGetString('users_dict', 'email', toUInt32(user_id)) AS email,
    dictGetString('users_dict', 'name', toUInt32(user_id)) AS name,
    event_date AS report_date,
    count() AS total_actions,
    avg(response_time_ms) AS avg_response_ms,
    max(response_time_ms) AS max_response_ms,
    avg(battery_level) AS battery_avg_level,
    sum(is_anomaly) AS anomaly_count,
    now() AS etl_updated_at
FROM telemetry_events
GROUP BY user_id, event_date;