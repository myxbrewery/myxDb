const db = require('./pg_queries')
var socketio = require('socket.io'),
  io, clients = {};

var stall_orders = {};
var customer_orders = {};

const parseStallStatuses = (all_orders) =>{
  stall_dict = {};
  all_orders.forEach((order)=>{
    if(!(order.stall_id in stall_dict)){
      stall_dict[order.stall_id] = [];
    }
    stall_dict[order.stall_id].push(order);
  });
  return stall_dict;
};

const parseCustomerStatuses = (all_orders) =>{
  customer_dict = {};
  all_orders.forEach((order)=>{
    if(!(order.customer_id in customer_dict)){
      customer_dict[order.customer_id] = [];
    }
    customer_dict[order.customer_id].push(order);
  });
  return customer_dict;
};

// Update stall_orders table
var stall_interval = setInterval(()=>{
  db.getLiveOrders().then((res)=>{
    stall_orders = parseStallStatuses(res.rows);
  });
}, 1000);

var customer_interval = setInterval(()=>{
  db.getLiveOrders().then((res)=>{
    customer_orders = parseCustomerStatuses(res.rows);
  });
}, 1000);

module.exports = {
  startSocketServer: (app)=>{
    io = socketio.listen(app);
    io.on('connection', (socket)=>{
      socket.on('join', (room)=>{
        console.log('User joining', room)
        socket.join(room);
      });
      socket.on('leave', (room)=>{
        console.log('User leaving', room)
        socket.leave(room);
      });
      socket.on('disconnect', function(){
        console.log('User disconnected');
      });
    });
    var stallEmits = setInterval(()=>{
      available_stalls = Object.keys(stall_orders);
      available_stalls.forEach((stall)=>{
        io.to(stall).emit('orders',stall_orders[stall]);
        console.log("Stall emitted", stall);
      });
    }, 1000);
    var customerEmits = setInterval(()=>{
      available_customers = Object.keys(customer_orders);
      available_customers.forEach((customer)=>{
        io.to(customer).emit('orders',customer_orders[customer]);
        console.log("Customer emitted", customer);
      });
    }, 1000);
  }
}
