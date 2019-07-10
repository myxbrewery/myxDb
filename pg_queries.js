const Pool = require('pg').Pool
const fs = require('fs');

const types = require('pg').types;
types.setTypeParser(types.builtins.NUMERIC, parseFloat);

var format = require('pg-format');

var credentials = require('./.credentials.json');

var cached_menus = {}

const pool = new Pool({
  user: credentials.user,
  host: credentials.host,
  database: credentials.database,
  password: credentials.password,
  port: 5432,
})

// Temp: remove in prod
const getCustomers = (request, response) => {
  pool.query('SELECT * FROM customers ORDER BY id ASC', (error, results)=>{
    if(error){
      throw error;
    }
    response.status(200).json(results.rows);
  })
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
        nested_results = await pool.query(format("SELECT * FROM %I \
            INNER JOIN %I ON %I.item_id = %I.id \
            WHERE %I.status_id >= 1 \
            AND %I.start_datetime >= now()::date\
            ORDER BY %I.start_datetime DESC", 
            stall_orders, stall_menu, stall_orders, stall_menu, stall_orders, stall_orders, stall_orders), 
            [])
            .then(results=>{return results.rows;})
            .catch(error =>{throw error});
        res[stall_uid] = nested_results;
    }
    return res;
}


async function getCustomerOrders(request, response){
    let customer_id = request.params.customer_id;
    console.log("Requesting Customer Orders for customer", customer_id);
    let all_orders = await getAllOrders();
    let stalls = Object.keys(all_orders)
    res = {}
    stalls.forEach(stall=>{
        let stall_orders = all_orders[stall]
        stall_orders.forEach(stall_order=>{
            if(stall_order.customer_id == customer_id){
                if(!(stall in res)) res[stall] = []
                res[stall].push(stall_order)
            }
        })
    })
    response.status(200).send(res)
}


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
        nested_results = await pool.query(format("SELECT %I.id, customer_id, name, start_datetime as time, receipt_id as receipt, total_price as price, status_id as status, delivery_time FROM %I \
            INNER JOIN %I ON %I.item_id = %I.id \
            WHERE %I.status_id >= 0 \
            AND %I.start_datetime >= now()::date\
            ORDER BY %I.start_datetime DESC", 
            stall_orders, stall_orders, stall_menu, stall_orders, stall_menu, stall_orders, stall_orders, stall_orders), 
            [])
            .then(results=>{return results.rows;})
            .catch(error =>{throw error});
        res[stall_uid] = nested_results;
    }
    return res;
}

// Check is username is taken
const checkId = (request, response) => {
  let id = request.params.id;
  pool.query('SELECT * FROM customers WHERE id = $1', [id], (error, results) =>{
    if(error){
      response.status(400).send({"message": "Error"});
      // throw error;
    }
    else{
      if(results.rows.length != 0){
        // response.statusMessage = "Username already exists, try again";
        response.status(200).send({"message": "Username is taken"});
      }
      else{
        response.statusMessage = "Username does not exist yet";
        response.status(200).send({"message": "Username is free"});
      }
    }
  });
}

// Get all stalls
const getStalls = (request, response) => {
    let location = request.params.location;
    let res = pool.query('SELECT uid FROM stalls')
        .catch(error=>{
            console.log(error);
            response.status(400).send({"message":"invalid db request"})
        })
        .then(res=>{
            console.log(res.rows);
            response.status(200).send(res.rows)
        })
    
}

const getLocations = (request, response) => {
    // Get all locations. To be refined based on proximity to user
    pool.query('SELECT * FROM locations')
        .then((results) => {
        response.status(200).json(results.rows);
    })
    .catch((err) => {
        console.log(err);
        response.status(400);
    });
}

async function getLatestStallMenuVersion(stallUid){
    // Returns latest value as found in the "stalls" table (latest_menu_version column)
    var version = await pool.query('SELECT * FROM stalls \
        WHERE uid = $1', [stallUid])
        .then((results) => {
            // console.log(results.rows);
            if(results.rows.length == 0) return 0;
            return results.rows[0].latest_menu_version;
        })
        .catch(err=>console.log(err));
    return version;
};

