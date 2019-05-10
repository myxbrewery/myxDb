const db = require('./pg_queries')
var socketio = require('socket.io'),
  io, clients = {};

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

var fetchDb = () =>{
  return new Promise((resolve, reject) =>{
    db.getLiveOrders().then((res)=>{
      stall_orders = parseStallStatuses(res.rows);
      customer_orders = parseCustomerStatuses(res.rows);
      resolve({
        stall_orders: stall_orders,
        customer_orders: customer_orders
      });
    }, (err) =>{
      console.log(err);
      reject("Problem encountered");
    });
  });
}

module.exports = {
  startSocketServer: (app)=>{
    io = socketio.listen(app);
    io.on('connection', (socket)=>{
      let valid_stalls = new Set([1,2,3,4,5,6,7,8,9])
      socket.on('stall_join', (room)=>{
        socket.join(room);
        fetchDb().then((result)=>{
          Object.keys(result.stall_orders).forEach((stall)=>{
            io.to(stall).emit('orders',result.stall_orders[stall]);
            valid_stalls.delete(parseInt(stall));
          });
          valid_stalls.forEach((val)=>{
            io.to(val).emit('orders',[]);
          });
        },(err)=>{
          console.log(err);
        })
      });
      socket.on('stall_leave', (room)=>{
        console.log('Stall leaving', room)
        socket.leave(room);
      });
      socket.on('customer_join', (room)=>{
        socket.join(room);
        fetchDb().then((result)=>{
          Object.keys(result.customer_orders).forEach((customer)=>{
            console.log(customer);
            io.to(customer).emit('orders',result.customer_orders[customer]);
          });
        },(err)=>{
          console.log(err);
        })
      });
      socket.on('customer_leave', (room)=>{
        console.log('Customer leaving', room)
        socket.leave(room);
      });
    });
    return io;
  },
  stall_update: (io) =>{
    let valid_stalls = new Set([1,2,3,4,5,6,7,8,9])
    var pull_database = fetchDb();
    pull_database.then((result)=>{
      Object.keys(result.stall_orders).forEach((stall)=>{
        valid_stalls.delete(parseInt(stall));
        io.to(stall).emit('orders',result.stall_orders[stall]);
      });
      valid_stalls.forEach((val)=>{
        io.to(val).emit('orders',[]);
      });
    },(err)=>{
      console.log(err);
    })
  },
  customer_update: (io) =>{
    var pull_database = fetchDb();
    pull_database.then((result)=>{
      Object.keys(result.customer_orders).forEach((customer)=>{
        io.to(customer).emit('orders',result.customer_orders[customer]);
      });
    },(err)=>{
      console.log(err);
    })
  },
}
