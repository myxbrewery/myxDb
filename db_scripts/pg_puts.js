const pool = require('./pool').pool
const format = require('./pool').format

async function transitionOrder(request, response, next){
    var order_info = request.body;
    let order_status = order_info.status_id;
    let uid = request.params.uid;
    let order_id = request.params.orderid;
    console.log(order_info, uid, order_id)
    pool.query(format('UPDATE %I_orders SET status_id = $1 WHERE %I_orders.id = $2', uid, uid), [order_status, order_id], (error, results) => {
        if(error){
            console.log(error);
            response.status(400).send({"Error": error.detail});
        }
        request.user_response = {
            "message":"Orders transitioned",
            "order": order_id,
            "new_status": order_status
        };
        next();
    })
}
  
async function putReceiptStatus(request, response, next){
    const receipt_details = request.body;
    let uid = request.params.uid;
    let receipt_id = request.params.receiptid;
    let errored = false;
    let error_message = "";
    
    var client = await pool.connect();
    try{
        await client.query('BEGIN')
        try{
            var _ = await client.query(format('UPDATE %I_receipts SET accepted = $1 WHERE id = $2', uid), [receipt_details['accepted'], receipt_id])
            var orders = await client.query(format('SELECT * FROM %I_orders WHERE receipt_id = $1', uid), [receipt_id])
                                    .then(results=>{return results.rows});
            // console.log(orders)
            for(order_idx in orders){
                let order = orders[order_idx]
                let order_status = 0;
                if(receipt_details['accepted']) order_status = 1;
                else{
                    if(receipt_details['rejected_orders'].includes(order.id)) order_status = -2;
                    else order_status = -1;
                }
                var success = await client.query(format('UPDATE %I_orders SET status_id = $1 WHERE id = $2', uid), [order_status, order.id])
                    .catch(error=>{
                        errored = true;
                        error_message = error.detail;
                        // console.log(error.detail)
                        return false;
                    })
                    .then(results=>{
                        // console.log(results);
                        return true
                    });
                // console.log(success)
                if(!success) break;
            }
            client.query('COMMIT')
        }
        catch(e){
            client.query('ROLLBACK')
        }
    }
    finally{
        client.release()
    }
    if(errored) response.status(400).send({"Error": error_message})
    else {
        request.user_response = {"message": "Successfully changed order and receipt status"}
        next();
    };
}


const putStock = (request, response, next) => {
    const item_details = request.body;
    let uid = request.params.uid;
    let item_id = request.params.itemid;
    // console.log('putStock called', uid, item_id)
    // console.log(uid == undefined, item_id == undefined)
    if(uid == "undefined" || item_id == "undefined"){
        response.status(400).send({"Error": "Undefined item or stall id"});
    }
    else{
        if(!('in_stock' in item_details)) {
            response.status(400).send({"Error": "No stock key"});
        }
        else{
            try{
                pool.query(format('UPDATE %I_menu SET in_stock = $1 WHERE %I_menu.id = $2', uid, uid), 
                                [item_details['in_stock'], item_id], (error, results) => {
                    if(error){
                        console.log(error);
                        response.status(400).send({"Error": error.detail});
                    }
                    else{
                        request.user_response = {
                            "status":true
                        };
                        next();
                    }
                })
            }
            catch{
                response.status(400).send({"Error": "error thrown"});
            }
        }
    }
}


async function favoriteStall(request, response){
    // PUT request for updating of favorite stalls
    var payload = request.body;
    let customer_id = payload.customer_id;
    let stall_uid = payload.stall_uid;
    let status = payload.status;
    let current_favorites = await pool.query('SELECT favorites FROM customers WHERE id = $1', [customer_id])
                                    .catch(err=>{
                                        console.log("favoriteStall", err)
                                        return 'invalid';
                                    });
    if(current_favorites == 'invalid') {
        response.status(400).send({'message': 'invalid'})
        return false
    };
    let current_favorite_set = new Set(current_favorites);
    if (status) current_favorite_set.add(stall_uid);
    else current_favorite_set.delete(stall_uid);
    let updated = await pool.query('UPDATE customers SET favorites = $1 WHERE id = $2', [Array.from(current_favorite_set), customer_id])
        .then(res=>{
            return True
        })
        .catch(err=>{
            return False
        })
    if (updated) response.status(200).json(orders);
    else response.status(400).json({"message":"Unable to update customers table"});
}

module.exports = {
    favoriteStall,
    putReceiptStatus,
    transitionOrder,
    putStock
}
