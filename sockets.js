const db = require('./pg_queries')
var socketio = require('socket.io'),
  io, clients = {};

var stall_orders = {};

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

// Update stall_orders table
var interval = setInterval(()=>{
  db.getLiveOrders().then((res)=>{
    stall_orders = parseStallStatuses(res.rows);
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
    var socketEmits = setInterval(()=>{
      available_stalls = Object.keys(stall_orders);
      available_stalls.forEach((stall)=>{
        io.to(stall).emit('orders',stall_orders[stall]);
      });
      console.log("Emitted");
    }, 1000);
  }
}
