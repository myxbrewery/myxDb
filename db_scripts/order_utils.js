const pool = require('./pool').pool
const format = require('./pool').format
const menu_utils = require('./menu_utils')

async function getAllOrders(){
    var stalls = await pool.query("SELECT * FROM stalls", [])
        .then(results=>{
            return results.rows;
        })
        .catch(error=>{
            throw error;
        })
    var res = {}
    for (i in stalls){
        let row = stalls[i];
        let stall_uid = row.uid;
        let stall_orders = stall_uid + "_orders";
        let stall_menu = stall_uid + "_menu";
        nested_results = await pool.query(format("SELECT \
            category, %I.compulsory_options, %I.optional_options, \
            customer_id, delivery_time, \
            end_datetime, %I.id as order_id, item_id, menu_version, name, \
            receipt_id, start_datetime, status_id, total_price, \
            FROM %I \
            INNER JOIN %I ON %I.item_id = %I.id \
            ORDER BY %I.start_datetime DESC", 
            stall_orders, stall_orders, stall_orders, stall_orders, stall_menu, stall_orders, stall_menu, stall_orders, stall_orders, stall_orders), 
            [])
            .then(results=>{return results.rows;})
            .catch(error =>{throw error});
        res[stall_uid] = nested_results;
    }
    return res;
}

async function getLiveOrders(){
    var stalls = await pool.query("SELECT * FROM stalls", [])
        .then(results=>{
            return results.rows;
        })
        .catch(error=>{
            throw error;
        })
    var res = {}
    for (i in stalls){
        let row = stalls[i];
        let stall_uid = row.uid;
        let stall_orders = stall_uid + "_orders";
        let stall_menu = stall_uid + "_menu";
        nested_results = await pool.query(format("SELECT \
            category, %I.compulsory_options, %I.optional_options, \
            customer_id, delivery_time, \
            end_datetime, %I.id as order_id, item_id, menu_version, name, \
            receipt_id, start_datetime, status_id, total_price, \
            FROM %I \
            INNER JOIN %I ON %I.item_id = %I.id \
            WHERE %I.status_id >= 0 \
            AND %I.start_datetime >= now()::date\
            ORDER BY %I.start_datetime DESC", 
            stall_orders, stall_orders, stall_orders, stall_orders, stall_menu, stall_orders, stall_menu, stall_orders, stall_orders, stall_orders), 
            [])
            .then(results=>{return results.rows;})
            .catch(error =>{throw error});
        res[stall_uid] = nested_results;
    }
    return res;
}

