const Pool = require('pg').Pool
const assert = require('assert');
const fs = require('fs');

var credentials = require('./credentials.json');

const pool = new Pool({
  user: credentials.user,
  host: credentials.host,
  database: credentials.database,
  password: credentials.password,
  port: 5432,
})

var menu = {};
// Fetch menu from postgres
// Alternatively we could do this once on the outside? Store menu in RAM of server and don't waste I/Os?
// Hmmm.....
pool.query('SELECT * FROM items', (error, results)=>{
  if(error){
    console.log(error);
    throw(error);
    // throw error;
  }
  // Convert array of dict entries into dictionary of index for O(1) access time for n items in the menu
  // Otherwise we'd have to go through the menu n times for n items, string-comparing for items until we find a match and extract a prize
  results.rows.forEach(menu_item=>{
    let location = menu_item.location_id;
    let stall = menu_item.stall_id;
    let food_id = menu_item.id;
    if (!(location in menu)){
      menu[location] = {};
    }
    if (!(stall in menu[location])){
      menu[location][stall] = {};
    }
    menu[location][stall][food_id] = menu_item;
  });
});

// Temp: remove in prod
const getCustomers = (request, response) => {
  pool.query('SELECT * FROM customers ORDER BY id ASC', (error, results)=>{
    if(error){
      throw error;
    }
    response.status(200).json(results.rows);
  })
}

const getStallOrders = (request, response) => {
  let id = request.params.id;
  pool.query('SELECT start_datetime, items.name, orders.total_price, orders.compulsory_options, orders.optional_options, orders.status_id, orders.receipt_id FROM orders INNER JOIN items ON items.id = orders.item_id AND items.stall_id = orders.stall_id WHERE orders.stall_id=$1 ORDER BY start_datetime DESC', [id], (error, results)=>{
    if(error){
      throw error;
    }
    response.status(200).json(results.rows);
  })
}

const getLiveOrders = () => {
  return pool.query("SELECT orders.id, orders.stall_id, orders.item_id, orders.customer_id, orders.total_price, orders.compulsory_options, orders.optional_options, orders.status_id, orders.start_datetime, orders.receipt_id, items.name, items.image_url, items.location_id FROM orders INNER JOIN items ON items.id = orders.item_id AND items.stall_id = orders.stall_id WHERE orders.status_id >= 1 AND orders.start_datetime >= now()::date + interval '1h' ORDER BY orders.start_datetime DESC");
}

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

const getVenues = (request, response) => {
  pool.query('SELECT * FROM venues ORDER BY id DESC', (error, results)=>{
    if(error){
      throw error;
    }
    response.status(200).json(results.rows);
  })
}

const getStalls = (request, response) => {
  let location = request.params.location;
  var pg_res = "";
  pool.query('SELECT * FROM stalls WHERE stalls.location = $1 ORDER BY id ASC', [location])
    .then((results) => {
      response.status(200).json(results.rows);
    })
    .catch(err => console.log(err));
}

const getLocations = (request, response) => {
  pool.query('SELECT * FROM locations')
    .then((results) => {
      response.status(200).json(results.rows);
    })
    .catch((err) => {
      console.log(err);
      response.status(400);
    });
}

const getStallMenu = (request, response) => {
  const stallLoc = parseInt(request.params.location);
  const stallId = parseInt(request.params.id);
  pool.query('SELECT id as item_id, location_id, stall_id, name, in_stock, school_price, public_price, category, kcal, compulsory_options, optional_options, tags, image_url FROM items WHERE stall_id = $1 AND location_id = $2 ORDER BY id ASC', [stallId, stallLoc], (error, results)=>{
    if(error){
      console.log(error);
      response.status(400).json({"message": error});
      // throw error;
    }
    response.status(200).json(results.rows);
  });
}

const createCustomer = (request, response, next) => {
  const user_details = request.body;
  pool.query('INSERT INTO customers (id, email, age, name, image, diet) VALUES ($1, $2, $3, $4, $5, $6)', [user_details.id, user_details.email, user_details.age, user_details.name, user_details.image, user_details.diet], (error, results) => {
    if(error){
      console.log(error);
      response.status(400).json({"message":error});
    }
    request.user_response = {
      "message":"Customer added successfully",
    };
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

const verifyOrderValue = (order_package) => {
  let metadata = order_package.metadata;
  let items = order_package.orders;
  var total_payment = 0
  // Compulsory option 1: One must be selected
  // Compulsory option 2: One must be selected
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
          pool.query('SELECT * FROM paylah_url WHERE value = $1', [order_package.metadata.total_payment], (error, results) =>{
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
  pool.query('UPDATE orders SET status_id = $1 WHERE orders.id = $2', [order_status, order_id], (error, results) => {
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
  pool.query('SELECT * FROM paylah_url WHERE paylah_url.value = $1', [payment_value], (error, results) => {
    if(error){
      response.status(400).send({"Error": error.detail});
    }
    else{
      response.status(200).send({"status": true});
    }
  })
}

const getAllOrderDetails = (request, response) => {
  pool.query('SELECT orders.id, orders.customer_id, orders.stall_id, start_datetime as time, receipt_id as receipt, items.name, total_price as price, status_id as status FROM orders INNER JOIN items ON orders.item_id = items.id AND orders.stall_id = items.stall_id', [], (error, results)=>{
    if(error){
      throw error;
    }
    response.status(200).json(results.rows);
  });
}

module.exports = {
  getLocations,
  getStalls,
  getStallMenu,
  getPaylahUrl,
  getLiveOrders,
  getStallOrders,
  createCustomer,
  checkId,
  getCustomers,
  submitOrder,
  transitionOrder,
  receiptPaid,
  resetOrder,
  getAllOrderDetails
}
