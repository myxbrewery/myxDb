const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = 11235;

const db = require('./pg_queries');

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
  fs.readFile(__dirname + '/index.html',
  function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading index.html');
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
  }, 100);
  response.status(200).send(request.user_response);
}

var emitShelf = (request, response, next) =>{
  sockets.emit_shelf(io, request.shelf_data);
  request.user_response = {"message": request.shelf_data}
  next();
}

// <----- ROUTES ----->
app.get('/orders/stall/:uid', db.getStallOrders);
app.get('/orders/customer/:customer_id', db.getCustomerOrders);
app.get('/customers', db.getCustomers);
app.get('/checkId/:id', db.checkId);
app.get('/locations', db.getLocations);
app.get('/retrieve/:order_id', [db.retrieve, emitShelf, dbPoll]);
app.get('/stalls/', db.getStalls);
app.get('/stalls/:lat/:long', db.getStalls);
app.get('/menu/:uid', db.getStallMenu);
app.get('/paylah/:cost', db.getPaylahUrl);

app.get('/dbpoll', dbPoll)

app.post('/customer', [db.createCustomer, dbPoll]);
app.post('/order', [db.postOrder, dbPoll]);
app.post('/menu', [db.upsertMenu]);

app.put('/depositItem/:shelf/:item_cat', [db.depositItem, emitShelf, dbPoll])
app.put('/favorite', [db.favoriteStall, dbPoll]);
app.put('/order/:uid/:orderid', [db.transitionOrder, dbPoll]);
app.put('/receipt/:uid/:receiptid', [db.putReceiptStatus, dbPoll]);
app.put('/menu/:uid/:itemid', [db.putStock, dbPoll]);

app.get('/', (request, response) =>{
  response.sendFile(__dirname + '/index.html');
});

app.get('/assets/images/:image_path', (request, response)=>{
  let image_url = request.params.image_path;
  console.log(image_url);
  response.sendFile(__dirname + '/assets/images/' + image_url);
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
app.get('/scripts/dev_view.js', (request, response)=>{
  console.log("dev_view requested")
  response.sendFile(__dirname + '/scripts/dev_view.js');
});
app.get('/scripts/dev_hax.js', (request, response)=>{
  console.log("dev_hax requested")
  response.sendFile(__dirname + '/scripts/dev_hax.js');
});
app.get('/allPendingOrders', db.getAllOrderDetails);
app.post('/resetOrder', [db.resetOrder, dbPoll]); // DEV

// Temporary for images, before s3
// Is this security risk? can people put ../../ in image_url to fetch code? hmm
app.get('/images/:url', (request, response) => {
  var image_url = request.params.url;
  response.sendFile(__dirname + '/images/' + image_url);
})

app.listen(port, () => {
  console.log(`App running on port ${port}.`)
});

var admin_port = 11234;
var admin_app = express();

admin_app.get('/', (request, response) =>{
  response.sendFile(__dirname + '/admin.html');
});

var admin_server = require('http').createServer(admin_app);
admin_server.listen(admin_port);
admin_app.get('/scripts/dev_hax.js', (request, response)=>{
  response.sendFile(__dirname + '/scripts/dev_hax.js');
});