async function verifyOrder(order_package){
    /*
    Verifies order; check if amount is correct
    */
    let metadata = order_package.metadata;
    let items = order_package.orders;
    var total_payment = 0
    let stall_uid = metadata.uid;
    let menu = await menu_utils.getLatestMenu(stall_uid, false);
    if(metadata.menu_version != menu[Object.keys(menu)[0]].menu_version) {
        return {
            status:false,
            error:"User menu version not same as latest DB",
            payment:0
        }
    }
    for(i in items){
        let item_id = items[i]["item_id"];
        if(!(item_id in menu)){
            let suggestion = Object.keys(menu).map(x=>(`ID ${menu[x].id}: ${menu[x].name}, $${menu[x].base_price}`));
            return {
                status: false,
                error: `Item ID ${item_id} not in menu version ${metadata.menu_version}. Valid IDs: ${suggestion}`,
                payment: 0
            }
        }
        if(items[i]["base_price"] != menu[item_id]["base_price"]){
            // console.log("Menu base price unequal to Customer base price");
            return {
                status:false,
                error:"Menu base price unequal to Customer base price",
                payment:0
            }
        }
        total_payment += parseFloat(items[i]["base_price"]) * 100
        // Payment consolidation for compulsory options
        if(items[i]["compulsory_options"].length != menu[item_id]["compulsory_options"].length) {
            return {
                status:false,
                error:"Different number of compulsory options supplied from actual",
                payment:0
            }
        };
        let compulsory_choices = menu[item_id]["compulsory_options"]
        let available_compulsory_option_categories = []
        for (j in compulsory_choices) available_compulsory_option_categories.push(compulsory_choices[j]["name"]);
        let user_compulsory_options = items[i]["compulsory_options"]
        user_compulsory_options.forEach(user_option_category=>{
            // Ensure compulsory option category exists
            if(!available_compulsory_option_categories.includes(user_option_category["name"])) {
                return {
                    status:false,
                    error:"User supplied compulsory option not within available options",
                    payment:0                
                }
            };
            // Ensure only 1 option chosen per category
            if(user_option_category["options"].length != 1) {
                console.log("Compulsory options length can only be 1"); 
                return {
                    status:false,
                    error:"Compulsory options length can only be 1",
                    payment: 0
                }
            }
            // Ensure compulsory option choice exists
            let category_exists = false;
            let category_choice_exists = false;
            menu[item_id]["compulsory_options"].forEach(category=>{
                if(category["name"] === user_option_category["name"]){
                    category_exists = true;
                    for(k in category["options"]){
                        let category_option = category["options"][k];
                        // "Noodle" == "Noodle"
                        if(category_option["name"] === user_option_category["options"][0]["name"]){
                            category_choice_exists = true;
                            if(category_option["cost"] === user_option_category["options"][0]["cost"]){
                                total_payment += parseFloat(category_option["cost"]) * 100
                            }
                            else {
                                console.log("User supplied option cost is not equal to menu cost")
                                return {
                                    status:false,
                                    error:"User supplied option cost is not equal to menu cost",
                                    payment: 0
                                }
                            };
                        }
                    }
                }
            })
            if(!category_exists) {
                console.log("User-supplied category does not exist")
                return {
                    status:false,
                    error:"User-supplied category does not exist",
                    payment: 0
                }
            };
            if(!category_choice_exists) {
                console.log("User-supplied category choice does not exist")
                return {
                    status:false,
                    error:"User-supplied category choice does not exist",
                    payment: 0
                }
            };
        })
        // Payment consolidation for optional options
        let optional_choices = menu[item_id]["optional_options"]
        let available_optional_option_categories = []
        for (j in optional_choices) available_optional_option_categories.push(optional_choices[j]["name"]);
        let user_optional_options = items[i]["optional_options"];
        user_optional_options.forEach(user_option_category=>{
            // Ensure optional option category exists
            if(!available_optional_option_categories.includes(user_option_category["name"])) {
                return {
                    status:false,
                    error:"User supplied optional option not within available options",
                    payment:0                
                }
            };
            // Ensure optional option choice exists
            let optional_category_exists = false;
            let optional_category_choice_exists = false;
            menu[item_id]["optional_options"].forEach(category=>{
                if(category["name"] === user_option_category["name"]){
                    optional_category_exists = true;
                    if(user_option_category["options"].length!=0){
                      for(k in category["options"]){
                          let category_option = category["options"][k];
                          if(category_option["name"] === user_option_category["options"][0]["name"]){
                              optional_category_choice_exists = true;
                              if(category_option["cost"] === user_option_category["options"][0]["cost"]){
                                  total_payment += parseFloat(category_option["cost"]) * 100
                              }
                              else {
                                  console.log("User supplied option cost is not equal to menu cost")
                                  return {
                                      status:false,
                                      error:"User supplied option cost is not equal to menu cost",
                                      payment: 0
                                  }
                              };
                          }
                      }
                    }
                    else{
                      optional_category_choice_exists = true;
                    }
                }
            })
            if(!optional_category_exists) {
                console.log("User-supplied optional category does not exist")
                return {
                    status:false,
                    error:"User-supplied optional category does not exist",
                    payment: 0
                }
            };
            if(!optional_category_choice_exists) {
                console.log("User-supplied optional category choice does not exist")
                return {
                    status:false,
                    error:"User-supplied optional category choice does not exist",
                    payment: 0
                }
            };
        })
    }
    if(metadata.total_payment != total_payment/100) {
        return {
            status: false,
            error: "Unequal total payment from customer and database calculated",
            payment: 0
        }
    }
    return {
        status: true,
        payment: total_payment/100
    }
}

async function orderInsert(receipt_id, uid, customer_id, start_time, delivery_time, menu_version, order){
    let menu_query = format('INSERT INTO %I_orders (\
        item_id, customer_id, base_price, total_price, status_id, start_datetime, delivery_time, \
        receipt_id, compulsory_options, optional_options, menu_version, note) \
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)', uid)
    res = await pool.query(menu_query,
            [order.item_id, customer_id, order.base_price,
            order.total_price, 0, start_time, delivery_time, 
            receipt_id, order.compulsory_options,
            order.optional_options, menu_version, order.note])
        .catch(err=>{
            console.log("Failed to add to orders")
            throw err;
        })
    return order.item_id + " Successfully added";
}

var receipt_semaphore = false
async function receiptInsert(order_package, timestamp){
    while(receipt_semaphore);
    receipt_semaphore = true;
    let order_metadata = order_package.metadata;
    let uid = order_metadata.uid;
    let delivery_time = order_metadata.delivery_time;
    if (delivery_time === "now") delivery_time = timestamp;
    let receipt_query = format('INSERT INTO %I_receipts (customer_id, accepted, start_datetime, delivery_time, total_payment, special_request) \
                                VALUES ($1, $2, $3, $4, $5, $6)', uid)
    let add_receipt = await pool.query(receipt_query, 
                    [order_metadata.customer_id, false, timestamp,
                    delivery_time, order_metadata.total_payment,
                    order_metadata.special_request])
                        .then((misc_res)=>{
                            return misc_res;
                        })
                        .catch(err=>{
                            console.log("Add receipt err", err)
                            return false;
                        });
    if(!add_receipt) return false;
    let receipt = await pool.query(format("SELECT id FROM %I_receipts WHERE customer_id = $1 ORDER BY start_datetime DESC LIMIT 1", uid), [order_metadata.customer_id])
                    .then(results=>{
                        let receipt_id = results.rows[0].id;
                        return receipt_id;
                    })
                    .catch((err=>{
                        console.log("Get receipt err", err)
                        return false;
                    }))
    receipt_semaphore = false;
    return receipt;
}

module.exports = {
    getAllOrders,
    getLiveOrders,
    orderInsert,
    receiptInsert,
    verifyOrder
}
