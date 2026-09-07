import('./server/db.supabase.js')
  .then(async m => {
    const tests = [
      {
        in: 'SELECT * FROM users WHERE id = ? AND status = ?',
        want: 'SELECT * FROM users WHERE id = $1 AND status = $2',
      },
      {
        in: `INSERT INTO chat_messages (userId, userName, userRole, channel, message, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        want: 'INSERT INTO chat_messages (userId, userName, userRole, channel, message, createdAt) VALUES ($1, $2, $3, $4, $5, now()::text)',
      },
      {
        in: 'UPDATE attendance_records SET status = ?, approvedBy = ?, approvedAt = ? WHERE id = ?',
        want: 'UPDATE attendance_records SET status = $1, approvedBy = $2, approvedAt = $3 WHERE id = $4',
      },
      { in: 'SELECT COUNT(*) as c FROM users', want: 'SELECT COUNT(*) as c FROM users' },
      {
        in: 'INSERT INTO students (name, code, teacher, credits, className) VALUES (?,?,?,?,?)',
        want: 'INSERT INTO students (name, code, teacher, credits, className) VALUES ($1,$2,$3,$4,$5)',
      },
    ];
    let pass = 0;
    for (const t of tests) {
      const got = m.toPgSql(t.in);
      const ok = got === t.want;
      if (ok) pass++;
      else console.log('FAIL:', t.in, '\n   got:', got, '\n  want:', t.want);
    }
    console.log('toPgSql:', pass + '/' + tests.length, 'passed');

    // run(): INSERT appends RETURNING id; UPDATE/DELETE do not
    const calls = [];
    m.pool.query = (sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [{ id: 42 }], rowCount: 1 });
    };
    const r = await m.run('INSERT INTO students (name, status) VALUES (?, ?)', ['Zain', 'Active']);
    const okR = r.lastInsertRowid === 42 && r.changes === 1;
    const okReturning = /RETURNING id$/i.test(calls[0].sql);
    const u = await m.run('UPDATE students SET status = ? WHERE id = ?', ['Inactive', 7]);
    const okU = u.changes === 1 && u.lastInsertRowid === 0 && !/returning/i.test(calls[1].sql);
    console.log('run() INSERT lastInsertRowid=42 changes=1 RETURNING appended:', okR && okReturning);
    console.log('run() UPDATE changes=1 lastInsertRowid=0 no RETURNING:', okU);
    console.log('default export keys:', Object.keys(m.default).join(', '));
    process.exit(okR && okU && pass === tests.length ? 0 : 1);
  })
  .catch(e => {
    console.error('IMPORT/SYNTAX ERROR:', e.message);
    process.exit(1);
  });