const pool = require('./pool').pool
const format = require('./pool').format
const menu_utils = require('./menu_utils')

const postCustomer = (request, response, next) => {
  console.log("POST Customer received");
  const user_details = request.body;
  console.log(user_details);
  pool.query('INSERT INTO customers (id, email, age, name, image, diet) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT(id) DO NOTHING', [user_details.id, user_details.email, user_details.age, user_details.name, user_details.image, user_details.diet], (error, results) => {
    if(error){
      console.log(error);
      response.status(400).json({"message":error.detail})
    }
    else{
      request.user_response = { "message":"Customer updated/added successfully" };
        next();
      }
  });
}

const order_utils = require('./order_utils')
var currently_processing = 0;
async function postOrder(request, response, next){
  function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
  }
  while(currently_processing > 10){
    await sleep(1000);
  }
  currently_processing += 1
  var start = new Date()
  var hrstart = process.hrtime()
    // Layer 1: Verify options are valid, payment amounts are legitimate
    let verification_check = await order_utils.verifyOrder(request.body).catch(error=>{
        console.log(error);
        response.status(400).send({"message": "Verification check failed for order"});
        next()
    });
    // === true is for readability Yustynn dont judge me
    if(verification_check.status === true){
        let order_package = request.body;
        var timestamp = new Date();
        timestamp.setHours(timestamp.getHours());
        timestamp = timestamp.toISOString();
        let receipt_id = await order_utils.receiptInsert(order_package, timestamp);
        receipt_semaphore = false;
        if(!receipt_id){
            response.status(400).send({"message": "Failed to add/retrieve receipt"});
            return;
        }
        let uid = order_package.metadata.uid;
        let delivery_time = order_package.metadata.delivery_time;
        let menu_version = order_package.metadata.menu_version;
        if (delivery_time === "now") delivery_time = timestamp;
        let customer_id = order_package.metadata.customer_id;
        order_package.orders.forEach(order=>{
            order_utils.orderInsert(receipt_id, uid, customer_id, timestamp, delivery_time, menu_version, order)
                .catch(err=>{
                    request.user_response = {"Error": err};
                })
        })
        request.user_response = {
          "Success": "Orders uploaded",
          "receipt_id": receipt_id
        };
        next();
    }
    else{
        request.user_response = {"Error": verification_check.error};
        next();
    }
  var end = new Date() - start
  hrend = process.hrtime(hrstart)
  console.info('Execution time: %dms', end)
  currently_processing -= 1;
}

