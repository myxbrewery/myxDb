const pool = require('./pool').pool
const format = require('./pool').format

async function retrieve(request, response, next){
    var order_id = request.params.order_id;
    var order = await pool.query("SELECT * FROM myx_orders INNER JOIN myx_menu ON myx_menu.id = myx_orders.item_id WHERE myx_orders.id = $1 AND myx_orders.status_id < 5 LIMIT 1", [order_id])
                    .then(res=>{
                        if(res.length==0) return false;
                        return res.rows[0]
                    })
                    .catch(err=>{
                        console.log("Retrieve failed", err)
                    });
    if(!order) {
        response.status(400).json({"message": "No order id found"});
        return false;
    };
    let item_id_mapping = {
        "Black Milk Tea": 1,
        "Earl Grey Milk Tea": 4,
        "Black Milk Tea with Pearls": 3,
        "Earl Grey Milk Tea with Pearls": 2,
    }
    var shelf = await pool.query("SELECT * FROM shelving WHERE drink = $1 LIMIT 1", [item_id_mapping[order.name]]).then(
        res=>{
            if(res.rows.length == 0) {
                return -1;
            }
            else return res.rows[0];
        });
    if(shelf === -1) {
        response.status(400).send({"message": "Nothing in shelf that matches desired order"});
        return false;
    }
    else{
        request.shelf_data = {
            'slot': shelf.slot,
            'direction': -1
        }
        request.user_response = {
            "message": "Success, retrieving your order from slot " + shelf.slot
        }
        var update_shelf = await pool.query("UPDATE shelving SET drink = 0 WHERE slot = $1", [shelf.slot])
            .then(res=>{console.log("update shelf", res); return true})
            .catch(err=>{console.log("update_shelf",err); return false});
        if(update_shelf) {
            pool.query('UPDATE myx_orders SET status_id = 4 WHERE myx_orders.id = $1', [order_id], (error, results) => {
                if(error){
                  console.log("update myx order error", error);
                  response.status(400).send({"Error": error.detail});
                }
                request.user_response = {
                  "message":"Orders transitioned",
                  "order": order_id,
                  "new_status": 4
                };
              })
            next();
        }
        else response.status(400).send({"message": "Failed to update slot drink status"});
    }
}


async function depositItem(request, response, next){
    /*
    Deposits drink of specified name into first empty slot of database
    
    Returns:
        [type] -- [description]
    */
    var item_cat = request.params.item_cat
    let slot = await pool.query('SELECT * FROM shelving WHERE drink = 0 ORDER BY slot ASC LIMIT 1', [])
        .then(res=>{
            console.log("Empty slot" + item_cat + " found");
            console.log(res.rows)
            return res.rows[0].slot;
        })
        .catch(err=>{
            console.log("Deposit error", err);
            return false;
        });
    if(!slot) response.status(400).send({"Error": "No slot"});
    else{
        console.log(item_cat, slot);
        let success = pool.query('UPDATE shelving SET drink = $1 WHERE slot = $2', [item_cat, slot])
            .then(res=>{
                console.log("Drink updated");
                return true
            })
            .catch(err=>{
                console.log("Shelving update error", err);
                return false;
            })
        if(!success) response.status(400).send({"Error": err});
        else {
            request.shelf_data = {
                'slot': slot,
                'direction': 1
            }
            next();
        }
    }
}

module.exports = {
    retrieve,
    depositItem
}
