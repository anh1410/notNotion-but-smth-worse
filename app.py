from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
from src.services.database import (
    init_db, get_tasks_for_date, add_task, update_task, delete_task,
    count_today_tasks, carry_over_unfinished,
    get_non_negotiables, add_non_negotiable, delete_non_negotiable,
    get_non_negotiable_status, toggle_non_negotiable
)

app = Flask(__name__)
CORS(app, resources={r"/*": {
    "origins": "*",
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"]
}})

init_db()


def prev_date(date_str):
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return (d - timedelta(days=1)).strftime("%Y-%m-%d")


@app.route('/tasks', methods=['GET'])
def get_tasks():
    date = request.args.get('date')
    if not date:
        return jsonify({'error': 'date is required'}), 400

    # auto carry-over unfinished tasks from the day before, once
    carry_over_unfinished(prev_date(date), date)

    tasks = get_tasks_for_date(date)
    return jsonify(tasks)


@app.route('/tasks', methods=['POST'])
def create_task():
    data = request.json
    text = data.get('text', '').strip()
    date = data.get('date')
    priority = data.get('priority', 1)
    level = data.get('level', 1)

    if not text or not date:
        return jsonify({'error': 'text and date are required'}), 400

    # enforce max 5 "today" tasks
    if priority == 0:
        current_count = count_today_tasks(date)
        if current_count >= 5:
            return jsonify({
                'error': 'limit_reached',
                'message': 'You already have 5 tasks for today. Mark one as Not Today first.'
            }), 409

    task_id = add_task(text, date, priority, level)
    return jsonify({'id': task_id, 'message': 'Task added'})


@app.route('/tasks/<int:task_id>', methods=['PUT'])
def edit_task(task_id):
    data = request.json

    # if changing priority to 0 (today), enforce the limit
    if data.get('priority') == 0 and 'date' not in data:
        # need the date of the task to check the count properly
        pass

    if data.get('priority') == 0:
        date = data.get('date')
        if date:
            current_count = count_today_tasks(date, exclude_id=task_id)
            if current_count >= 5:
                return jsonify({
                    'error': 'limit_reached',
                    'message': 'You already have 5 tasks for today. Mark one as Not Today first.'
                }), 409

    update_task(task_id, data)
    return jsonify({'message': 'Task updated'})


@app.route('/tasks/<int:task_id>', methods=['DELETE'])
def remove_task(task_id):
    delete_task(task_id)
    return jsonify({'message': 'Task deleted'})


@app.route('/non-negotiables', methods=['GET'])
def list_non_negotiables():
    date = request.args.get('date')
    if date:
        return jsonify(get_non_negotiable_status(date))
    return jsonify(get_non_negotiables())


@app.route('/non-negotiables', methods=['POST'])
def create_non_negotiable():
    data = request.json
    text = data.get('text', '').strip()
    if not text:
        return jsonify({'error': 'text is required'}), 400
    nid = add_non_negotiable(text)
    return jsonify({'id': nid, 'message': 'Non-negotiable added'})


@app.route('/non-negotiables/<int:nid>', methods=['DELETE'])
def remove_non_negotiable(nid):
    delete_non_negotiable(nid)
    return jsonify({'message': 'Non-negotiable deleted'})


@app.route('/non-negotiables/<int:nid>/toggle', methods=['POST'])
def toggle_non_negotiable_route(nid):
    data = request.json
    date = data.get('date')
    done = data.get('done', 0)
    if not date:
        return jsonify({'error': 'date is required'}), 400
    toggle_non_negotiable(nid, date, done)
    return jsonify({'message': 'toggled'})


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'running'})


if __name__ == '__main__':
    app.run(debug=True, port=5001)