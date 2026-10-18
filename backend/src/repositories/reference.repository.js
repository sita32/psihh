// Справочники: методы, темы запросов, форматы сессий.
const { pool } = require('../db/postgres');

async function findAll(db = pool) {
  const [methods, topics, formats] = await Promise.all([
    db.query('SELECT code, name, description FROM methods ORDER BY id'),
    db.query('SELECT code, name FROM topics ORDER BY id'),
    db.query('SELECT code, name, max_participants AS "maxParticipants" FROM session_formats ORDER BY id'),
  ]);
  return { methods: methods.rows, topics: topics.rows, formats: formats.rows };
}

module.exports = { findAll };
