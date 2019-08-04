const Pool = require('pg').Pool

const types = require('pg').types;
types.setTypeParser(1700, function(val){
  return parseFloat(val)
})
// types.builtins.NUMERIC, parseFloat);

var format = require('pg-format');

var credentials = require('../.credentials.json');

const pool = new Pool({
  user: credentials.user,
  host: credentials.host,
  database: credentials.database,
  password: credentials.password,
  port: 5432,
})

module.exports = {
    pool,
    format
}