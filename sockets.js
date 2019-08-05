// const db = require('./pg_queries')
const pg_gets = require('./db_scripts/pg_gets')
const order_utils = require('./db_scripts/order_utils')

var socketio = require('socket.io'),
  io, clients = {};

const parseCustomerStatuses = (all_orders) =>{
  let customer_dict = {};
  let stalls = Object.keys(all_orders);
  stalls.forEach(stall=>{
    all_orders[stall].forEach(order=>{
      order.stall_id = stall
      if(!(order.customer_id in customer_dict)){
        customer_dict[order.customer_id] = []
      }
      customer_dict[order.customer_id].push(order);
    })
  })
  return customer_dict;
};

var fetchDb = () =>{
  return new Promise((resolve, reject) =>{
    order_utils.getLiveOrders().then((res)=>{
      stall_orders = res;
      customer_orders = parseCustomerStatuses(res);
      resolve({
        stall_orders: stall_orders,
        customer_orders: customer_orders
      });
    }, (err) =>{
      console.log(err);
      reject("Socket problem encountered");
    });
  });
}


module.exports = {
  startSocketServer: (app)=>{
    io = socketio(app);
    io.on('connection', (socket)=>{
      socket.on('stall_join', (room)=>{
        console.log("Stall joined", room);
        socket.join(room);
        pg_gets.stalls().then(stalls=>{
          let stallDict = {};
          stalls.forEach(row=>stallDict[row.uid]=[]);
          fetchDb().then(result=>{
            Object.keys(result.stall_orders).forEach((stall)=>{
              stallDict[stall] = result.stall_orders[stall];
            });
            Object.keys(stallDict).forEach(stall=>{
              io.to(stall).emit('orders', stallDict[stall]);
            })
          },(err)=>{
            console.log("stalls()",err);
          })
        });
      });
      socket.on('stall_leave', (room)=>{
        console.log('Stall leaving', room)
        socket.leave(room);
      });
      socket.on('customer_join', (room)=>{
        socket.join(room);
        fetchDb().then(result=>{
          Object.keys(result.customer_orders).forEach((customer)=>{
            io.to(customer).emit('orders',result.customer_orders[customer]);
          });
        },(err)=>{
          console.log("customer_join", err);
        })
      });
      socket.on('customer_leave', (room)=>{
        console.log('Customer leaving', room)
        socket.leave(room);
      });
      socket.on('join', (room)=>{
        console.log('Joining room', room)
        socket.join(room);
      });
    });
    return io;
  },
  stall_update: (io) =>{
    pg_gets.stalls().then(stalls=>{
      let stallDict = {};
      stalls.forEach(row=>stallDict[row.uid]=[]);
      fetchDb().then(result=>{
        Object.keys(result.stall_orders).forEach((stall)=>{
          stallDict[stall] = result.stall_orders[stall];
        });
        Object.keys(stallDict).forEach(stall=>{
//          console.log("Socket Emitting!")
//          console.log(stallDict[stall]);
          io.to(stall).emit('orders', stallDict[stall]);
        })
      },(err)=>{
        console.log("stallupdate", err);
      })
    });
  },
  customer_update: (io) =>{
    var pull_database = fetchDb();
    pull_database.then(result=>{
      Object.keys(result.customer_orders).forEach((customer)=>{
        io.to(customer).emit('orders',result.customer_orders[customer]);
      });
    },(err)=>{
      console.log("customerupdate", err);
    })
  },
  update_all: (io) => {
    order_utils.getAllOrders()
      .then(res=>{
        orders = [];
        let stalls = Object.keys(res);
        stalls.forEach(stall=>{
          res[stall].forEach(order=>{
            order['stall_id'] = stall
            orders.push(order);
        })
      })
    });
    io.to('all').emit('orders', orders);
  },
  emit_shelf: (io, shelf_data) => {
    io.to('myx').emit('shelf', shelf_data);
  }
}
