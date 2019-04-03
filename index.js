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

app.get('/orders', db.getLiveOrdersSite);
app.get('/customers', db.getCustomers);
app.get('/checkId/:id', db.checkId);
app.get('/locations', db.getLocations);
app.get('/stalls/:location', db.getStalls);
app.get('/stallMenu/:location/:id', db.getStallMenu);
app.get('/paylah/:cost', db.getPaylahUrl);

app.post('/customer', db.createCustomer);
app.post('/order', db.submitOrder);

app.put('/order', db.transitionOrder);
app.put('/receiptPaid', db.receiptPaid);

app.get('/', (request, response) =>{
  response.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
  console.log(`App running on port ${port}.`)
});

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

sockets.startSocketServer(socket_app);
socket_app.listen(11236);