async function pgLoadMenu(uid){
    // Queries PostgreSQL db custom table for menu where menu version is the latest value
    var stall_menu = uid+"_menu";
    var version = await getLatestStallMenuVersion(uid);
    if (version === -1) return -1;
    else if (!version) return false;
    else{
        var table_request_query = format("SELECT * FROM %I WHERE menu_version = $1 ORDER BY id ASC", stall_menu);
        var menu = await pool.query(table_request_query, [version])
            .then(results => {
                return results
            })
            .catch(error => {
                throw error;
            });
        return menu.rows;
    }
}

async function findLatestMenu(uid){
    /* 
    Handles logic for checking if menu has expired past timestamp. 
    If cached menu has expired past TTL, invoke pg function to renew.
    Otherwise, directly return cached menu
    */ 
    if(uid in cached_menus){
        // 5s ttl
        if(new Date() - cached_menus[uid]["timestamp"] < 5*1000){
            console.log("Menu cached!")
            return [cached_menus[uid]["menu"], cached_menus[uid]["idxed_menu"]];
        }
    }
    var menu = await pgLoadMenu(uid);
    let processed_menu = await postprocess_menu(menu);
    cached_menus[uid] = {
        "menu": processed_menu[0],
        "idxed_menu": processed_menu[1],
        "timestamp": new Date()
    };
    return processed_menu;
}

async function postprocess_menu(menu){
    /* 
    Menu is a list of rows returned from PG database. 
    For the purpose of our functionalities, we want two different formats:
    One: For consumers, organize by category
    {
        "Mains":{
            "id": 1,
            "name": "Chicken Rice"
            "base_price":...
        },
        "Sides:{
            "id": 25,
            "name":...
        }
    }
    Two: For quick calculation and verification, order by ID (as K/V pairs)
    {
        1: {"name": "Chicken Rice", ...}
        2: {"name": ...}
    }
    Returns both as an index
    */
    if(!menu) return [false, false]
    var returnable_menu = {}
    var id_indexed_menu = {}
    menu.forEach(item=>{
        if(!(item.category in returnable_menu)){
            returnable_menu[item.category] = []
        }
        returnable_menu[item.category].push(item)
        id_indexed_menu[item.id] = item;
    })
    return [returnable_menu, id_indexed_menu]
}


async function getStallMenu(request, response){
    // GET Request for menu
    // Sample request: {base_address}/menu/ch1ck3n
    const uid = request.params.uid;
    let full_menus = await findLatestMenu(uid);
    // 0 index is the customer facing categorized menu
    let menu = full_menus[0]
    if (menu === -1 || !menu) response.status(400).json({"message":"No stall found; errored"});
    else if (menu === -2) response.status(400).json({"message":"Failed to retrieve menu"});
    else response.status(200).json(menu);
}

// Get all orders for this stall
const getStallOrders = (request, response) => {
    let uid = request.params.uid;
    let pw_hash = request.params.pw_hash;
    let orders_table = uid+"_orders";
    pool.query(format('SELECT * FROM %I', orders_table), [], (error, results) =>{
        if(error) throw error;
        response.status(200).json(results.rows)
    });
}

const createCustomer = (request, response, next) => {
    const user_details = request.body;
    pool.query('INSERT INTO customers (id, email, age, name, image, diet) VALUES ($1, $2, $3, $4, $5, $6)', [user_details.id, user_details.email, user_details.age, user_details.name, user_details.image, user_details.diet], (error, results) => {
        if(error) response.status(400).json({"message":error});
        request.user_response = { "message":"Customer added successfully" };
        next();
    });
}

// Dev fn
const resetOrder = (request, response, next) => {
    pool.query('UPDATE orders SET status_id=1', [], (error, results) => {
        if(error){
            console.log(error);
            throw error;
        }
        console.log(results);
    });
    request.user_response = {
        "message":"All orders reset;",
    };
    next();
}

