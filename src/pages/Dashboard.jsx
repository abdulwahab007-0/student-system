import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { getStudentAverage } from '../utils/scoreUtils';

const avatarColors = ['#059669', '#0284c7', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#db2777', '#0ea5e9', '#ea580c', '#047857'];

// Vibrant gradient pairs (from -> to) for modern gradient charts
const chartGradients = [
  { from: '#8b5cf6', to: '#6d28d9' }, // violet
  { from: '#ec4899', to: '#be185d' }, // pink
  { from: '#f97316', to: '#c2410c' }, // orange
  { from: '#06b6d4', to: '#0e7490' }, // cyan
  { from: '#10b981', to: '#047857' }, // emerald
  { from: '#3b82f6', to: '#1d4ed8' }, // blue
  { from: '#f59e0b', to: '#b45309' }, // amber
  { from: '#ef4444', to: '#b91c1c' }, // red
  { from: '#14b8a6', to: '#0f766e' }, // teal
  { from: '#a855f7', to: '#7e22ce' }, // fuchsia
];

function getInitials(name) {
  return name
    ? name.split(' ').map(word => word[0]).slice(0, 2).join('').toUpperCase()
    : '';
}

function getAvatarColor(name) {
  if (!name) return '#7c3aed';
  const sum = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return avatarColors[sum % avatarColors.length];
}

function Dashboard() {
  const { students, teachers, subjects, marks } = useData();
  const { currentUser } = useAuth();
  const [showAllStudents, setShowAllStudents] = useState(false);

  const role = currentUser?.role;
  const userClass = currentUser?.className;
  const isStudent = role === 'student';
  const isAdmin = ['super_admin', 'cr_admin', 'teacher_admin'].includes(role);

  // For students: build a synthetic student record from the logged-in user's
  // data so the dashboard works even when the /students endpoint returns 403.
  const myStudentData = isStudent ? {
    id: currentUser.linkedStudentId,
    name: currentUser.fullName,
    className: currentUser.className,
    email: currentUser.email,
    status: 'Active',
  } : null;

  // Filter data based on role
  const visibleStudents = isStudent
    ? (myStudentData ? [myStudentData] : [])
    : role === 'cr_admin' && !currentUser?.manageAllClasses
      ? students.filter(s => s.className === userClass)
      : students;

  // For student: match own marks by linkedStudentId or studentName (since
  // the /students endpoint may not be accessible for students).
  const visibleMarks = isStudent
    ? marks.filter(m =>
        (currentUser.linkedStudentId != null && m.studentId === currentUser.linkedStudentId) ||
        m.studentName === currentUser.fullName
      )
    : (role === 'cr_admin')
      ? marks.filter(m => visibleStudents.some(s => s.id === m.studentId))
      : marks;

  // Teacher admin only sees their subject marks
  const teacherSubjects = role === 'teacher_admin'
    ? subjects.filter(s => (s.teacher || '').includes(currentUser?.fullName || ''))
    : [];
  const teacherSubjectNames = teacherSubjects.map(s => s.name);
  const visibleMarksForRole = role === 'teacher_admin'
    ? marks.filter(m => teacherSubjectNames.includes(m.subject))
    : visibleMarks;

  const activeStudents = visibleStudents.filter(s => s.status === 'Active');
  const totalStudents = visibleStudents.length;
  const totalTeachers = role === 'teacher_admin' ? 1 : teachers.length;
  const totalSubjects = role === 'teacher_admin' ? teacherSubjects.length : subjects.length;
  const totalMarkRecords = visibleMarksForRole.length;

  // Calculate average scores for each student
  const studentScores = visibleStudents.map(student => {
    const studentMarks = visibleMarksForRole.filter(m => m.studentId === student.id);
    return { ...student, average: getStudentAverage(studentMarks) };
  });

  // Top 3 students by average score
  const topStudents = [...studentScores]
    .filter(s => s.average > 0)
    .sort((a, b) => b.average - a.average)
    .slice(0, 3);

  // Student ranking: top 8 students by average marks for the bar chart
  const rankedStudents = [...studentScores]
    .filter(s => s.average > 0)
    .sort((a, b) => b.average - a.average)
    .slice(0, 8);

  // Student count per class
  const classCounts = {};
  visibleStudents.forEach(s => {
    const cls = s.className || 'Unclassified';
    classCounts[cls] = (classCounts[cls] || 0) + 1;
  });
  const classCountsList = Object.entries(classCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count], i) => ({ name, count, color: avatarColors[i % avatarColors.length] }));

  // Gender ratio for admin chart
  const maleCount = visibleStudents.filter(s => (s.gender || '').toLowerCase() === 'male').length;
  const femaleCount = visibleStudents.filter(s => (s.gender || '').toLowerCase() === 'female').length;
  const totalWithGender = maleCount + femaleCount;
  const malePct = totalWithGender > 0 ? Math.round((maleCount / totalWithGender) * 100) : 0;
  const femalePct = totalWithGender > 0 ? 100 - malePct : 0;

  const rankMedals = ['gold', 'silver', 'bronze'];
  const rankLabels = ['1st', '2nd', '3rd'];

  const recentStudents = [...visibleStudents].sort((a, b) => b.id - a.id).slice(0, 6);

  // For student role, use the own marks already derived above
  const myMarks = isStudent ? visibleMarksForRole : [];
  const myClassLower = (currentUser?.className || '').trim().toLowerCase();
  const mySubjects = isStudent
    ? subjects.filter(s => (s.className || '').split(',').map(c => c.trim().toLowerCase()).includes(myClassLower))
    : [];
  const myAverage = getStudentAverage(myMarks);

  return (
    <div>
      <div className="page-header">
        <h1>{isStudent ? 'My Dashboard' : 'Dashboard Overview'}</h1>
        <p>
          {isStudent
            ? `Welcome, ${currentUser?.fullName}! Here's your academic overview at NCBA&E.`
            : "Welcome to the NCBA&E Student Management System. Here's what's happening in your institution."}
        </p>
      </div>

      {/* STUDENT ROLE - Personal Dashboard */}
      {isStudent && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">📝</div>
              <div className="stat-info">
                <h3>{myMarks.length}</h3>
                <p>Subjects Graded</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green">🎯</div>
              <div className="stat-info">
                <h3>{myAverage > 0 ? `${myAverage}%` : '—'}</h3>
                <p>My Average</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon orange">📚</div>
              <div className="stat-info">
                <h3>{mySubjects.length}</h3>
                <p>My Subjects</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon purple">🏫</div>
              <div className="stat-info">
                <h3 style={{ fontSize: '1.1rem' }}>{myStudentData?.className || currentUser?.className || '—'}</h3>
                <p>My Class</p>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>📝 My Marks</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                {myMarks.length} grades recorded
              </span>
            </div>
            <div className="panel-body" style={{ padding: '0' }}>
              {myMarks.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Marks</th>
                        <th>Grade</th>
                        <th>Exam Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myMarks.map(mark => {
                        const color = mark.marks >= 80 ? 'var(--success)' : mark.marks >= 60 ? 'var(--warning)' : 'var(--danger)';
                        return (
                          <tr key={mark.id}>
                            <td style={{ fontWeight: '600' }}>{mark.subject}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="marks-cell" style={{ color }}>{mark.marks}</span>
                                <div className="progress-bar" style={{ width: '120px' }}>
                                  <div className="progress-fill" style={{ width: `${mark.marks}%`, background: color }} />
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`badge ${mark.marks >= 80 ? 'success' : mark.marks >= 60 ? 'warning' : 'danger'}`}>
                                {mark.grade}
                              </span>
                            </td>
                            <td>{mark.examType}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="icon">📝</div>
                  <h3>No marks recorded yet</h3>
                  <p>Your marks will appear here once teachers have recorded them.</p>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>📚 My Subjects</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                {mySubjects.length} subjects
              </span>
            </div>
            <div className="panel-body">
              <div className="card-grid">
                {mySubjects.map(subject => (
                  <div className="card" key={subject.id} style={{ borderTop: '4px solid var(--primary)' }}>
                    <h4>{subject.name}</h4>
                    <p><strong>Code:</strong> {subject.code}</p>
                    <p><strong>Teacher:</strong> {subject.teacher || 'Unassigned'}</p>
                    <p><strong>Credits:</strong> {subject.credits}</p>
                  </div>
                ))}
                {mySubjects.length === 0 && (
                  <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                    <div className="icon">📚</div>
                    <h3>No subjects assigned</h3>
                    <p>Your subjects will appear here once assigned.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ADMIN ROLES - Dashboard */}
      {isAdmin && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">🧑‍🎓</div>
              <div className="stat-info">
                <h3>{totalStudents}</h3>
                <p>{role === 'cr_admin' ? `Students in ${userClass || 'my class'}` : 'Total Students'}</p>
                <div className="stat-sub">↑ {activeStudents.length} active</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green">🧑‍🏫</div>
              <div className="stat-info">
                <h3>{totalTeachers}</h3>
                <p>{role === 'teacher_admin' ? 'My Teaching Load' : 'Total Teachers'}</p>
                <div className="stat-sub">↑ Faculty members</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon orange">📚</div>
              <div className="stat-info">
                <h3>{totalSubjects}</h3>
                <p>{role === 'teacher_admin' ? 'My Subjects' : 'Total Subjects'}</p>
                <div className="stat-sub">↑ Offered courses</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon purple">📝</div>
              <div className="stat-info">
                <h3>{totalMarkRecords}</h3>
                <p>{role === 'teacher_admin' ? 'My Marks Records' : 'Marks Records'}</p>
                <div className="stat-sub">↑ Entries recorded</div>
              </div>
            </div>
          </div>

          {/* Charts Row: Gender Distribution + Student Ranking */}
          {totalStudents > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: '20px',
              marginBottom: '24px',
            }}>
              {/* Gender Distribution Chart */}
              <div className="panel">
                <div className="panel-header">
                  <h3>📊 Gender Distribution</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                  {totalStudents} total students
                </span>
              </div>
              <div className="panel-body" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '40px',
                padding: '28px 24px',
                flexWrap: 'wrap',
              }}>
                <svg width="160" height="160" viewBox="0 0 160 160">
                  <defs>
                    <linearGradient id="gradMale" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#4f46e5" />
                    </linearGradient>
                    <linearGradient id="gradFemale" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f472b6" />
                      <stop offset="100%" stopColor="#db2777" />
                    </linearGradient>
                  </defs>
                  {(() => {
                    const R = 56;
                    const C = 2 * Math.PI * R;
                    const maleArc = (malePct / 100) * C;
                    const femaleArc = (femalePct / 100) * C;
                    return (
                      <>
                        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--border)" strokeWidth="18" />
                        {malePct > 0 && (
                          <circle cx="80" cy="80" r={R} fill="none"
                            stroke="url(#gradMale)" strokeWidth="18"
                            strokeDasharray={`${maleArc} ${C}`}
                            strokeLinecap="round"
                            transform="rotate(-90 80 80)"
                            style={{ filter: 'drop-shadow(0 2px 4px rgba(79,70,229,0.35))' }} />
                        )}
                        {femalePct > 0 && (
                          <circle cx="80" cy="80" r={R} fill="none"
                            stroke="url(#gradFemale)" strokeWidth="18"
                            strokeDasharray={`${femaleArc} ${C}`}
                            strokeDashoffset={`${-maleArc}`}
                            strokeLinecap="round"
                            transform="rotate(-90 80 80)"
                            style={{ filter: 'drop-shadow(0 2px 4px rgba(219,39,119,0.35))' }} />
                        )}
                        <text x="80" y="77" textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--dark)">{totalWithGender}</text>
                        <text x="80" y="95" textAnchor="middle" fontSize="11" fill="var(--gray)">students</text>
                      </>
                    );
                  })()}
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 14px', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(79,70,229,0.15))', border: '1px solid rgba(99,102,241,0.15)' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: 'linear-gradient(135deg, #818cf8, #4f46e5)', flexShrink: 0 }} />
                    <div>
                      <span style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--dark)' }}>Male</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--gray)', marginLeft: '8px' }}>
                        {maleCount} students · {malePct}%
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 14px', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(236,72,153,0.08), rgba(219,39,119,0.15))', border: '1px solid rgba(236,72,153,0.15)' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: 'linear-gradient(135deg, #f472b6, #db2777)', flexShrink: 0 }} />
                    <div>
                      <span style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--dark)' }}>Female</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--gray)', marginLeft: '8px' }}>
                        {femaleCount} students · {femalePct}%
                      </span>
                    </div>
                  </div>
                  {totalWithGender === 0 && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--gray)', fontStyle: 'italic' }}>
                      No gender data available
                    </div>
                  )}
                </div>
              </div>
            </div>

              {/* Student Ranking Chart */}
              <div className="panel">
                <div className="panel-header">
                  <h3>🏆 Student Ranking</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                    {rankedStudents.length} student{rankedStudents.length !== 1 ? 's' : ''} with marks
                  </span>
                </div>
                <div className="panel-body" style={{ padding: '16px 24px' }}>
                  {rankedStudents.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {rankedStudents.map((student, i) => {
                        const grad = chartGradients[i % chartGradients.length];
                        const medalLabels = ['🥇', '🥈', '🥉'];
                        const medalGrads = [
                          'linear-gradient(135deg, #fde047, #f59e0b)',
                          'linear-gradient(135deg, #e2e8f0, #94a3b8)',
                          'linear-gradient(135deg, #fdba74, #c2410c)',
                        ];
                        return (
                          <div key={student.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{
                              width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.95rem', fontWeight: '800',
                              background: i < 3
                                ? medalGrads[i]
                                : 'linear-gradient(135deg, var(--primary-bg), var(--secondary-bg))',
                              color: i < 3 ? '#78350f' : 'var(--primary)',
                              boxShadow: '0 3px 8px rgba(0,0,0,0.10)',
                            }}>
                              {i < 3 ? medalLabels[i] : i + 1}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--dark)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {student.name}
                                <span style={{ fontWeight: '400', color: 'var(--gray)', fontSize: '0.72rem', marginLeft: '6px' }}>
                                  {student.className}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, height: '12px', background: 'var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                                  <div style={{
                                    height: '100%',
                                    width: `${student.average}%`,
                                    background: `linear-gradient(90deg, ${grad.from}, ${grad.to})`,
                                    borderRadius: '8px',
                                    transition: 'width 0.5s ease',
                                    boxShadow: `0 2px 6px -1px ${grad.to}66`,
                                  }} />
                                </div>
                                <span style={{
                                  fontSize: '0.82rem', fontWeight: '800', minWidth: '44px', textAlign: 'right',
                                  color: grad.to,
                                  background: '#fff',
                                  border: `1px solid ${grad.to}33`,
                                  borderRadius: '7px',
                                  padding: '1px 7px',
                                }}>
                                  {student.average}%
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state" style={{ padding: '20px' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>
                        No marks recorded yet — student rankings will appear here.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Students Per Class Chart */}
          {classCountsList.length > 0 && (
            <div className="panel" style={{ marginBottom: '24px' }}>
              <div className="panel-header">
                <h3>🏫 Students Per Class</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                  {classCountsList.length} class{classCountsList.length !== 1 ? 'es' : ''} · {totalStudents} total students
                </span>
              </div>
              <div className="panel-body" style={{ padding: '20px 24px' }}>
                {(() => {
                  const maxCount = Math.max(...classCountsList.map(c => c.count), 1);
                  return (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', height: '220px', padding: '0 12px', position: 'relative' }}>
                      {/* dashed baseline */}
                      <div style={{ position: 'absolute', left: '12px', right: '12px', bottom: '46px', borderTop: '1px dashed var(--border)' }} />
                      {classCountsList.map((cls, i) => {
                        const grad = chartGradients[i % chartGradients.length];
                        const barHeight = Math.max((cls.count / maxCount) * 150, 10);
                        const pct = totalStudents > 0 ? ((cls.count / totalStudents) * 100).toFixed(0) : 0;
                        return (
                          <div key={cls.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <span style={{
                              fontSize: '0.8rem', fontWeight: '800', color: grad.to,
                              background: 'linear-gradient(135deg, var(--primary-bg), var(--secondary-bg))',
                              borderRadius: '8px', padding: '1px 9px',
                            }}>
                              {cls.count}
                            </span>
                            <div style={{
                              width: '100%',
                              maxWidth: '52px',
                              height: `${barHeight}px`,
                              background: `linear-gradient(180deg, ${grad.from}, ${grad.to})`,
                              borderRadius: '10px 10px 4px 4px',
                              boxShadow: `0 8px 16px -6px ${grad.to}88`,
                              transition: 'height 0.4s ease, transform 0.2s ease',
                              cursor: 'pointer',
                              position: 'relative',
                            }}
                              title={`${cls.name}: ${cls.count} students (${pct}%)`}
                              onMouseEnter={e => { e.currentTarget.style.transform = 'scaleX(1.06)'; }}
                              onMouseLeave={e => { e.currentTarget.style.transform = 'scaleX(1)'; }}
                            >
                              {/* glass shine effect */}
                              <div style={{
                                position: 'absolute', top: '4px', left: '6px', right: '6px',
                                height: '32%', borderRadius: '8px',
                                background: 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0))',
                              }} />
                            </div>
                            <span style={{
                              fontSize: '0.72rem', fontWeight: '600', color: 'var(--dark)',
                              textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '64px',
                            }}>
                              {cls.name}
                            </span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--gray)' }}>
                              {pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Top 3 Students */}
          <div className="page-header" style={{ marginBottom: '15px' }}>
            <h1 style={{ fontSize: '1.2rem' }}>🏆 Top 3 Students</h1>
          </div>
          <div className="top-students">
            {topStudents.map((student, index) => (
              <div key={student.id} className={`top-student-card ${rankMedals[index]}`}>
                <div className="rank-badge">{rankLabels[index]}</div>
                <div
                  className="student-avatar-large"
                  style={{ background: getAvatarColor(student.name) }}
                >
                  {getInitials(student.name)}
                </div>
                <h4>{student.name}</h4>
                <div className="class">{student.className}</div>
                <div className="avg-score">
                  <span>Average Score</span>
                  {student.average}%
                </div>
              </div>
            ))}
            {topStudents.length === 0 && (
              <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                <div className="icon">📊</div>
                <h3>No marks data yet</h3>
                <p>Add marks to see top performing students.</p>
              </div>
            )}
          </div>

          {/* All Students List */}
          <div className="panel">
            <div className="panel-header">
              <h3>All Students</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                Showing {showAllStudents ? visibleStudents.length : Math.min(6, visibleStudents.length)} of {visibleStudents.length} students
              </span>
            </div>
            <div className="panel-body" style={{ padding: '0' }}>
              {(showAllStudents ? visibleStudents : recentStudents).length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Roll No</th>
                        <th className="hide-mobile">Class</th>
                        <th>Avg Score</th>
                        <th className="hide-mobile">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllStudents ? visibleStudents : recentStudents).map(student => {
                        const score = studentScores.find(s => s.id === student.id);
                        const avg = score?.average || 0;
                        return (
                          <tr key={student.id}>
                            <td>
                              <div className="student-cell">
                                <div className="student-avatar" style={{ background: getAvatarColor(student.name) + '22', color: getAvatarColor(student.name) }}>
                                  {getInitials(student.name)}
                                </div>
                                <div>
                                  <div className="name">{student.name}</div>
                                  <div className="sub">{student.email}</div>
                                </div>
                              </div>
                            </td>
                            <td>{student.rollNo}</td>
                            <td className="hide-mobile">{student.className}</td>
                            <td>
                              <div className="marks-cell" style={{ color: avg >= 85 ? 'var(--success)' : avg >= 70 ? 'var(--warning)' : 'var(--danger)' }}>
                                {avg > 0 ? `${avg}%` : '—'}
                              </div>
                            </td>
                            <td className="hide-mobile">
                              <span className={`badge ${student.status === 'Active' ? 'success' : 'danger'}`}>
                                {student.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="icon">👨🎓</div>
                  <h3>No students found</h3>
                  <p>Add students to get started.</p>
                </div>
              )}
              {visibleStudents.length > 6 && (
                <div style={{ padding: '15px 20px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-secondary" onClick={() => setShowAllStudents(!showAllStudents)}>
                    {showAllStudents ? 'Show Less' : 'Show All Students'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="panel">
            <div className="panel-header">
              <h3>📈 Recent Activity</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Live updates</span>
            </div>
            <div className="panel-body" style={{ padding: '15px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div className="stat-icon green" style={{ width: '40px', height: '40px', fontSize: '1.1rem' }}>✓</div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '500' }}>{totalStudents} students registered in the system</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>System updated just now</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div className="stat-icon blue" style={{ width: '40px', height: '40px', fontSize: '1.1rem' }}>📚</div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '500' }}>{totalSubjects} subjects assigned to {totalTeachers} teachers</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>Curriculum updated</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Dashboard;