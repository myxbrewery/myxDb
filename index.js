const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = 11235;

// const db = require('./pg_queries');
const pg_puts = require('./db_scripts/pg_puts');
const pg_posts = require('./db_scripts/pg_posts');
const pg_gets = require('./db_scripts/pg_gets');
const showcase = require('./db_scripts/showcase')
const dev_fns = require('./db_scripts/dev_fns')

app.use(bodyParser.json({
  limit: '50mb'
}));
app.use(cors())

app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: '50mb'
  })
);

app.use(express.json({limit: '50mb'}));

// <----- SOCKET SERVER LOGIC ------>
// Pub/Subbing on port 11236

var sockets = require('./sockets');
var socket_app = require('http').createServer(handler);
function handler (req, res) {
  fs.readFile(__dirname + '/ui/html/index.html',
    function (err, data) {
      if (err) {
        res.writeHead(500);
        return res.end('Error loading ui/html index.html');
      }
      res.writeHead(200);
      res.end(data);
    });
}

var io = sockets.startSocketServer(socket_app);
socket_app.listen(11236);

var dbPoll = (request, response) =>{
  setTimeout(()=>{
    sockets.stall_update(io);
    sockets.customer_update(io);
    sockets.update_all(io);
  }, 100);
  response.status(200).send(request.user_response);
}

var emitShelf = (request, response, next) =>{
  console.log("Emitting shelf data")
  console.log(request.shelf_data)
  sockets.emit_shelf(io, request.shelf_data);
  request.user_response = {"message": request.shelf_data}
  next();
}

// <----- ROUTES ----->
app.get('/orders/stall/:uid', pg_gets.getStallOrders);
app.get('/orders/customer/:customer_id', pg_gets.getCustomerOrders);
app.get('/checkId/:id', pg_gets.checkId);
app.get('/locations', pg_gets.getLocations);
app.get('/retrieve/:order_id', [showcase.retrieve, emitShelf, dbPoll]);
app.get('/stalls/', pg_gets.getStalls);
app.get('/stalls/:lat/:long', pg_gets.getStalls);
app.get('/menu/:uid', pg_gets.getStallMenu);
app.get('/paylah/:cost', pg_gets.getPaylahUrl);
app.get('/allPendingOrders', pg_gets.getAllOrderDetails);
app.get('/customers', dev_fns.getCustomers);

app.get('/dbpoll', dbPoll)

app.post('/customer', [pg_posts.postCustomer, dbPoll]);
app.post('/order', [pg_posts.postOrder, dbPoll]);
app.post('/menu', [pg_posts.upsertMenu]);
app.post('/resetOrder', [dev_fns.resetOrder, dbPoll]);

app.put('/depositItem/:item_cat', [showcase.depositItem, emitShelf, dbPoll])
app.put('/favorite', [pg_puts.favoriteStall, dbPoll]);
app.put('/order/:uid/:orderid', [pg_puts.transitionOrder, dbPoll]);
app.put('/receipt/:uid/:receiptid', [pg_puts.putReceiptStatus, dbPoll]);
app.put('/menu/:uid/:itemid', [pg_puts.putStock, dbPoll]);

app.get('/', (request, response) =>{
  response.sendFile(__dirname + '/ui/html/index.html');
});

// Data retrieval endpoints
app.get('/assets/images/:image_path', (request, response)=>{
  let image_url = request.params.image_path;
  console.log(image_url);
  response.sendFile(__dirname + '/assets/images/' + image_url);
});

app.get('/assets/images/stalls/:image_path', (request, response)=>{
  let image_url = request.params.image_path;
  console.log(image_url);
  response.sendFile(__dirname + '/assets/images/stalls/' + image_url);
});

app.get('/assets/images/gong_cha/:image_path', (request, response)=>{
  let image_url = request.params.image_path;
  console.log(image_url);
  response.sendFile(__dirname + '/assets/images/gong_cha/' + image_url);
});

app.get('/assets/icons/:icon_path', (request, response)=>{
  let icon_url = request.params.icon_path;
  console.log(icon_url);
  response.sendFile(__dirname + '/assets/icons/' + icon_url);
});

// dev functions
app.get('/ui/js/dev_view.js', (request, response)=>{
  console.log("dev_view requested")
  response.sendFile(__dirname + '/ui/js/dev_view.js');
});
app.get('/ui/js/dev_hax.js', (request, response)=>{
  console.log("dev_hax requested")
  response.sendFile(__dirname + '/ui/js/dev_hax.js');
});

// Temporary for images, before s3
app.get('/images/:url', (request, response) => {
  var image_url = request.params.url;
  response.sendFile(__dirname + '/images/' + image_url);
})

app.listen(port, () => {
  console.log(`App running on port ${port}.`)
});

// Create endpoint at 11234 for testing
var admin_port = 11234;
var admin_app = express();

admin_app.get('/', (request, response) =>{
  response.sendFile(__dirname + '/ui/html/admin.html');
});

var admin_server = require('http').createServer(admin_app);
admin_server.listen(admin_port);
