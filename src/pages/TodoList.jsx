import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

const PRIORITIES = [
  { value: 'low', label: 'Low', color: '#6b7280' },
  { value: 'medium', label: 'Medium', color: '#d97706' },
  { value: 'high', label: 'High', color: '#dc2626' },
];

const FILTERS = ['all', 'active', 'completed'];

function getStorageKey(user) {
  return `ncba_todos_${user?.id || user?.userId || 'guest'}`;
}

function loadTodos(user) {
  try {
    const raw = localStorage.getItem(getStorageKey(user));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTodos(user, todos) {
  localStorage.setItem(getStorageKey(user), JSON.stringify(todos));
}

function TodoForm({ todo, onSave, onCancel }) {
  const [form, setForm] = useState({
    text: todo?.text || '',
    priority: todo?.priority || 'medium',
    dueDate: todo?.dueDate || '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.text.trim()) return;
    onSave({ ...form, text: form.text.trim() });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-group full-width">
          <label>Task Description *</label>
          <input type="text" name="text" value={form.text} onChange={handleChange}
            placeholder="e.g. Complete assignment for Data Structures" required autoFocus />
        </div>
        <div className="form-group">
          <label>Priority</label>
          <select name="priority" value={form.priority} onChange={handleChange}>
            {PRIORITIES.map(p => (<option key={p.value} value={p.value}>{p.label}</option>))}
          </select>
        </div>
        <div className="form-group">
          <label>Due Date</label>
          <input type="date" name="dueDate" value={form.dueDate} onChange={handleChange} />
        </div>
      </div>
      <div className="modal-footer" style={{ padding: '16px 0 0', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">
          <Icon name={todo ? 'edit' : 'plus'} size={16} style={{ marginRight: '6px' }} />
          {todo ? 'Update Task' : 'Add Task'}
        </button>
      </div>
    </form>
  );
}

function TodoList() {
  const { currentUser } = useAuth();
  const [todos, setTodos] = useState(() => loadTodos(currentUser));
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [deletingTodo, setDeletingTodo] = useState(null);

  const prevLoadedRef = useRef(false);
  const prevUserKey = useRef(getStorageKey(currentUser));
  // Autosave only after the initial data has been loaded, and only when the
  // storage key (user identity) is unchanged. This prevents an empty todo array
  // or a mismatch in the user id from wiping out previously saved todos.
  useEffect(() => { prevLoadedRef.current = true; }, []);
  useEffect(() => {
    const userKey = getStorageKey(currentUser);
    if (prevUserKey.current !== userKey) {
      // The signed-in user changed -> reload that user's todos instead of keeping stale state.
      setTodos(loadTodos(currentUser));
      prevUserKey.current = userKey;
      return;
    }
    if (prevLoadedRef.current) saveTodos(currentUser, todos);
  }, [todos, currentUser]);

  const addTodo = (data) => {
    setTodos(prev => [{ id: Date.now(), text: data.text, priority: data.priority,
      dueDate: data.dueDate, completed: false, createdAt: new Date().toISOString() }, ...prev]);
    setShowModal(false);
  };
  const updateTodo = (data) => {
    setTodos(prev => prev.map(t => t.id === editingTodo.id
      ? { ...t, text: data.text, priority: data.priority, dueDate: data.dueDate } : t));
    setShowModal(false); setEditingTodo(null);
  };
  const toggleTodo = (id) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };
  const deleteTodo = () => {
    setTodos(prev => prev.filter(t => t.id !== deletingTodo.id));
    setDeletingTodo(null);
  };

  const filteredTodos = todos
    .filter(t => filter === 'active' ? !t.completed : filter === 'completed' ? t.completed : true)
    .filter(t => t.text.toLowerCase().includes(search.toLowerCase()));
  const activeCount = todos.filter(t => !t.completed).length;
  const completedCount = todos.filter(t => t.completed).length;
  const isOverdue = (d) => d && new Date(d) < new Date(new Date().toDateString());
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <div>
      <div className="page-header">
        <h1>My Todo List</h1>
        <p>Stay organized — track your tasks, assignments, and deadlines.</p>
      </div>
      <div className="todo-stats">
        <div className="todo-stat todo-stat-total">
          <div className="todo-stat-icon todo-stat-icon-total"><Icon name="todo" size={24} /></div>
          <div className="todo-stat-body">
            <span className="todo-stat-value">{todos.length}</span>
            <span className="todo-stat-label">Total Tasks</span>
            <div className="todo-stat-bar"><span style={{ width: '100%' }} /></div>
          </div>
        </div>
        <div className="todo-stat todo-stat-active">
          <div className="todo-stat-icon todo-stat-icon-active"><Icon name="flag" size={24} /></div>
          <div className="todo-stat-body">
            <span className="todo-stat-value">{activeCount}</span>
            <span className="todo-stat-label">Active</span>
            <div className="todo-stat-bar"><span style={{ width: `${todos.length ? (activeCount / todos.length) * 100 : 0}%` }} /></div>
          </div>
        </div>
        <div className="todo-stat todo-stat-complete">
          <div className="todo-stat-icon todo-stat-icon-complete"><Icon name="check" size={24} /></div>
          <div className="todo-stat-body">
            <span className="todo-stat-value">{completedCount}</span>
            <span className="todo-stat-label">Completed</span>
            <div className="todo-stat-bar"><span style={{ width: `${todos.length ? (completedCount / todos.length) * 100 : 0}%` }} /></div>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header todo-toolbar" style={{ flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
          {/* Modern segmented filter pill */}
          <div className="todo-filters" role="tablist" aria-label="Filter tasks">
            {FILTERS.map(f => {
              const count = f === 'active' ? activeCount : f === 'completed' ? completedCount : todos.length;
              const isActive = filter === f;
              return (
                <button
                  key={f}
                  role="tab"
                  aria-selected={isActive}
                  className={`todo-filter-btn ${isActive ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  <span className="todo-filter-label">{f}</span>
                  <span className={`todo-filter-count ${isActive ? 'active' : ''}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
            {/* Modern search box */}
            <div className="todo-search">
              <Icon name="search" size={17} className="todo-search-icon" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="todo-search-input"
              />
              {search && (
                <button
                  className="todo-search-clear"
                  title="Clear search"
                  onClick={() => setSearch('')}
                >
                  <Icon name="x" size={15} />
                </button>
              )}
            </div>
            <button className="btn btn-primary" onClick={() => { setEditingTodo(null); setShowModal(true); }}>
              <Icon name="plus" size={16} style={{ marginRight: '6px' }} />Add Task
            </button>
          </div>
        </div>
        <div className="panel-body">
          {filteredTodos.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredTodos.map(todo => {
                const p = PRIORITIES.find(x => x.value === todo.priority) || PRIORITIES[1];
                const overdue = !todo.completed && isOverdue(todo.dueDate);
                return (
                  <div key={todo.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                    borderRadius: '10px', border: `1px solid ${overdue ? 'rgba(220,38,38,0.3)' : 'var(--border)'}`,
                    background: todo.completed ? 'var(--light-gray)' : 'var(--white)',
                    opacity: todo.completed ? 0.65 : 1, transition: 'all 0.2s',
                  }}>
                    <button onClick={() => toggleTodo(todo.id)} style={{
                      width: '22px', height: '22px', borderRadius: '6px',
                      border: `2px solid ${todo.completed ? 'var(--success)' : p.color}`,
                      background: todo.completed ? 'var(--success)' : 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {todo.completed && <Icon name="check" size={14} style={{ color: 'white' }} />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.88rem', fontWeight: '500',
                        textDecoration: todo.completed ? 'line-through' : 'none',
                        color: todo.completed ? 'var(--gray)' : 'var(--dark)',
                      }}>{todo.text}</div>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '4px', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '0.68rem', fontWeight: '600', color: p.color,
                          padding: '2px 8px', borderRadius: '12px', background: p.color + '15',
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>{p.label}</span>
                        {todo.dueDate && (
                          <span style={{ fontSize: '0.72rem', color: overdue ? '#dc2626' : 'var(--gray)',
                            fontWeight: overdue ? '600' : '400' }}>
                            {overdue ? 'Overdue - ' : ''}Due {fmtDate(todo.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button className="btn-icon edit" title="Edit"
                        onClick={() => { setEditingTodo(todo); setShowModal(true); }}>
                        <Icon name="edit" size={15} />
                      </button>
                      <button className="btn-icon delete" title="Delete"
                        onClick={() => setDeletingTodo(todo)}>
                        <Icon name="delete" size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <div style={{ marginBottom: '8px' }}><Icon name="todo" size={48} style={{ opacity: 0.3 }} /></div>
              <h3>No tasks {filter !== 'all' ? `(${filter})` : ''}</h3>
              <p>{search ? 'Try a different search term.' : 'Click "Add Task" to create your first todo.'}</p>
            </div>
          )}
        </div>
      </div>
      {showModal && (
        <Modal title={editingTodo ? 'Edit Task' : 'Add New Task'}
          onClose={() => { setShowModal(false); setEditingTodo(null); }}>
          <TodoForm todo={editingTodo} onSave={editingTodo ? updateTodo : addTodo}
            onCancel={() => { setShowModal(false); setEditingTodo(null); }} />
        </Modal>
      )}
      {deletingTodo && (
        <ConfirmDialog message={`Are you sure you want to delete "${deletingTodo.text}"?`}
          onConfirm={deleteTodo} onCancel={() => setDeletingTodo(null)} />
      )}
    </div>
  );
}

export default TodoList;
