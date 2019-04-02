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
    response.statusMessage = "Invalid items table";
    response.status(400).end();
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

const getLiveOrdersSite = (request, response) => {
  pool.query('SELECT * FROM orders WHERE orders.status_id >= 1 ORDER BY id DESC', (error, results)=>{
    if(error){
      throw error;
    }
    response.status(200).json(results.rows);
  })
}

const getLiveOrders = () => {
  return pool.query('SELECT * FROM orders INNER JOIN items ON items.id = orders.item_id AND items.stall_id = orders.stall_id WHERE orders.status_id >= 1 ORDER BY items.id DESC');
}

const checkId = (request, response) => {
  let id = request.params.id;
  pool.query('SELECT * FROM customers WHERE id = $1', [id], (error, results) =>{
    if(error){
      throw error;
    }
    if(results.rows.length != 0){
      response.statusMessage = "Username already exists, try again";
      response.status(400).end();
    }
    response.statusMessage = "Username does not exist yet";
    response.status(200).json({"message": "Username is free!"});
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
  pool.query('SELECT * FROM items WHERE stall_id = $1 AND location_id = $2 ORDER BY id ASC', [stallId, stallLoc], (error, results)=>{
    if(error){
      throw error;
    }
    response.status(200).json(results.rows);
  });
}

const createCustomer = (request, response) => {
  const user_details = request.body;
  console.log(user_details);
  pool.query('INSERT INTO customers (id, email, age, name, image, diet) VALUES ($1, $2, $3, $4, $5, $6)', [user_details.id, user_details.email, user_details.age, user_details.name, user_details.image, user_details.diet], (error, results) => {
    if(error){
      console.log(error);
      throw error;
    }
    console.log(results);
    response.status(201).send(`User added with ID: ${results.insertId}`)
  });
}

const verifyOrderValue = (order_package) => {
  let metadata = order_package.metadata;
  let items = order_package.orders;
  var total_payment = 0
  // Compulsory option 1: One must be selected
  // Compulsory option 2: One must be selected
  var location_id = metadata.location_id;
  var stall_id = metadata.stall_id;
  const compulsory_fields = ["compulsory_option_1", "compulsory_option_2"];
  const modifiers = ["modifier_1", "modifier_2"]
  items.forEach((item) => {
    item_id = item.item_id;
    // console.log(item_id);
    // Compulsory fields, e.g. Rare, medium rare,...
    // If size, + upsize cost
    console.log(`User ordering stall ${stall_id}, item ${item_id}`);
    compulsory_fields.forEach((field)=>{
      if(menu[location_id][stall_id][item_id][field] != null){
        if(menu[location_id][stall_id][item_id][field].length != 0){
          // Item's specified field must be inside possible list of options, and it must have nonzero length
          if(item[field].length == 0 || !menu[location_id][stall_id][item_id][field].includes(item[field])){
            response.statusMessage =  "Required field: " + menu[location_id][stall_id][item_id][field].join(' or ');
            response.status(400).end();
          }
          if(item[field] == "Medium") total_payment += parseFloat(menu[location_id][stall_id][item_id].upsize_1_cost);
          else if(item[field] == "Large") total_payment += parseFloat(menu[location_id][stall_id][item_id].upsize_2_cost);
        }
      }
    });
    modifiers.forEach((mod)=>{
      cost_field = mod + "_cost";
      if(menu[location_id][stall_id][item_id][mod] != null){
        if(menu[location_id][stall_id][item_id][mod] != 0){
          if(menu[location_id][stall_id][item_id][mod].includes(item.mod)){
            total_payment += parseFloat(menu[location_id][stall_id][item_id][cost_field]);
          }
        }
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
    console.log(item.item_id + "price parsed");
  });
  console.log(`Server computed total cost: ${total_payment}`)
  console.log(`Client computed total cost: ${metadata.total_payment}`)
  if(total_payment != metadata.total_payment){
    return false;
  }
  else{
    return true;
  }
}

var semaphore = false;

const submitOrder = (request, response) => {
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
    var timestamp = new Date().toISOString();
    pool.query('INSERT INTO receipts (customer_id, paid, start_date, total_payment) VALUES ($1, $2, $3, $4)', [order_package.metadata.customer_id, false, timestamp, order_package.metadata.total_payment])
      .then((res) =>{
        pool.query('SELECT id FROM receipts WHERE customer_id = $1 ORDER BY id DESC LIMIT 1', [order_package.metadata.customer_id])
        .then((results)=>{
          console.log(results);
          console.log(receipt_id);
          var receipt_id = results.rows[0].id;
          order_package.orders.forEach((order)=>{
            pool.query('INSERT INTO orders(stall_id, item_id, customer_id, base_price, total_price, compulsory_option_1, compulsory_option_2, modifier_1, modifier_2, status_id, start_datetime, receipt_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)', [order.stall_id, order.item_id, order_package.metadata.customer_id, order.base_price, order.total_price, order.compulsory_option_1, order.compulsory_option_2, order.modifier_1, order.modifier_2, 0, timestamp, receipt_id], (error, res) => {
              if(error){
                console.log(error);
                semaphore = false;
                response.status(400).send({"Error": error.detail});
                throw error;
              }
              console.log("Order added: ");
              console.log(order);
            });
          });
          pool.query('SELECT * FROM paylah_url WHERE value = $1', [order_package.metadata.total_payment], (error, results) =>{
            if(error){
              console.log(error);
              response.status(400).send({"Paylah URL Error": error.detail});
            }
            else if(results.rows.length == 0){
              console.log("No Paylah Url for " + order_package.metadata.total_payment);
              response.status(400).send({"Missing Paylah URL": order_package.metadata.total_payment});
            }
            else response.status(200).send({
              "paylah_url":results.rows[0],
              "receipt_id":receipt_id
            });
          });
        })
      })
      .catch((error)=>{
        console.log(error);
        response.status(400).send({"Error": error.detail});
        throw error;
      });
  }
  semaphore = false;
}

const transitionOrder = (request, response) => {
  const {status} = parseInt(request.params.status);
  const {order_id} = parseInt(request.params.order_id);
  console.log(status, order_id);
  pool.query('UPDATE orders SET status_id = $1 WHERE orders.id = $2', [status, order_id], (error, results) => {
    if(error){
      console.log(error);
      response.status(400).send({"Error": error.detail});
    }
    response.status(200).send({"status": true});
  })
}

const getPaylahUrl = (request, response) => {
  const {payment_value} = parseFloat(request.params.cost);
  console.log(payment_value);
  pool.query('SELECT * FROM paylah_url WHERE paylah_url.value = $1', [payment_value], (error, results) => {
    if(error){
      throw error;
    }
    response.status(200).json(results.rows);
  })
}

module.exports = {
  getLocations,
  getStalls,
  getStallMenu,
  getPaylahUrl,
  getLiveOrders,
  getLiveOrdersSite,
  createCustomer,
  checkId,
  getCustomers,
  submitOrder,
  transitionOrder
}