async function upsertMenu (request, response){
    /*
    Creates menu based on a JSON inside the request body. 
    Sample request.body JSON:
    {
        "uid": "ch1ck3n"  // uid of restaurant,
        "menu":{
            "Mains":[
                {
                    ...
                },
                // More food items under Mains here
            ],
            "Sides":[
                {
                    ...
                },
                // More food items under Sides here
            ]
        }
    }
    If menu item does not exist, creates Menus table, Receipts table, Orders table with necessary foreign keys.
    Otherwise, appends newest menu to the existing menus table, updating the stalls(latest_menu_version) entry to reflect latest version.

    Returns:
        Success: HTTP(200) with JSON {"message":"success"}
        Fail:    HTTP(400) with JSON {"message": {error Object}}
    */
    const menu_package = request.body;
    var stall_uid = menu_package.uid;
    var stall_pw = menu_package.hashed_pw;
    let validate_package = await menu_utils.menu_validate(menu_package.menu);
    let validate_user = await menu_utils.user_validate(stall_uid, stall_pw);
    if(!validate_user){
        response.status(400).json({"message": "Invalid authentication for user ", stall_uid})
        return false;
    }
    if (validate_package[0] === true){
        response.status(400).json({"message": validate_package[1]});
        return false;
    };
    var menu_table = stall_uid+"_menu";
    var version = await menu_utils.getLatestStallMenuVersion(stall_uid);
    if(version === 0){
        response.status(400).json({"message": "Stall does not exist"});
        return false;
    }
    if(version === null || version === undefined){
        var order_table = stall_uid+"_orders";
        var receipt_table = stall_uid+"_receipts";
        console.log("Creating tables", menu_table, order_table, receipt_table);
        var menu_creation_string = format("CREATE TABLE %I( \
            id INTEGER, \
            name VARCHAR NOT NULL, \
            category VARCHAR NOT NULL, \
            in_stock BOOL NOT NULL, \
            in_menu BOOL NOT NULL, \
            base_price NUMERIC NOT NULL, \
            compulsory_options JSON[], \
            optional_options JSON[], \
            image_url VARCHAR, \
            menu_version INTEGER NOT NULL, \
            PRIMARY KEY (menu_version, id));", menu_table)
        var receipt_creation_string = format("CREATE TABLE %I ( \
            id SERIAL PRIMARY KEY, \
            customer_id INTEGER REFERENCES customers(id), \
            accepted BOOLEAN NOT NULL, \
            start_datetime timestamp NOT NULL, \
            delivery_time timestamp NOT NULL, \
            payment_datetime timestamp, \
            total_payment NUMERIC NOT NULL, \
            special_request TEXT)", receipt_table)
        var order_creation_string = format("CREATE TABLE %I ( \
            id SERIAL PRIMARY KEY, \
            item_id INTEGER NOT NULL, \
            customer_id INTEGER REFERENCES customers(id), \
            base_price NUMERIC NOT NULL, \
            total_price NUMERIC NOT NULL, \
            status_id INTEGER REFERENCES status(id), \
            start_datetime TIMESTAMP NOT NULL, \
            delivery_time TIMESTAMP NOT NULL, \
            end_datetime TIMESTAMP , \
            receipt_id INTEGER REFERENCES %I(id) NOT NULL, \
            compulsory_options JSON[], \
            optional_options JSON[], \
            menu_version INTEGER NOT NULL, \
            note VARCHAR, \
            FOREIGN KEY (item_id, menu_version) REFERENCES %I(id, menu_version))", order_table, receipt_table, menu_table, menu_table)
        var table_strings = [menu_creation_string, receipt_creation_string, order_creation_string]
        for (table_string in table_strings){
            var errored = await pool.query(table_strings[table_string], [])
            .then(results=>{
                return false;
            })
            .catch(err=>{
                console.log("Table creation", table_strings[table_string], err)
                return true
            })
            if(errored) break;
        }
        version = 1;
    }
    else {
        version = version + 1;
    }
    var categories = Object.keys(menu_package.menu);
    var menu_insertion_string = format('INSERT INTO %I(id, \
        name, \
        category, \
        in_stock, \
        in_menu, \
        base_price, \
        compulsory_options, \
        optional_options, \
        image_url, \
        menu_version) \
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', menu_table);
    var errored = false;
    categories.forEach(category=>{
        var menu_items = menu_package.menu[category];
        menu_items.forEach(row=>{
            pool.query(menu_insertion_string,
                [
                    row.id,
                    row.name, 
                    category, 
                    row.in_stock, 
                    row.in_menu, 
                    row.base_price, 
                    row.compulsory_options, 
                    row.optional_options, 
                    row.image_url, 
                    version
                ],
                (error, results) => {
                    if(error) {
                        console.log("upsertMenu", error);
                        errored = true;
                    };
                }
            )
        })
    })
    if (errored) response.status(400).json({"message": "Error during menu insert"})
    else {
        var stall_update_string = "UPDATE stalls SET latest_menu_version = $1 WHERE stalls.uid = $2"
        pool.query(stall_update_string, [version, stall_uid], (error, results)=>{
            if(error)response.status(400).json({"message": error});
            else response.status(200).json({"message": "success"});
        })
    }
}

module.exports = {
    postCustomer,
    postOrder,
    upsertMenu
}