const menu_validate = (menu) => {
    /* 
    Ensure all elements in menu are valid
    Parses items in menu to verify various aspects
    1. Entry length < 50
    2. Numeric values non-negative
    3. Presence of all necessary fields ["name", "in_stock", "in_menu", "compulsory_options", "optional_options"]
    4. Proper formatting of menu JSON (eg. Compulsory options is a list[] of dictionaries. Options within dictionaries must be lists)
    5. No duplicate entries
    6. All fields must be correct types
    */
    var error_log = {
        "Field Rules": [],
        "Name Rules": [],
        "Formatting": []
    };
    var categories = Object.keys(menu);
    var item_set = new Set();

    var fields = ["name", "in_stock", "in_menu", "base_price", "compulsory_options", "optional_options", "image_url"];
    categories.forEach(category=>{
        if(typeof(category)!=="string"){
            let field_name = "Category " + category;
            error_log["Formatting"].push({[field_name]: "Must be type string"});
        }
        menu[category].forEach(item=>{
            let item_name = item["name"];
            if (item_set.has(item_name)) error_log["Formatting"].push({[item_name]:"appears more than once"});
            else item_set.add(item_name);
            let field_type_assoc = {
                "name":new Set(["string"]),
                "in_stock":new Set(["string"]),
                "in_menu":new Set(["string"]),
                "base_price": new Set(["number"]),
                "compulsory_options": new Set(["object"]),
                "optional_options": new Set(["object"]),
                "image_url":new Set(["string"])
            }
            // Ensure fields are in our list of expected list, no more, no less
            let item_fields = Object.keys(item);
            item_fields.forEach(item_field=>{
                let error_name = item["name"]+" "+item_field;
                if(!(item_field in field_type_assoc)) {
                    error_log["Field Rules"].push({
                        [error_name]:"Not in fields"
                    })
                }
                // Ensure all are correct type
                // console.log(typeof(item[item_field]), field_type_assoc[item_field])
                // console.log(typeof(item[item_field])field_type_assoc[item_field])
                if(!(field_type_assoc[item_field].has(typeof(item[item_field])))){
                    let error_message = "Must be type " + field_type_assoc[item_field].join(" or ");
                    error_log["Field Rules"].push({[error_name]:error_message})
                }
            });
            let boolean_fields = ["in_stock", "in_menu"];
            boolean_fields.forEach(boolean_field=>{
                let error_name = item["name"]+" "+boolean_field;
                if(item[boolean_field]!== "TRUE" && item[boolean_field]!== "FALSE"){
                    error_log["Field Rules"].push({[error_name]: "Must be 'TRUE' or 'FALSE'"})
                };
            })
            fields.forEach(field=>{
                if (!(item_fields.includes(field))){
                    let error_message = "Missing field " + field;
                    error_log["Field Rules"].push({[item["name"]]: error_message})
                }
            });
            let error_name = item["name"] + " base price"
            if (item["base_price"] < 0) {
                error_log["Formatting"].push({[error_name]: "Must be more than 0"})
            };
            // console.log(item["compulsory_options", "optional_options"]);
            ["compulsory_options", "optional_options"].forEach(option_cat=>{
                if(item[option_cat].length!=0){
                    let error_name = item + " " + option_cat
                    item[option_cat].forEach(entry=>{
                        if (!("name" in entry)) error_log["Field Rules"].push({[error_name]: "Missing field 'name'"});
                        if (!("options" in entry)) error_log["Field Rules"].push({[error_name]: "Missing field 'options'"});
                        if (entry["options"].length == 0) error_log["Field Rules"].push({[error_name]: "Options field 0 length"});
                        else{
                            let error_name = item + " " + option_cat + " options"
                            entry["options"].forEach(option=>{
                                if (!("name" in option)) error_log["Field Rules"].push({[error_name]: "Missing field 'name'"});
                                if (!("cost" in option)) error_log["Field Rules"].push({[error_name]: "Missing field 'cost'"});
                                if (typeof(option["cost"]) !== "number" || option["cost"] < 0) {
                                    error_log["Field Rules"].push({[error_name]: "Cost must be nonzero numerical value"})
                                }
                            })
                        }
                    })
                }
            })
        })
    })
    var errored = false;
    let possible_errors = Object.keys(error_log);
    possible_errors.forEach(possible_error => {
        if(error_log[possible_error].length != 0) errored = true
    });
    return [errored, error_log]
}


