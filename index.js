const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = 11235;

const db = require('./pg_queries');

app.use(bodyParser.json())
app.use(cors())

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

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

// <----- ROUTES ----->
app.get('/orders', db.getLiveOrdersSite);
app.get('/customers', db.getCustomers);
app.get('/checkId/:id', db.checkId);
app.get('/locations', db.getLocations);
app.get('/stalls/:location', db.getStalls);
app.get('/stallMenu/:location/:id', db.getStallMenu);
app.get('/paylah/:cost', db.getPaylahUrl);

var dbPoll = (req, res) =>{
  setTimeout(()=>{
    sockets.stall_update(io);
    sockets.customer_update(io);
  }, 200);
}

app.post('/customer', [db.createCustomer, dbPoll]);
app.post('/order', [db.submitOrder, dbPoll]);

app.put('/order', [db.transitionOrder, dbPoll]);
app.put('/receiptPaid', [db.receiptPaid, dbPoll]);

app.get('/', (request, response) =>{
  response.sendFile(__dirname + '/index.html');
});

// dev functions
app.get('/scripts/dev_view.js', (request, response)=>{
  console.log("dev_view requested")
  response.sendFile(__dirname + '/scripts/dev_view.js');
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
