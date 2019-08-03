const Pool = require('pg').Pool
const fs = require('fs');

const types = require('pg').types;
types.setTypeParser(1700, function(val){
  return parseFloat(val)
})
// types.builtins.NUMERIC, parseFloat);

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
            WHERE %I.status_id >= 0 \
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
        nested_results = await pool.query(format("SELECT %I.id, customer_id, name, start_datetime as time, receipt_id as receipt, %I.compulsory_options, %I.optional_options, total_price as price, status_id as status, delivery_time FROM %I \
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

// Check is username is taken
const checkId = (request, response) => {
    let id = request.params.id;
    pool.query('SELECT * FROM customers WHERE id = $1', [id], (error, results) =>{
        if(error){
            response.status(400).send({"message": "Error"});
        }
        else{
            if(results.rows.length != 0){
                // response.statusMessage = "Username already exists, try again";
                response.status(200).send({"message": "Username is taken",
                                            "details": results.rows});
            }
            else{
                response.statusMessage = "Username does not exist yet";
                response.status(200).send({"message": "Username is free"});
            }
        }
    });
}

function getDistanceFromLatLonInKm(lat1,lon1,lat2,lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2-lat1);  // deg2rad below
    var dLon = deg2rad(lon2-lon1); 
    var a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2)
      ; 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = R * c; // Distance in km
    return d;
}
  
function deg2rad(deg) {
    return deg * (Math.PI/180)
}

