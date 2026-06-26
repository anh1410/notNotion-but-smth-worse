import { useEffect, useRef, useState } from 'react';

const API = 'http://127.0.0.1:5001';

const START_HOUR = 9;
const END_HOUR = 21;
const HOUR_HEIGHT = 60;
const TOTAL_HOURS = END_HOUR - START_HOUR;

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplay(d: Date) {
  const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}

function hourLabel(h: number) {
  if (h === 0 || h === 24) return '12 AM';
  if (h === 12) return '12 PM';
  if (h > 12) return `${h - 12} PM`;
  return `${h} AM`;
}

function minutesToTimeStr(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeStrToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function isSameDate(d: Date, dateStr: string) {
  return formatDate(d) === dateStr;
}

export default function HomeScreen() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 5, 26));
  const [tasks, setTasks] = useState<any[]>([]);
  const [nonNegotiables, setNonNegotiables] = useState<any[]>([]);
  const [newTask, setNewTask] = useState('');
  const [newNN, setNewNN] = useState('');
  const [showNNInput, setShowNNInput] = useState(false);
  const [limitError, setLimitError] = useState('');
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [now, setNow] = useState(new Date());
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  const timelineRef = useRef<HTMLDivElement>(null);

  const dateStr = formatDate(currentDate);

  useEffect(() => { loadAll(); }, [dateStr]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const loadAll = async () => {
    try {
      const [tRes, nRes] = await Promise.all([
        fetch(`${API}/tasks?date=${dateStr}`),
        fetch(`${API}/non-negotiables?date=${dateStr}`)
      ]);
      setTasks(await tRes.json());
      setNonNegotiables(await nRes.json());
    } catch (e) { console.error(e); }
  };

  const goPrevDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const goNextDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date(2026, 5, 26));

  const addTask = async () => {
    if (!newTask.trim()) return;
    try {
      const res = await fetch(`${API}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newTask, date: dateStr, priority: 1, level: 1 })
      });
      const data = await res.json();
      if (!res.ok) {
        setLimitError(data.message || 'Could not add task');
        return;
      }
      setNewTask('');
      loadAll();
    } catch (e) { console.error(e); }
  };

  const updateTask = async (taskId: number, fields: any) => {
    try {
      const res = await fetch(`${API}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, date: dateStr })
      });
      const data = await res.json();
      if (!res.ok && data.error === 'limit_reached') {
        setShowLimitModal(true);
        return;
      }
      loadAll();
    } catch (e) { console.error(e); }
  };

  const deleteTask = async (taskId: number) => {
    try {
      await fetch(`${API}/tasks/${taskId}`, { method: 'DELETE' });
      loadAll();
    } catch (e) { console.error(e); }
  };

  const triggerCelebration = () => {
    setCelebrating(true);
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.setValueAtTime(600, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.2);
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.start(); o.stop(ctx.currentTime + 0.4);
    } catch (e) {}
    setTimeout(() => setCelebrating(false), 1600);
  };

  const toggleDone = async (task: any) => {
    await updateTask(task.id, { done: task.done ? 0 : 1 });
    if (!task.done) triggerCelebration();
  };

  const addNonNegotiable = async () => {
    if (!newNN.trim()) return;
    try {
      await fetch(`${API}/non-negotiables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newNN })
      });
      setNewNN('');
      setShowNNInput(false);
      loadAll();
    } catch (e) { console.error(e); }
  };

  const toggleNonNegotiable = async (nn: any) => {
    try {
      await fetch(`${API}/non-negotiables/${nn.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, done: nn.done ? 0 : 1 })
      });
      loadAll();
    } catch (e) { console.error(e); }
  };

  // ---- DRAG AND DROP ONTO TIMELINE ----
  const handleDragStart = (taskId: number) => setDraggingTaskId(taskId);
  const handleDragEnd = () => setDraggingTaskId(null);

  const handleTimelineDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggingTaskId === null || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const totalMinutesFromStart = (y / HOUR_HEIGHT) * 60;
    const snapped = Math.round(totalMinutesFromStart / 15) * 15;
    const startMinutes = START_HOUR * 60 + snapped;
    const endMinutes = startMinutes + 60;

    const clampedStart = Math.max(START_HOUR * 60, Math.min(startMinutes, END_HOUR * 60 - 30));
    const clampedEnd = Math.min(END_HOUR * 60, clampedStart + 60);

    updateTask(draggingTaskId, {
      block_start: minutesToTimeStr(clampedStart),
      block_end: minutesToTimeStr(clampedEnd),
      priority: 0
    });
    setDraggingTaskId(null);
  };

  const handleTimelineDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeFromTimeline = (taskId: number) => {
    updateTask(taskId, { block_start: null, block_end: null });
  };

  const openTimeEditor = (task: any) => {
    setEditingBlockId(task.id);
    setEditStart(task.block_start);
    setEditEnd(task.block_end);
  };

  const saveTimeEdit = () => {
    if (editingBlockId === null) return;
    if (timeStrToMinutes(editEnd) <= timeStrToMinutes(editStart)) {
      setLimitError('End time must be after start time');
      return;
    }
    updateTask(editingBlockId, { block_start: editStart, block_end: editEnd });
    setEditingBlockId(null);
  };

  const cancelTimeEdit = () => setEditingBlockId(null);

  const todayTasks = tasks.filter(t => t.priority === 0);
  const laterTasks = tasks.filter(t => t.priority === 1);
  const blockedTasks = tasks.filter(t => t.block_start && t.block_end);
  const unblockedTodayTasks = todayTasks.filter(t => !t.block_start);

  const currentMinutesNow = now.getHours() * 60 + now.getMinutes();
  const showNowLine = isSameDate(now, dateStr) && currentMinutesNow >= START_HOUR * 60 && currentMinutesNow <= END_HOUR * 60;
  const nowLineTop = ((currentMinutesNow - START_HOUR * 60) / 60) * HOUR_HEIGHT;

  const styles: Record<string, React.CSSProperties> = {
    app: {
      minHeight: '100vh',
      background: '#25344F',
      backgroundImage: 'radial-gradient(circle, #344865 1px, transparent 1px)',
      backgroundSize: '16px 16px',
      fontFamily: "'VT323', monospace",
      color: '#D5B893',
      padding: '24px',
      boxSizing: 'border-box' as const,
    },
    container: {
      maxWidth: 1180,
      margin: '0 auto',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: '#6F4D38',
      border: '3px solid #000000',
      outline: '2px solid #ffffff',
      outlineOffset: '-7px',
      padding: '14px 20px',
      marginBottom: 20,
      boxShadow: '5px 5px 0 #000000',
    },
    navBtn: {
      background: '#D5B893',
      border: '2px solid #000000',
      color: '#25344F',
      fontFamily: "'VT323', monospace",
      fontWeight: 'bold' as const,
      fontSize: 20,
      padding: '4px 14px',
      cursor: 'pointer',
    },
    dateText: {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: 18,
      color: '#D5B893',
      letterSpacing: '1px',
      textShadow: '2px 2px #4a3325',
    },
    todayBtn: {
      background: 'transparent',
      border: '1px solid #617891',
      color: '#617891',
      fontFamily: "'VT323', monospace",
      fontSize: 14,
      padding: '4px 10px',
      cursor: 'pointer',
      marginLeft: 10,
    },

    mainLayout: {
      display: 'flex',
      gap: 20,
      alignItems: 'flex-start',
    },
    leftCol: {
      flex: '0 0 420px',
      minWidth: 0,
    },
    rightCol: {
      flex: 1,
      minWidth: 0,
    },

    section: {
      background: '#6F4D38',
      border: '2px solid #000000',
      outline: '1px solid #ffffff',
      outlineOffset: '-5px',
      padding: 16,
      marginBottom: 20,
    },
    sectionTitle: {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: 13,
      color: '#D5B893',
      marginBottom: 12,
      letterSpacing: '1px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    leopardBadge: {
      width: 14,
      height: 14,
      borderRadius: '50%',
      backgroundImage: "radial-gradient(circle at 30% 30%, #2a1505 0 3px, transparent 3px), radial-gradient(circle at 70% 60%, #2a1505 0 2.5px, transparent 2.5px), radial-gradient(circle at 50% 80%, #8a5a23 0 2px, transparent 2px)",
      backgroundColor: '#D5B893',
      display: 'inline-block',
      marginRight: 8,
      flexShrink: 0,
    },

    nnRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 0',
      borderBottom: '1px dashed #8a6b50',
    },
    nnCheck: {
      width: 22,
      height: 22,
      border: '2px solid #617891',
      cursor: 'pointer',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      color: '#617891',
    },
    nnText: {
      fontSize: 18,
      flex: 1,
      color: '#ECE0CE',
    },
    addNNBtn: {
      background: 'transparent',
      border: '1px dashed #D5B893',
      color: '#D5B893',
      fontFamily: "'VT323', monospace",
      fontSize: 14,
      padding: '3px 10px',
      cursor: 'pointer',
    },
    nnInputRow: {
      display: 'flex',
      gap: 8,
      marginTop: 8,
    },
    inputBase: {
      background: '#4a3325',
      border: '1px solid #000000',
      color: '#ECE0CE',
      fontFamily: "'VT323', monospace",
      fontSize: 17,
      padding: '6px 10px',
      outline: 'none',
    },

    brainDumpRow: {
      display: 'flex',
      gap: 8,
      marginBottom: 16,
    },
    addBtn: {
      background: '#D5B893',
      border: '2px solid #000000',
      color: '#25344F',
      fontFamily: "'Press Start 2P', monospace",
      fontSize: 12,
      padding: '8px 16px',
      cursor: 'pointer',
      whiteSpace: 'nowrap' as const,
    },

    limitBanner: {
      background: '#4a3325',
      border: '2px solid #632024',
      color: '#e8b8b0',
      fontSize: 15,
      padding: '8px 12px',
      marginBottom: 12,
    },

    taskGroupTitle: {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: 11,
      color: '#D5B893',
      letterSpacing: '1px',
      margin: '14px 0 8px',
    },

    taskRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 10px',
      marginBottom: 8,
      background: '#4a3325',
      border: '1px solid #000000',
      cursor: 'grab',
    },
    taskRowDragging: {
      opacity: 0.4,
    },
    taskCheck: {
      width: 22,
      height: 22,
      border: '2px solid #D5B893',
      cursor: 'pointer',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      color: '#D5B893',
    },
    taskText: {
      fontSize: 17,
      flex: 1,
      color: '#ECE0CE',
    },
    taskTextDone: {
      textDecoration: 'line-through',
      opacity: 0.5,
    },
    toggleGroup: {
      display: 'flex',
      gap: 3,
    },
    priorityBtn: {
      fontSize: 11,
      padding: '3px 7px',
      border: '1px solid #D5B893',
      background: 'transparent',
      color: '#D5B893',
      cursor: 'pointer',
      fontFamily: "'VT323', monospace",
    },
    priorityBtnActive: {
      background: '#D5B893',
      color: '#25344F',
    },
    levelBtn: {
      width: 24,
      height: 24,
      border: '1px solid #617891',
      background: 'transparent',
      color: '#617891',
      cursor: 'pointer',
      fontFamily: "'VT323', monospace",
      fontSize: 13,
    },
    levelBtnActive: {
      background: '#617891',
      color: '#ECE0CE',
    },
    deleteBtn: {
      background: 'transparent',
      border: 'none',
      color: '#a8474b',
      cursor: 'pointer',
      fontSize: 17,
      padding: '0 2px',
    },
    dragHint: {
      fontSize: 12,
      color: '#b09878',
      fontStyle: 'italic' as const,
    },

    emptyMsg: {
      fontSize: 15,
      color: '#b09878',
      textAlign: 'center' as const,
      padding: '12px 0',
    },

    modalOverlay: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(20, 25, 35, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 500,
    },
    modalCard: {
      background: '#6F4D38',
      border: '3px solid #000000',
      outline: '2px solid #ffffff',
      outlineOffset: '-7px',
      padding: 20,
      width: 400,
      maxWidth: '90vw',
      boxShadow: '6px 6px 0 #000000',
    },
    modalTitle: {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: 14,
      color: '#D5B893',
      marginBottom: 14,
    },
    modalText: {
      fontSize: 16,
      marginBottom: 16,
      lineHeight: 1.5,
      color: '#ECE0CE',
    },
    modalBtn: {
      background: '#D5B893',
      border: '2px solid #000000',
      color: '#25344F',
      fontFamily: "'VT323', monospace",
      fontSize: 15,
      padding: '6px 16px',
      cursor: 'pointer',
    },

    // ---- TIMELINE (calendar-style) ----
    timelineCard: {
      background: '#ffffff',
      border: '3px solid #000000',
      outline: '2px solid #ffffff',
      outlineOffset: '-7px',
      boxShadow: '5px 5px 0 #000000',
      overflow: 'hidden',
    },
    timelineHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 16px',
      borderBottom: '2px solid #e0e0e0',
      background: '#f4efe6',
    },
    timelineHeaderDay: {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: 10,
      color: '#25344F',
    },
    timelineHeaderDate: {
      width: 36,
      height: 36,
      borderRadius: '50%',
      background: '#25344F',
      color: '#D5B893',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'VT323', monospace",
      fontSize: 18,
      fontWeight: 'bold' as const,
    },
    timelineBody: {
      position: 'relative' as const,
      display: 'flex',
    },
    timelineLabels: {
      width: 64,
      flexShrink: 0,
      borderRight: '1px solid #e0e0e0',
    },
    hourLabelCell: {
      height: HOUR_HEIGHT,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'flex-end',
      paddingRight: 8,
      paddingTop: 2,
      fontSize: 13,
      color: '#666',
      fontFamily: 'Arial, sans-serif',
      boxSizing: 'border-box' as const,
    },
    timelineGrid: {
      position: 'relative' as const,
      flex: 1,
    },
    hourGridLine: {
      height: HOUR_HEIGHT,
      borderBottom: '1px solid #ebebeb',
      boxSizing: 'border-box' as const,
    },
    nowLine: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      height: 2,
      background: '#632024',
      zIndex: 5,
    },
    nowDot: {
      position: 'absolute' as const,
      left: -5,
      top: -4,
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: '#632024',
    },
    timeBlock: {
      position: 'absolute' as const,
      left: 6,
      right: 6,
      background: '#FBD3DE',
      border: '2px solid #000000',
      outline: '1px solid #ffffff',
      outlineOffset: '-4px',
      borderRadius: 4,
      padding: '4px 8px',
      boxSizing: 'border-box' as const,
      overflow: 'hidden',
      zIndex: 2,
      cursor: 'pointer',
    },
    timeBlockDone: {
      background: '#d9b3bc',
      opacity: 0.7,
    },
    timeBlockText: {
      fontSize: 15,
      color: '#3a1420',
      fontFamily: "'VT323', monospace",
      fontWeight: 'bold' as const,
      whiteSpace: 'nowrap' as const,
      overflow: 'hidden',
      textOverflow: 'ellipsis' as const,
    },
    timeBlockTime: {
      fontSize: 12,
      color: '#5a2030',
      fontFamily: 'Arial, sans-serif',
      cursor: 'pointer',
    },
    editHint: {
      fontSize: 10,
      opacity: 0.8,
    },
    timeEditRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 3,
      marginTop: 2,
    },
    timeEditInput: {
      fontSize: 11,
      fontFamily: 'Arial, sans-serif',
      padding: '1px 2px',
      border: '1px solid #25344F',
      borderRadius: 3,
      width: 62,
      background: '#fff',
      color: '#25344F',
    },
    timeEditDash: {
      fontSize: 10,
      color: '#ECE0CE',
    },
    timeEditSave: {
      background: '#617891',
      border: '1px solid #25344F',
      color: '#fff',
      fontSize: 10,
      cursor: 'pointer',
      padding: '1px 4px',
      borderRadius: 3,
    },
    timeEditCancel: {
      background: '#632024',
      border: '1px solid #25344F',
      color: '#fff',
      fontSize: 10,
      cursor: 'pointer',
      padding: '1px 4px',
      borderRadius: 3,
    },
    timeBlockRemove: {
      position: 'absolute' as const,
      top: 2,
      right: 4,
      color: '#a8404f',
      fontSize: 13,
      cursor: 'pointer',
      background: 'transparent',
      border: 'none',
      fontWeight: 'bold' as const,
    },

    flameOverlay: {
      position: 'fixed' as const,
      inset: 0,
      zIndex: 1000,
      pointerEvents: 'none' as const,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 80,
      animation: 'flameburst 1.6s ease-out forwards',
    },
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=VT323&family=Press+Start+2P&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes flameburst {
          0% { opacity: 0; transform: scale(0.3); }
          15% { opacity: 1; transform: scale(1.1); }
          30% { transform: scale(1); }
          80% { opacity: 1; }
          100% { opacity: 0; transform: scale(1.3); }
        }
        .flame-bg {
          position: fixed; inset: 0; z-index: 999; pointer-events: none;
          background: radial-gradient(circle, rgba(217,161,74,0.5), rgba(227,93,30,0.3), transparent 70%);
          animation: flameburst 1.6s ease-out forwards;
        }
      `}</style>

      {celebrating && (
        <>
          <div className="flame-bg" />
          <div style={styles.flameOverlay}>🔥✨🔥</div>
        </>
      )}

      <div style={styles.app}>
        <div style={styles.container}>

          {/* HEADER / DATE NAV */}
          <div style={styles.header}>
            <button style={styles.navBtn} onClick={goPrevDay}>◀</button>
            <div style={{ textAlign: 'center' as const }}>
              <div style={styles.dateText}>{formatDisplay(currentDate)}</div>
              <button style={styles.todayBtn} onClick={goToday}>jump to today</button>
            </div>
            <button style={styles.navBtn} onClick={goNextDay}>▶</button>
          </div>

          <div style={styles.mainLayout}>
            {/* LEFT COLUMN - tasks */}
            <div style={styles.leftCol}>

              {/* NON-NEGOTIABLES */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>
                  <span><span style={styles.leopardBadge} /> non-negotiables</span>
                  <button style={styles.addNNBtn} onClick={() => setShowNNInput(!showNNInput)}>+ add</button>
                </div>
                {nonNegotiables.length === 0 ? (
                  <div style={styles.emptyMsg}>nothing set yet ✦ add things you do every day</div>
                ) : (
                  nonNegotiables.map(nn => (
                    <div key={nn.id} style={styles.nnRow}>
                      <div style={styles.nnCheck} onClick={() => toggleNonNegotiable(nn)}>
                        {nn.done ? '✓' : ''}
                      </div>
                      <span style={{ ...styles.nnText, ...(nn.done ? styles.taskTextDone : {}) }}>{nn.text}</span>
                    </div>
                  ))
                )}
                {showNNInput && (
                  <div style={styles.nnInputRow}>
                    <input
                      style={{ ...styles.inputBase, flex: 1 }}
                      placeholder="e.g. workout, journal..."
                      value={newNN}
                      onChange={e => setNewNN(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addNonNegotiable()}
                    />
                    <button style={styles.addBtn} onClick={addNonNegotiable}>add</button>
                  </div>
                )}
              </div>

              {/* BRAIN DUMP */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>
                  <span><span style={styles.leopardBadge} /> brain dump</span>
                </div>
                {limitError && (
                  <div style={styles.limitBanner}>
                    ⚠ {limitError}
                    <button style={{ ...styles.deleteBtn, marginLeft: 10 }} onClick={() => setLimitError('')}>✕</button>
                  </div>
                )}
                <div style={styles.brainDumpRow}>
                  <input
                    style={{ ...styles.inputBase, flex: 1 }}
                    placeholder="i need to..."
                    value={newTask}
                    onChange={e => setNewTask(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addTask()}
                  />
                  <button style={styles.addBtn} onClick={addTask}>+ add</button>
                </div>

                <div style={styles.taskGroupTitle}>today ({todayTasks.length}/5)</div>
                <div style={styles.dragHint}>drag a task onto the timeline →</div>
                {unblockedTodayTasks.length === 0 ? (
                  <div style={styles.emptyMsg}>{todayTasks.length === 0 ? 'no tasks marked for today yet' : 'all today tasks are on the timeline'}</div>
                ) : (
                  unblockedTodayTasks.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      styles={styles}
                      onToggleDone={toggleDone}
                      onUpdate={updateTask}
                      onDelete={deleteTask}
                      draggable
                      onDragStart={() => handleDragStart(task.id)}
                      onDragEnd={handleDragEnd}
                      isDragging={draggingTaskId === task.id}
                    />
                  ))
                )}

                <div style={styles.taskGroupTitle}>not today</div>
                {laterTasks.length === 0 ? (
                  <div style={styles.emptyMsg}>nothing postponed</div>
                ) : (
                  laterTasks.map(task => (
                    <TaskRow key={task.id} task={task} styles={styles} onToggleDone={toggleDone} onUpdate={updateTask} onDelete={deleteTask} />
                  ))
                )}
              </div>
            </div>

            {/* RIGHT COLUMN - timeline */}
            <div style={styles.rightCol}>
              <div style={styles.timelineCard}>
                <div style={styles.timelineHeader}>
                  <div style={styles.timelineHeaderDate}>{currentDate.getDate()}</div>
                  <div style={styles.timelineHeaderDay}>{['SUN','MON','TUE','WED','THU','FRI','SAT'][currentDate.getDay()]}</div>
                </div>
                <div style={styles.timelineBody}>
                  <div style={styles.timelineLabels}>
                    {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => (
                      <div key={i} style={styles.hourLabelCell}>{hourLabel(START_HOUR + i)}</div>
                    ))}
                  </div>
                  <div
                    ref={timelineRef}
                    style={{ ...styles.timelineGrid, height: TOTAL_HOURS * HOUR_HEIGHT }}
                    onDrop={handleTimelineDrop}
                    onDragOver={handleTimelineDragOver}
                  >
                    {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
                      <div key={i} style={styles.hourGridLine} />
                    ))}

                    {showNowLine && (
                      <div style={{ ...styles.nowLine, top: nowLineTop }}>
                        <div style={styles.nowDot} />
                      </div>
                    )}

                    {blockedTasks.map(task => {
                      const startMin = timeStrToMinutes(task.block_start) - START_HOUR * 60;
                      const endMin = timeStrToMinutes(task.block_end) - START_HOUR * 60;
                      const top = (startMin / 60) * HOUR_HEIGHT;
                      const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 24);
                      return (
                        <div
                          key={task.id}
                          style={{
                            ...styles.timeBlock,
                            ...(task.done ? styles.timeBlockDone : {}),
                            top,
                            height,
                          }}
                          draggable
                          onDragStart={() => handleDragStart(task.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => toggleDone(task)}
                        >
                          <button
                            style={styles.timeBlockRemove}
                            onClick={(e) => { e.stopPropagation(); removeFromTimeline(task.id); }}
                          >✕</button>
                          <div style={{ ...styles.timeBlockText, ...(task.done ? styles.taskTextDone : {}) }}>{task.text}</div>
                          {editingBlockId === task.id ? (
                            <div style={styles.timeEditRow} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="time"
                                value={editStart}
                                onChange={e => setEditStart(e.target.value)}
                                style={styles.timeEditInput}
                              />
                              <span style={styles.timeEditDash}>–</span>
                              <input
                                type="time"
                                value={editEnd}
                                onChange={e => setEditEnd(e.target.value)}
                                style={styles.timeEditInput}
                              />
                              <button style={styles.timeEditSave} onClick={saveTimeEdit}>✓</button>
                              <button style={styles.timeEditCancel} onClick={cancelTimeEdit}>✕</button>
                            </div>
                          ) : (
                            <div
                              style={styles.timeBlockTime}
                              onClick={(e) => { e.stopPropagation(); openTimeEditor(task); }}
                            >
                              {task.block_start}–{task.block_end} <span style={styles.editHint}>✎</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>


      {showLimitModal && (
        <div style={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowLimitModal(false); }}>
          <div style={styles.modalCard}>
            <div style={styles.modalTitle}>✦ 5-task limit reached</div>
            <div style={styles.modalText}>
              You already have 5 tasks marked for today. Mark one of them as "not today" first, then try again.
            </div>
            <button style={styles.modalBtn} onClick={() => setShowLimitModal(false)}>got it</button>
          </div>
        </div>
      )}
    </>
  );
}

function TaskRow({ task, styles, onToggleDone, onUpdate, onDelete, draggable, onDragStart, onDragEnd, isDragging }: any) {
  return (
    <div
      style={{ ...styles.taskRow, ...(isDragging ? styles.taskRowDragging : {}) }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div style={styles.taskCheck} onClick={() => onToggleDone(task)}>
        {task.done ? '✓' : ''}
      </div>
      <span style={{ ...styles.taskText, ...(task.done ? styles.taskTextDone : {}) }}>{task.text}</span>

      <div style={styles.toggleGroup}>
        <button
          style={{ ...styles.priorityBtn, ...(task.priority === 0 ? styles.priorityBtnActive : {}) }}
          onClick={() => onUpdate(task.id, { priority: 0 })}
        >
          today
        </button>
        <button
          style={{ ...styles.priorityBtn, ...(task.priority === 1 ? styles.priorityBtnActive : {}) }}
          onClick={() => onUpdate(task.id, { priority: 1 })}
        >
          later
        </button>
      </div>

      <div style={styles.toggleGroup}>
        {[1, 2, 3].map(lvl => (
          <button
            key={lvl}
            style={{ ...styles.levelBtn, ...(task.level === lvl ? styles.levelBtnActive : {}) }}
            onClick={() => onUpdate(task.id, { level: lvl })}
            title={lvl === 1 ? 'easy' : lvl === 2 ? 'moderate' : 'long & hard'}
          >
            {lvl}
          </button>
        ))}
      </div>

      <button style={styles.deleteBtn} onClick={() => onDelete(task.id)}>✕</button>
    </div>
  );
}