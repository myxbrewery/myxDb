const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;
const db = require('./pg_queries');

app.use(bodyParser.json())

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.get('/orders', db.getLiveOrdersSite);
app.post('/createCustomer', db.createCustomer);
app.get('/getCustomers', db.getCustomers);
app.get('/checkId/:id', db.checkId);
app.get('/getLocations', db.getLocations);
app.get('/getStalls/:location', db.getStalls);
app.get('/getStallMenu/:location/:id', db.getStallMenu);
app.get('/update_order/:order_id/:status/', db.transitionOrder);
app.get('/getPaylah/:cost', db.getPaylahUrl);
app.post('/submitOrder', db.submitOrder);

app.get('/', (request, response) =>{
  response.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
  console.log(`App running on port ${port}.`)
});

// <----- SOCKET SERVER LOGIC ------>
// Pub/Subbing on port 8080

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
socket_app.listen(8080);
