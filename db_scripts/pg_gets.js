const pool = require('./pool').pool
const format = require('./pool').format
const order_utils = require('./order_utils')
const menu_utils = require('./menu_utils')

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
    let res = await order_utils.getAllOrders();
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

async function stalls(){
    var res = await pool.query('SELECT uid FROM stalls')
        .then((results) => {
            return results.rows;
        })
        .catch(err=>console.log("stalls()", err));
    return res;
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
    let res = pool.query('SELECT stalls.id, stalls.name, stalls.halal, stalls.opening_time, stalls.closing_time, stalls.image_url, icon_url, uid, card_settings, latest_menu_version, waiting_time, description, price, tags, lat, long FROM stalls INNER JOIN locations ON stalls.location = locations.id')
        .then(res=>{
            let data = res.rows
            if(typeof lat !== "undefined"){
                let response_data = []
                data.forEach(stall=>{
                    if(stall.lat!=null && stall.long != null) distance = getDistanceFromLatLonInKm(lat, long, stall.lat, stall.long);
                    else distance = 999
                    let tmp_stall_data = stall;
                    tmp_stall_data.distance = distance;
                    response_data.push(tmp_stall_data);
                })
                response_data.sort((a, b)=>{return a.distance > b.distance})
                response.status(200).send(response_data)
            }
            else{
                response.status(200).send(res.rows)
            }
        })
        .catch(error=>{
            console.log("getStalls", error);
            response.status(400).send({"message":"invalid db request"})
        })
}

async function getStallMenu(request, response){
    // GET Request for menu
    // Sample request: {base_address}/menu/ch1ck3n
    const uid = request.params.uid;
    const menu = await menu_utils.getLatestMenu(uid, true);
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

async function getCustomerOrders(request, response){
    let customer_id = request.params.customer_id;
    console.log("Requesting Customer Orders for customer", customer_id);
    let all_orders = await order_utils.getAllOrders();
    let stalls = Object.keys(all_orders)
    res = []
    stalls.forEach(stall=>{
        let orders = all_orders[stall];
        orders.forEach(order=>{
            if(order.customer_id == customer_id){
                let tmp_order = order;
                tmp_order.stall_uid = stall;
                res.push(tmp_order);
            }
        });
    });
    response.status(200).send(res)
}

module.exports = {
    getAllOrderDetails,
    getCustomerOrders,
    getStallMenu,
    getLocations,
    getPaylahUrl,
    getStallOrders,
    getStalls,
    checkId,
    stalls
}