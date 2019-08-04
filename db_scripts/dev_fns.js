const pool = require('./pool').pool
const format = require('./pool').format

const resetOrder = (request, response, next) => {
    pool.query('UPDATE orders SET status_id=1', [], (error, results) => {
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