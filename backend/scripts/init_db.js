const fs = require('fs')
const path = require('path')
const backendDir = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(backendDir, '.env') })
const { query } = require('../src/config/database')

async function initDB() {
  console.log('=== RUNNING DATABASE SCHEMA INITIALIZATION ===')
  try {
    const sqlPath = path.join(backendDir, '../db/init.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    await query(sql)
    console.log('✅ Schema initialization successful!')
  } catch (error) {
    console.error('❌ Failed to initialize schema:', error)
    process.exit(1)
  }
  process.exit(0)
}

initDB()
