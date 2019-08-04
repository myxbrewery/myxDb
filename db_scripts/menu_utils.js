const pool = require('./pool').pool
const format = require('./pool').format

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

async function menu_validate(menu){
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

    var fields = ["id", "name", "in_stock", "in_menu", "base_price", "compulsory_options", "optional_options", "image_url"];
    categories.forEach(category=>{
        if(typeof(category)!=="string"){
            let field_name = "Category " + category;
            error_log["Formatting"].push({[field_name]: "Must be type string"});
        }
        menu[category].forEach(item=>{
            // Commenting this constraint as Gong Cha has identical items in the menu
            // if (item_set.has(item_name)) error_log["Formatting"].push({[item_name]:"appears more than once"});
            // else item_set.add(item_name);
            let field_type_assoc = {
                "id":new Set(["number"]),
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

var cached_menus = {}

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

async function getLatestStallMenuVersion(stallUid){
    // Returns latest value as found in the "stalls" table (latest_menu_version column)
    var version = await pool.query('SELECT * FROM stalls \
        WHERE uid = $1', [stallUid])
        .then((results) => {
            if(results.rows.length == 0) return 0;
            return results.rows[0].latest_menu_version;
        })
        .catch(err=>console.log("Lateststallmenuversion", err));
    return version;
};

module.exports = {
    _orderMenuByCategory,
    _orderMenuById,
    getLatestMenu,
    getLatestStallMenuVersion,
    pgLoadMenu,
    user_validate,
    menu_validate
}