from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime
from clickhouse_connect import get_client
from collections import defaultdict
import psycopg2
import csv
import os
from datetime import datetime, date

def etl():
    # 1. Получаем пользователей из app_db
    conn = psycopg2.connect(
        host='app_db', port=5432,
        dbname='app_db', user='app_user', password='app_password'
    )
    cur = conn.cursor()
    cur.execute("SELECT id, email, name FROM users")
    users = cur.fetchall()
    cur.close()
    conn.close()
    print(f"Loaded {len(users)} users")

    # 2. Читаем телеметрию из CSV и агрегируем вручную
    telemetry_path = '/opt/airflow/data/telemetry.csv'
    if not os.path.exists(telemetry_path):
        raise FileNotFoundError(f"{telemetry_path} not found")

    # Словарь для агрегации: ключ (user_id, report_date) -> значения
    agg = defaultdict(lambda: {
        'total_actions': 0,
        'sum_response_ms': 0,
        'count_response_ms': 0,
        'max_response_ms': 0,
        'sum_battery': 0,
        'count_battery': 0,
        'anomaly_count': 0
    })

    with open(telemetry_path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            user_id = row['user_id']
            date = datetime.strptime(
                row['event_date'],
                '%Y-%m-%d'
            ).date()
            key = (user_id, date)
            agg[key]['total_actions'] += 1

            resp = int(row['response_time_ms'])
            agg[key]['sum_response_ms'] += resp
            agg[key]['count_response_ms'] += 1
            if resp > agg[key]['max_response_ms']:
                agg[key]['max_response_ms'] = resp

            batt = float(row['battery_level'])
            agg[key]['sum_battery'] += batt
            agg[key]['count_battery'] += 1

            if int(row['is_anomaly']) == 1:
                agg[key]['anomaly_count'] += 1

    # Формируем список для вставки
    telemetry_list = []
    for (user_id, report_date), vals in agg.items():
        avg_response_ms = vals['sum_response_ms'] / vals['count_response_ms'] if vals['count_response_ms'] else 0
        avg_battery = vals['sum_battery'] / vals['count_battery'] if vals['count_battery'] else 0
        telemetry_list.append((
            user_id,
            report_date,
            vals['total_actions'],
            round(avg_response_ms, 2),
            vals['max_response_ms'],
            round(avg_battery, 2),
            vals['anomaly_count']
        ))
    print(f"Aggregated {len(telemetry_list)} telemetry rows")

    # 3. Объединяем с пользователями (создаем словарь)
    user_dict = {str(u[0]): (u[1], u[2]) for u in users}
    rows_to_insert = []
    for (user_id, report_date, total_actions, avg_resp, max_resp, avg_batt, anomalies) in telemetry_list:
        if user_id in user_dict:
            email, name = user_dict[user_id]
            rows_to_insert.append((
                user_id, email, name, report_date,
                total_actions, avg_resp, max_resp, avg_batt, anomalies,
                datetime.now()
            ))
    print(f"Prepared {len(rows_to_insert)} rows for insert")

    if not rows_to_insert:
        print("No matching users found")
        return

    # 4. Подключение к ClickHouse и вставка
    ch = get_client(host='clickhouse', port=8123, username='default', password='default')
    # Создаем таблицу, если ее нет
    ch.command("""
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
        ORDER BY (user_id, report_date)
    """)
    # Удаляем старые данные за эти даты
    dates = set(r[3] for r in rows_to_insert)
    for d in dates:
        ch.command(f"ALTER TABLE reports_mart DELETE WHERE report_date = '{d}'")
    # Вставляем строки по одной
    for row in rows_to_insert:
        ch.insert('reports_mart', [row], column_names=[
            'user_id', 'email', 'name', 'report_date', 'total_actions',
            'avg_response_ms', 'max_response_ms', 'battery_avg_level',
            'anomaly_count', 'etl_updated_at'
        ])
    print(f"Inserted {len(rows_to_insert)} rows into reports_mart")

with DAG(
    'etl',
    schedule_interval='0 2 * * *',
    start_date=datetime(2025, 1, 1),
    catchup=False,
) as dag:
    run_etl = PythonOperator(task_id='run_etl', python_callable=etl)