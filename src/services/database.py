import sqlite3
from datetime import datetime, timedelta

DB_NAME = 'daybox.db'

def get_conn():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            priority INTEGER DEFAULT 1,       -- 0 = today, 1 = not today
            level INTEGER DEFAULT 1,          -- 1 easy, 2 moderate, 3 hard
            date TEXT NOT NULL,               -- YYYY-MM-DD this task belongs to
            done INTEGER DEFAULT 0,
            block_start TEXT,                 -- e.g. "09:00"
            block_end TEXT,                   -- e.g. "10:30"
            carried_over INTEGER DEFAULT 0,   -- was this auto-carried from a previous day
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS non_negotiables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS non_negotiable_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            non_negotiable_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            done INTEGER DEFAULT 0,
            UNIQUE(non_negotiable_id, date)
        )
    ''')
    conn.commit()
    conn.close()

# ---------- TASKS ----------

def get_tasks_for_date(date):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM tasks WHERE date = ? ORDER BY priority ASC, created_at ASC', (date,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_task(text, date, priority=1, level=1):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO tasks (text, date, priority, level)
        VALUES (?, ?, ?, ?)
    ''', (text, date, priority, level))
    conn.commit()
    task_id = cursor.lastrowid
    conn.close()
    return task_id

def update_task(task_id, fields):
    conn = get_conn()
    cursor = conn.cursor()
    allowed = ['text', 'priority', 'level', 'done', 'block_start', 'block_end', 'date']
    sets = []
    values = []
    for key in allowed:
        if key in fields:
            sets.append(f"{key} = ?")
            values.append(fields[key])
    if not sets:
        conn.close()
        return
    values.append(task_id)
    cursor.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id = ?", values)
    conn.commit()
    conn.close()

def delete_task(task_id):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
    conn.commit()
    conn.close()

def count_today_tasks(date, exclude_id=None):
    conn = get_conn()
    cursor = conn.cursor()
    if exclude_id:
        cursor.execute('SELECT COUNT(*) as c FROM tasks WHERE date = ? AND priority = 0 AND id != ?', (date, exclude_id))
    else:
        cursor.execute('SELECT COUNT(*) as c FROM tasks WHERE date = ? AND priority = 0', (date,))
    row = cursor.fetchone()
    conn.close()
    return row['c']

def carry_over_unfinished(from_date, to_date):
    """Copy unfinished priority=0 tasks from from_date to to_date, marked as carried over.
    Only runs once per to_date (checks if already carried)."""
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute('SELECT COUNT(*) as c FROM tasks WHERE date = ? AND carried_over = 1', (to_date,))
    if cursor.fetchone()['c'] > 0:
        conn.close()
        return

    cursor.execute('SELECT * FROM tasks WHERE date = ? AND done = 0', (from_date,))
    unfinished = cursor.fetchall()

    for t in unfinished:
        cursor.execute('''
            INSERT INTO tasks (text, date, priority, level, carried_over)
            VALUES (?, ?, ?, ?, 1)
        ''', (t['text'], to_date, t['priority'], t['level']))

    conn.commit()
    conn.close()

# ---------- NON-NEGOTIABLES ----------

def get_non_negotiables():
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM non_negotiables ORDER BY created_at ASC')
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_non_negotiable(text):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO non_negotiables (text) VALUES (?)', (text,))
    conn.commit()
    nid = cursor.lastrowid
    conn.close()
    return nid

def delete_non_negotiable(nid):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM non_negotiables WHERE id = ?', (nid,))
    cursor.execute('DELETE FROM non_negotiable_status WHERE non_negotiable_id = ?', (nid,))
    conn.commit()
    conn.close()

def get_non_negotiable_status(date):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT n.id, n.text,
               COALESCE(s.done, 0) as done
        FROM non_negotiables n
        LEFT JOIN non_negotiable_status s
          ON s.non_negotiable_id = n.id AND s.date = ?
        ORDER BY n.created_at ASC
    ''', (date,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def toggle_non_negotiable(nid, date, done):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO non_negotiable_status (non_negotiable_id, date, done)
        VALUES (?, ?, ?)
        ON CONFLICT(non_negotiable_id, date) DO UPDATE SET done = ?
    ''', (nid, date, done, done))
    conn.commit()
    conn.close()