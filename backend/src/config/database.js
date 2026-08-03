const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://kspdb:kspdb@localhost:5432/kspdb',
})

async function query(text, values = []) {
  return pool.query(text, values)
}

async function transaction(work) {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

module.exports = {
  pool,
  query,
  transaction,
}