const getStalls = (request, response) => {
    // As we cannot use dots in URL params, we use the character 'd'
    // E.g. latitude 1.234 -> "1d234"
    if(typeof request.params.lat !== "undefined"){
        var lat = parseFloat(request.params.lat.split('d').join('.'));
        var long = parseFloat(request.params.long.split('d').join('.'));
    }
    else{
        var lat = undefined;
        var long = undefined;
    }
    let res = pool.query('SELECT * FROM stalls INNER JOIN locations ON stalls.location = locations.id')
        .then(res=>{
            let data = res.rows
            if(typeof lat !== "undefined"){
                let distances = []
                data.forEach(stall=>{
                    if(stall.lat!=null && stall.long != null) distance = getDistanceFromLatLonInKm(lat, long, stall.lat, stall.long);
                    else distance = 999
                    distances.push({
                        'name': stall.uid,
                        'distance': distance,
                        'data': stall
                    })
                })
                distances.sort((a, b)=>{return a.distance > b.distance})
                response.status(200).send(distances.map(elem=>elem.data))
            }
            else{
                response.status(200).send(res.rows)
            }
        })
        .catch(error=>{
            console.log(error);
            response.status(400).send({"message":"invalid db request"})
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

async function getLatestMenu(uid, orderByCategory=false){
    /* 
    Handles logic for checking if menu has expired past timestamp. 
    If cached menu has expired past TTL, invoke pg function to renew.
    Otherwise, directly return cached menu
    */ 
    if(uid in cached_menus){
        // 5s ttl
        if(new Date() - cached_menus[uid]["timestamp"] < 5*1000){
            console.log("Menu cached!");
            return orderByCategory ? cached_menus[uid]["menu"] : cached_menus[uid]["idxed_menu"];
        }
    }

    const menu = await pgLoadMenu(uid);
    const menuByCategory = _orderMenuByCategory(menu);
    const menuById = _orderMenuById(menu);
    cached_menus[uid] = {
        "menu": menuByCategory,
        "idxed_menu": menuById,
        "timestamp": new Date()
    };

    return orderByCategory ? menuByCategory : menuById;
}

function _orderMenuByCategory(menu) {
    /*
    E.g.
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
    */
    if (!menu) return false;

    return menu.reduce((processedMenu, item) => {
        const { category } = item;

        if (!(category in processedMenu)) processedMenu[category] = [];
        processedMenu[category].push(item)

        return processedMenu
    }, {})
}

function _orderMenuById(menu){
    /*
    E.g.
    {
        1: {"name": "Chicken Rice", ...}
        2: {"name": ...}
    }
    */
    if (!menu) return false;

    return menu.reduce((processedMenu, item) => {
        processedMenu[item.id] = item;
        return processedMenu;
    }, {})
}

async function stalls(){
    var res = await pool.query('SELECT uid FROM stalls')
        .then((results) => {
            return results.rows;
        })
        .catch(err=>console.log(err));
    return res;
}

async function getStallMenu(request, response){
    // GET Request for menu
    // Sample request: {base_address}/menu/ch1ck3n
    const uid = request.params.uid;
    const menu = await getLatestMenu(uid, true);
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
        if(error) response.status(400).json({"message":error.detail});
        else{
            request.user_response = { "message":"Customer added successfully" };
            next();
        }
    });
}

// Dev fn
const resetOrder = (request, response, next) => {
    pool.query('UPDATE orders SET status_id=1', [], (error, results) => {
        if(error){
            console.log(error);
            throw error;
        }
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
            // Commenting this constraint as Gong Cha has identical items in the menu
            // if (item_set.has(item_name)) error_log["Formatting"].push({[item_name]:"appears more than once"});
            // else item_set.add(item_name);
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


async function retrieve(request, response){
    var order_id = request.params.order_id;
    var order = await pool.query("SELECT * FROM myx_orders INNER JOIN myx_menu ON myx_menu.id = myx_orders.item_id WHERE id = $1", [order_id])
                    .then(res=>{
                        if(res.length==0) return false;
                        return res.rows[0]
                    });
    if(!order) {
        response.status(400).json({"message": "No order id found"});
        return false;
    };
    let item_id_mapping = {
        "Black Milk Tea": 1,
        "Earl Grey Milk Tea": 2,
        "Black Milk Tea With Pearls": 3,
        "Earl Grey Milk Tea With Pearls": 4,
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
            .then(res=>{console.log(res); return true})
            .catch(err=>{console.log(err); return false});
        if(update_shelf) {
            pool.query('UPDATE myx_orders SET status_id = 4 WHERE myx_orders.id = $1', [order_id], (error, results) => {
                if(error){
                  console.log(error);
                  response.status(400).send({"Error": error.detail});
                }
                request.user_response = {
                  "message":"Orders transitioned",
                  "order": order_id,
                  "new_status": order_status
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
    let slot = pool.query('SELECT * FROM shelving WHERE drink = 0 ORDER BY slot ASC LIMIT 1', [])
        .then(res=>{
            console.log("Deposited", shelf, item_cat);
            return res.slot;
        })
        .catch(err=>{
            console.log(err) ;
            return false;
        });
    if(!slot) response.status(400).send({"Error": err});
    else{
        let success = pool.query('UPDATE shelving SET drink = $1 WHERE slot = $2', [item_cat, slot])
            .then(res=>{
                console.log("Drink updated", res);
                return true
            })
            .catch(err=>{
                console.log(err);
                return false;
            })
        if(!success) response.status(400).send({"Error": err});
        else {
            request.shelf_data = {
                'slot': shelf.slot,
                'direction': 1
            }
            next();
        }
    }
}


async function user_validate(uid,pw){
    var stall_row = await pool.query("SELECT * FROM stalls WHERE uid = $1", [uid])
        .then(res =>{
            if(res.length == 0) return false;
            return res.rows[0]
        })
    if(!stall_row) return false;
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
    if(version === null || version === undefined){
        var order_table = stall_uid+"_orders";
        var receipt_table = stall_uid+"_receipts";
        console.log("Creating tables", menu_table, order_table, receipt_table);
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
            accepted BOOLEAN NOT NULL, \
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
                return false;
            })
            .catch(error=>{
                response.status(400).json({"message": error});
                return true;
            });            
            if(errored) break;
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
    let menu = await getLatestMenu(stall_uid, false);
    if(metadata.menu_version != menu[Object.keys(menu)[0]].menu_version) {
        return {
            status:false,
            error:"User menu version not same as latest DB",
            payment:0
        }
    };
    for(i in items){
        let item_id = items[i]["item_id"];
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

async function order_insert(receipt_id, uid, customer_id, start_time, delivery_time, menu_version, order){
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
async function receipt_insert(order_package, timestamp){
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
                            console.log("Receipt added")
                            return misc_res;
                        })
                        .catch(err=>{
                            return false;
                        });
    if(!add_receipt) return false;
    let receipt = await pool.query(format("SELECT id FROM %I_receipts WHERE customer_id = $1 ORDER BY start_datetime DESC LIMIT 1", uid), [order_metadata.customer_id])
                    .then(results=>{
                        let receipt_id = results.rows[0].id;
                        return receipt_id;
                    })
                    .catch((err=>{
                        return false;
                    }))
    receipt_semaphore = false;
    return receipt;
}

async function postOrder(request, response, next){
    // Layer 1: Verify options are valid, payment amounts are legitimate
    let verification_check = await verifyOrder(request.body).catch(error=>{
        console.log(error);
        response.status(400).send({"message": "Verification check failed for order"});
        next()
    });
    // === true is for readability Yustynn dont judge me
    if(verification_check.status === true){
        let order_package = request.body;
        var timestamp = new Date();
        timestamp.setHours(timestamp.getHours()+8);
        timestamp = timestamp.toISOString();
        let receipt_id = await receipt_insert(order_package, timestamp);
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
            order_insert(receipt_id, uid, customer_id, timestamp, delivery_time, menu_version, order)
                .then(res=>{
                    console.log(res);
                })
                .catch(err=>{
                    request.user_response = {"Error": err};
                })
        })
        request.user_response = {"Success": "Orders uploaded"};
        next();
    }
    else{
        request.user_response = {"Error": verification_check.error};
        next();
    }
}


async function transitionOrder(request, response, next){
  var order_info = request.body;
  let order_status = order_info.status_id;
  let uid = request.params.uid;
  let order_id = request.params.orderid;
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
    // Returns all orders in a dictionary organized by stall
    let res = await getAllOrders();
    orders = []
    let stalls = Object.keys(res);
    stalls.forEach(stall=>{
        res[stall].forEach(order=>{
            order['stall_id'] = stall
            orders.push(order)
        })
    })    
    response.status(200).json(orders);
}

async function favoriteStall(request, response){
    // PUT request for updating of favorite stalls
    var payload = request.body;
    let customer_id = payload.customer_id;
    let stall_uid = payload.stall_uid;
    let status = payload.status;
    let current_favorites = await pool.query('SELECT favorites FROM customers WHERE id = $1', [customer_id])
                                    .catch(err=>{
                                        console.log(err)
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
  checkId,
  createCustomer,
  favoriteStall,
  findLatestMenu: getLatestMenu,
  getAllOrderDetails,
  getCustomerOrders,
  getCustomers,
  getLiveOrders,
  getLocations,
  getPaylahUrl,
  getStallMenu,
  getStallOrders,
  getStalls,
  stalls,
  postOrder,
  putReceiptStatus,
  putStock,
  resetOrder, // UTIL
  transitionOrder, // PUT
  upsertMenu,
  retrieve,
  depositItem
}
