const db = require('./pg_queries')
var socketio = require('socket.io'),
  io, clients = {};

// const parseStallStatuses = (all_orders) =>{
//   stall_dict = {};
//   all_orders.forEach((order)=>{
//     if(!(order.stall_id in stall_dict)){
//       stall_dict[order.stall_id] = [];
//     }
//     if(order.status_id > 1){
//       stall_dict[order.stall_id].push(order);
//     }
//   });
//   return stall_dict;
// };


const parseCustomerStatuses = (all_orders) =>{
  let customer_dict = {};
  let stalls = Object.keys(all_orders);
  stalls.forEach(stall=>{
    all_orders[stall].forEach(order=>{
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
    db.getLiveOrders().then((res)=>{
      stall_orders = res;
      customer_orders = parseCustomerStatuses(res);
      resolve({
        stall_orders: stall_orders,
        customer_orders: customer_orders
      });
    }, (err) =>{
      // console.log(err);
      reject("Socket problem encountered");
    });
  });
}


module.exports = {
  startSocketServer: (app)=>{
    io = socketio.listen(app);
    io.on('connection', (socket)=>{
      socket.on('stall_join', (room)=>{
        socket.join(room);
        db.stalls().then(stalls=>{
          let stallDict = {};
          stalls.forEach(row=>stallDict[row.uid]=[]);
          fetchDb().then((result)=>{
            Object.keys(result.stall_orders).forEach((stall)=>{
              stallDict[stall] = result.stall_orders[stall];
            });
            Object.keys(stallDict).forEach(stall=>{
              io.to(stall).emit('orders', stallDict[stall]);
            })
          },(err)=>{
            console.log(err);
          })
        });
      });
      socket.on('stall_leave', (room)=>{
        console.log('Stall leaving', room)
        socket.leave(room);
      });
      socket.on('customer_join', (room)=>{
        socket.join(room);
        fetchDb().then((result)=>{
          Object.keys(result.customer_orders).forEach((customer)=>{
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
    db.stalls().then(stalls=>{
      let stallDict = {};
      stalls.forEach(row=>stallDict[row.uid]=[]);
      fetchDb().then((result)=>{
        Object.keys(result.stall_orders).forEach((stall)=>{
          stallDict[stall] = result.stall_orders[stall];
        });
        Object.keys(stallDict).forEach(stall=>{
          io.to(stall).emit('orders', stallDict[stall]);
        })
      },(err)=>{
        console.log(err);
      })
    });
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
