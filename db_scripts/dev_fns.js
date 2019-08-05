const pool = require('./pool').pool
const format = require('./pool').format

const resetOrder = (request, response, next) => {
    let stall_uid = request.body.stall_uid
    pool.query(format('UPDATE %I_orders SET status_id=0', stall_uid), [], (error, results) => {
        if(error){
            console.log("resetOrder", error);
            throw error;
        }
    });
    request.user_response = {
        "message":"All orders reset;",
    };
    next();
}

const getCustomers = (request, response) => {
    pool.query('SELECT * FROM customers ORDER BY id ASC', (error, results)=>{
        if(error){
            throw error;
        }
        response.status(200).json(results.rows);
    })
}

module.exports = {
    resetOrder,
    getCustomers
}