async function user_validate(uid,pw){
    var stall_row = await pool.query("SELECT * FROM stalls WHERE uid = $1", [uid])
        .then(res =>{
            return res.rows[0]
        })
    if(pw == stall_row.hashed_pw) return true;
    return false; 
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
    let validate_package = menu_validate(menu_package.menu);
    let validate_user = await user_validate(stall_uid, stall_pw);
    if(!validate_user){
        response.status(400).json({"message": "Invalid authentication for user ", stall_uid})
        return false;
    }
    if (validate_package[0] === true){
        response.status(400).json({"message": validate_package[1]});
        return false;
    };
    var menu_table = stall_uid+"_menu";
    var version = await getLatestStallMenuVersion(stall_uid);
    if(version === 0){
        response.status(400).json({"message": "Stall does not exist"});
        return false;
    }
    console.log("HELLO WORLD", version)
    if(version === null || version === undefined){
        console.log("Creating tables", menu_table, order_table, receipt_table);
        var order_table = stall_uid+"_orders";
        var receipt_table = stall_uid+"_receipts";
        var menu_creation_string = format("CREATE TABLE %I( \
            id SERIAL PRIMARY KEY, \
            name VARCHAR NOT NULL, \
            category VARCHAR NOT NULL, \
            in_stock BOOL NOT NULL, \
            in_menu BOOL NOT NULL, \
            base_price NUMERIC NOT NULL, \
            compulsory_options JSON[], \
            optional_options JSON[], \
            image_url VARCHAR, \
            menu_version INTEGER);", menu_table)
        var receipt_creation_string = format("CREATE TABLE %I ( \
            id SERIAL PRIMARY KEY, \
            customer_id INTEGER REFERENCES customers(id), \
            paid BOOLEAN NOT NULL, \
            start_datetime timestamp NOT NULL, \
            delivery_time timestamp NOT NULL, \
            payment_datetime timestamp, \
            total_payment NUMERIC NOT NULL, \
            special_request TEXT)", receipt_table)
        var order_creation_string = format("CREATE TABLE %I ( \
            id SERIAL PRIMARY KEY, \
            item_id INTEGER REFERENCES %I(id), \
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
            menu_version INTEGER, \
            note VARCHAR)", order_table, menu_table, receipt_table)
        var table_strings = [menu_creation_string, receipt_creation_string, order_creation_string]
        for (table_string in table_strings){
            var errored = await pool.query(table_strings[table_string], [])
            .then(results=>{
                console.log("Table created");
                return false;
            })
            .catch(error=>{
                response.status(400).json({"message": error});
                return true;
            });            
            if(errored) break;
            else console.log(errored);
        }
        version = 1;
    }
    else {
        version = version + 1;
    }
    var categories = Object.keys(menu_package.menu);
    var menu_insertion_string = format('INSERT INTO %I(name, \
        category, \
        in_stock, \
        in_menu, \
        base_price, \
        compulsory_options, \
        optional_options, \
        image_url, \
        menu_version) \
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',menu_table);
    var errored = false;
    categories.forEach(category=>{
        var menu_items = menu_package.menu[category];
        menu_items.forEach(row=>{
            pool.query(menu_insertion_string,
                [
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
                        console.log(error);
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

async function verifyOrder(order_package){
    /*
    Verifies order; check if amount is correct
    */
    let metadata = order_package.metadata;
    let items = order_package.orders;
    var total_payment = 0
    let stall_uid = metadata.uid;
    let full_menus = await findLatestMenu(stall_uid);
    let menu = full_menus[1]
    for(i in items){
        let item_id = items[i]["item_id"];
        console.log(menu[item_id])
        console.log(items[i])
        if(items[i]["base_price"] != menu[item_id]["base_price"]){
            // console.log("Menu base price unequal to Customer base price");
            return {
                status:false,
                error:"Menu base price unequal to Customer base price",
                payment:0
            }
        }
        total_payment += parseFloat(items[i]["base_price"]) * 100
        if(metadata.menu_version != menu[item_id].menu_version) {
            console.log("Menu version mismatch")
            return {
                status:false,
                error:"User menu version not same as latest DB",
                payment:0
            }
        };
        // Payment consolidation for compulsory options
        if(items[i]["compulsory_options"].length != menu[item_id]["compulsory_options"].length) {
            // console.log("Different number of compulsory options supplied from actual")
            // console.log(items[i]["compulsory_options"])
            // console.log("VERSUS")
            // console.log(menu[item_id]["compulsory_options"])
            return {
                status:false,
                error:"Different number of compulsory options supplied from actual",
                payment:0
            }
        };
        let compulsory_choices = Object.keys(menu[item_id]["compulsory_options"])
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
                console.log(category["name"], "VERSUS", user_option_category["name"])
                // "Choice of Noodles" == "Choice of Noodles"
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
        let optional_choices = Object.keys(menu[item_id]["optional_options"])
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
                // "Choice of Noodles" == "Choice of Noodles"
                if(category["name"] === user_option_category["name"]){
                    optional_category_exists = true;
                    for(k in category["options"]){
                        let category_option = category["options"][k];
                        // "Noodle" == "Noodle"
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

async function order_insert(receipt_id, uid, customer_id, start_time, delivery_time, order){
    let menu_query = format('INSERT INTO %I_orders (\
        item_id, customer_id, base_price, total_price, status_id, start_datetime, delivery_time, \
        receipt_id, compulsory_options, optional_options, menu_version, note) \
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)', uid)
    res = await pool.query(menu_query,
            [order.item_id, customer_id, order.base_price,
            order.total_price, 0, start_time, delivery_time, 
            receipt_id, order.compulsory_options,
            order.optional_options, order.menu_version, order.note])
        .catch(err=>{
            console.log("Failed to add to orders")
            throw err;
        })
    return order.item_id + " Successfully added";
}

var receipt_semaphore = false
async function receipt_insert(order_package, timestamp){
    while(receipt_semaphore);
    receipt_semaphore = true;
    let order_metadata = order_package.metadata;
    let uid = order_metadata.uid;
    let delivery_time = order_metadata.delivery_time;
    if (delivery_time === "now") delivery_time = timestamp;
    let receipt_query = format('INSERT INTO %I_receipts (customer_id, paid, start_datetime, delivery_time, total_payment, special_request) \
                                VALUES ($1, $2, $3, $4, $5, $6)', uid)
    let add_receipt = await pool.query(receipt_query, 
                    [order_metadata.customer_id, false, timestamp,
                    delivery_time, order_metadata.total_payment,
                    order_metadata.special_request])
                        .then((misc_res)=>{
                            console.log("Receipt added")
                            return misc_res;
                        })
                        .catch(err=>{
                            console.log(err);
                            return false;
                        });
    if(!add_receipt) return false;
    let receipt = await pool.query(format("SELECT id FROM %I_receipts WHERE customer_id = $1 ORDER BY start_datetime DESC LIMIT 1", uid), [order_metadata.customer_id])
                    .then(results=>{
                        let receipt_id = results.rows[0].id;
                        return receipt_id;
                    })
                    .catch((err=>{
                        console.log(err);
                        return false;
                    }))
    receipt_semaphore = false;
    return receipt;
}

async function post_order(request, response, next){
    // Layer 1: Verify options are valid, payment amounts are legitimate
    let verification_check = await verifyOrder(request.body).catch(error=>{
        console.log(error);
        response.status(400).send({"message": "Verification check failed for order"});
        return;
    });
    console.log(verification_check);
    // == true just for readability
    if(verification_check.status === true){
        let order_package = request.body;
        var timestamp = new Date();
        timestamp.setHours(timestamp.getHours()+8);
        timestamp = timestamp.toISOString();
        let receipt_id = await receipt_insert(order_package, timestamp);
        receipt_semaphore = false;
        if(!receipt_id){
            // request.user_response = {"Error": "Failed to add/retrieve receipt"};
            response.status(400).send({"message": "Failed to add/retrieve receipt"});
            // next();
            return;
        }
        let uid = order_package.metadata.uid;
        let delivery_time = order_package.metadata.delivery_time;
        if (delivery_time === "now") delivery_time = timestamp;
        let customer_id = order_package.metadata.customer_id;
        order_package.orders.forEach(order=>{
            order_insert(receipt_id, uid, customer_id, timestamp, delivery_time, order)
                .then(res=>{
                    console.log(res);
                })
                .catch(err=>{
                    request.user_response = {"Error": err};
                })
        })
        next();
    }
    else{
        request.user_response = {"Error": verification_check.error};
        next();
    }
}

const verifyOrderValue = (order_package) => {
  let metadata = order_package.metadata;
  let items = order_package.orders;
  var total_payment = 0
  var location_id = metadata.location_id;
  var stall_id = metadata.stall_id;
  items.forEach((item) => {
    let item_id = item.item_id;
    let menu_item = menu[location_id][stall_id][item_id];

    // Verify user supplies compulsory categories equal to number of compulsory categories required
    let user_compulsory_options = Object.keys(item["compulsory_options"]);
    if(Object.keys(menu_item["compulsory_options"]).length != user_compulsory_options.length){;
      console.log("Menu item " + menu_item.name + " requires n compulsory options; got m")
      console.log(menu_item["compulsory_options"]);
      console.log(item["compulsory_options"]);
    }

    // Add user compulsory categories' cost
    user_compulsory_options.forEach((option_category)=>{
      if(option_category in menu_item["compulsory_options"]){
        let chosen_options = Object.keys(item["compulsory_options"][option_category]);
        // Must only supply one compulsory option (eg bee hoon or kuay teow)
        // Might need to branch to 2 for things like Western's 2 free sides
        if(chosen_options.length != 1){
          console.log("Chosen option should be length 1; I got " + chosen_options);
        }
        chosen_options.forEach((option)=>{
          if(option in menu_item["compulsory_options"][option_category]){
            total_payment += menu_item["compulsory_options"][option_category][option]["cost"];
          }
          else{
            console.log("User-provided compulsory option is not in possible compulsory option choice");
          }
        });
      }
      else{
        console.log("Compulsory option category " + option_category + " not found for item " + item.name);
      }
    });

    // Add user optional categories' cost
    let user_optional_options = Object.keys(item["optional_options"]);
    user_optional_options.forEach((option_category)=>{
      if(option_category in menu_item["optional_options"]){
        let chosen_options = Object.keys(item["optional_options"][option_category]);
        chosen_options.forEach((option)=>{
          if(option in menu_item["optional_options"][option_category]){
            total_payment += menu_item["optional_options"][option_category][option]["cost"];
          }
          else{
            console.log("User-provided optional option is not in possible optional option choice");
          }
        });
      }
      else{
        console.log("Optional option category " + option_category + " not found for item " + item.name);
      }
    });

    if(metadata.client_type == "school"){
      total_payment += parseFloat(menu[location_id][stall_id][item_id].school_price);
    }
    else if (metadata.client_type == "public"){
      total_payment += parseFloat(menu[location_id][stall_id][item_id].public_price);
    }
    else {
      return "Invalid client type"
    }
  });
  total_payment = parseFloat(total_payment.toPrecision(7))
  console.log(`Server computed total cost: ${total_payment}`)
  console.log(`Client computed total cost: ${metadata.total_payment}`)
  if(total_payment != metadata.total_payment){
    console.log("Payment Mismatch!")
    return false;
  }
  else{
    console.log("Payment Correct!")
    return true;
  }
}

var semaphore = false;

const submitOrder = (request, response, next) => {
  // for(var i=1;i<1000;i++){
  //   let pl_value = parseFloat(i)/10.0;
  //   let url="$"+pl_value;
  //   pool.query('INSERT INTO paylah_url(value, url) VALUES ($1, $2)', [pl_value, url], (error, results)=>{});
  // }
  // Order price parsing is not done from customer end, for security purposes.
  // Customer sends a batched order, a list of items with specific settings.
  // He sees price locally (computed on front-end) but we DO NOT REFER TO THIS VALUE as the proper price. It is primarily for customer's reference only.
  // We parse the received order, referring to our database to calculate price of each item ordered
  // We sum up price, then dissect each order and insert into the orders table ourselves
  // We then return them a response of how much they are to pay, and the relevant QR code.
  // Semaphore is used for protection against race conditions
  while(semaphore);
  var order_package = request.body;
  if(verifyOrderValue(order_package)){
    semaphore = true;
    // INSERT INTO receipts(customer_id, paid, start_date, total_payment) VALUES (1, false, '2018-03-20 01:01:01', 15.30);
    var timestamp = new Date();
    timestamp.setHours(timestamp.getHours()+8);
    timestamp = timestamp.toISOString();
    pool.query('INSERT INTO receipts (customer_id, paid, start_date, total_payment) VALUES ($1, $2, $3, $4)', [order_package.metadata.customer_id, false, timestamp, order_package.metadata.total_payment])
      .then((res) =>{
        console.log("Receipt Added")
        pool.query('SELECT id FROM receipts WHERE customer_id = $1 ORDER BY id DESC LIMIT 1', [order_package.metadata.customer_id])
        .then((results)=>{
          semaphore = false;
          var receipt_id = results.rows[0].id;
          pool.query('SELECT * FROM paylah_url WHERE value = $1', [parseFloat((order_package.metadata.total_payment-0.2).toPrecision(7))], (error, results) =>{
            if(error){
              request.user_response = {"Error": "Missing parameters"};
              next();
            }
            else if(results.rows.length == 0){
              request.user_response = {"Error": "Missing Paylah URL: " + order_package.metadata.total_payment};
              next();
            }
            else {
              console.log("Paylah URL retrieved");
              request.user_response = {
                "paylah_url":results.rows[0],
                "receipt_id":receipt_id
              };
              order_package.orders.forEach((order)=>{
                // TODO: Status_id should start at 0; using 1 as placeholder while working with paylah api
                pool.query('INSERT INTO orders(stall_id, item_id, customer_id, base_price, total_price, compulsory_options, optional_options, status_id, start_datetime, receipt_id, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', [order.stall_id, order.item_id, order_package.metadata.customer_id, order.base_price, order.total_price, order.compulsory_options, order.optional_options, 1, timestamp, receipt_id, order.note], (error, res) => {
                  if(error){
                    console.log(error);
                    request.user_response = {"Error": "Missing parameters"};
                    next();
                  }
                });
              });
              next();
            }
          });
        })
      })
      .catch((error)=>{
        console.log(error);
        response.status(400).send({"Error": error.detail});
      });
  }
  else{
    response.status(400).send({"Error": "Payment Mismatch?"});
  }
}

const transitionOrder = (request, response, next) => {
  var order_info = request.body;
  let order_status = order_info.status_id;
  let order_id = order_info.id;
  let stall_uid = order_info.uid;
  pool.query(format('UPDATE %I_orders SET status_id = $1 WHERE %I_orders.id = $2', stall_uid, stall_uid), [order_status, order_id], (error, results) => {
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

const receiptPaid = (request, response, next) => {
  // const receipt = parseInt(request.params.receipt_id);
  const order_details = request.body;
  pool.query('UPDATE orders SET status_id = $1 WHERE orders.receipt_id = $2', [1, order_details.receipt_id], (error, results) => {
    if(error){
      console.log(error);
      response.status(400).send({"Error": error.detail});
    }
    else{
      request.user_response = {
        "message":"Receipt paid",
        "receipt": order_details.receipt_id,
      };
      next();
    }
  })
}

const getPaylahUrl = (request, response) => {
  const {payment_value} = parseFloat(request.params.cost);
  pool.query('SELECT * FROM paylah_url WHERE paylah_url.value = $1', [payment_value-0.2], (error, results) => {
    if(error){
      response.status(400).send({"Error": error.detail});
    }
    else{
      response.status(200).send({"status": true});
    }
  })
}

async function getAllOrderDetails(request, response){
    let res = await getAllOrders();
    orders = []
    let stalls = Object.keys(res);
    stalls.forEach(elem=>{
        res[stalls].forEach(order=>{
            order['stall_id'] = elem
            orders.push(order)
        })
    })    
    response.status(200).json(orders);
  }

module.exports = {
  getLocations,
  getStalls,
  getStallMenu,
  getPaylahUrl,
  getLiveOrders,
  getStallOrders,
  getCustomerOrders,
  createCustomer,
  checkId,
  getCustomers,
  submitOrder,
  transitionOrder,
  receiptPaid,
  resetOrder,
  getAllOrderDetails,
  upsertMenu,
  post_order
}
