var stall_dict = {}
var customer_dict = {}

var completed_stall_orders = {}
var completed_customer_orders = {}

var customer_color_dict = {}
var stall_color_dict = {}


function generateCardIfNotExists(elem_id, colour, type){
  elem_check = document.getElementById(type + "_" + elem_id);
  if(!elem_check){
    let parentElem = document.createElement("div");
    parentElem.id = type + "_" + elem_id;
    parentElem.className = "col s6";
    parentElem.style="min-height:100%";
    let parentCard = document.createElement("div");
    parentCard.className = "card " + colour;
    let title = document.createElement("div");
    title.className = "card-title center-align";
    title.style="padding-top:1rem";
    title.innerHTML = type + " " + elem_id;
    let user_interface = document.createElement("table");
    user_interface.className="table-responsive centered highlight";
    let mainbody = document.createElement("tbody");
    mainbody.id = type + "_table_" + elem_id;
    if(type==="Customer"){
      var header_categories = ["Time", "Stall", "Receipt", "Order", "Cost", "Status"];
      parentCard.style = "min-height: 100%; margin:0";
    }
    else{
      var header_categories = ["Time", "Customer", "Receipt", "Order", "Cost", "Status"];
      parentCard.style = "min-height: 100%; margin:0";
    }
    header_row = document.createElement("tr");
    header_categories.forEach((header)=>{
      let header_cat = document.createElement("th");
      header_cat.style="text-align:center"
      header_cat.innerHTML = header;
      header_row.appendChild(header_cat);
    });
    elemDiv = document.getElementById(type+"_perspective");
    elemDiv.appendChild(parentElem);
    parentElem.appendChild(parentCard);
    parentCard.appendChild(title);
    parentCard.appendChild(user_interface);
    user_interface.appendChild(mainbody);
    mainbody.appendChild(header_row);
  }
}

function populateCards(demographic){
  if(demographic === "Customer"){
    demo_dict = customer_dict;
    console.log(demo_dict)
    var order_elements = ["start_datetime", "stall_id", "receipt_id", "name", "total_price", "status_id"]
  }
  else {
    demo_dict = stall_dict;
    var order_elements = ["start_datetime", "customer_id", "receipt_id", "name", "total_price", "status_id"]
  }
  demos = Object.keys(demo_dict);
  demos.forEach(demo=>{
    stalls = Object.keys(demo_dict[demo]);
    stalls.forEach(stall=>{
      demo_orders = Object.keys(demo_dict[demo][stall])
      demo_orders.forEach((order)=>{
        if(parseInt(demo_dict[demo][stall][order]['status_id']) != 4){
          let order_row = document.getElementById(demographic+"_row_"+stall+'_'+order);
          if(order_row){
            order_elements.forEach((elem)=>{
              tblElem = document.getElementById("data_"+demo+"_"+stall+'_'+order+"_"+elem);
              if(elem=="start_datetime"){
                time_object = new Date(demo_dict[demo][stall][order][elem]);
                tblElem.innerHTML = time_object.toLocaleTimeString(navigator.language, {hour: '2-digit', minute:'2-digit'});
              }
              else if(elem == "status_id"){
                tblElemBtn = document.getElementById("data_"+demo+"_"+stall+'_'+order+"_"+elem+"_btn");
                tblElemBtn.innerHTML = demo_dict[demo][stall][order][elem];
                if(demographic=="Customer"){
                  tblElemBtn.onclick = (()=>{
                    advanceOrderStatus(customer_dict[demo][stall][order]);
                  });
                }
                else{
                  tblElemBtn.onclick = (()=>{
                    advanceOrderStatus(stall_dict[demo][stall][order]);
                  });
                }
              }
              else{
                tblElem.innerHTML = demo_dict[demo][stall][order][elem];
              }
            });
          }
          else{
            order_row = document.createElement("tr");
            order_row.id = demographic+"_row_"+stall+'_'+order
            order_elements.forEach((elem)=>{
              tblElem = document.createElement("td");
              if(elem=="start_datetime"){
                time_object = new Date(demo_dict[demo][stall][order][elem]);
                tblElem.innerHTML = time_object.toLocaleTimeString(navigator.language, {hour: '2-digit', minute:'2-digit'});
              }
              else if (elem == "status_id"){
                tblElemBtn = document.createElement("a");
                tblElemBtn.className = "btn-small waves-effect red"
                tblElemBtn.id = "data_"+demo+"_"+stall+'_'+order+"_"+elem+"_btn";
                tblElemBtn.innerHTML = demo_dict[demo][stall][order][elem];
                if(demographic=="Customer"){
                  tblElemBtn.onclick = (()=>{
                    advanceOrderStatus(customer_dict[demo][stall][order]);
                  });
                }
                else{
                  tblElemBtn.onclick = (()=>{
                    advanceOrderStatus(stall_dict[demo][stall][order]);
                  });
                }
                tblElem.appendChild(tblElemBtn);
              }
              else{
                tblElem.innerHTML = demo_dict[demo][stall][order][elem];
              }
              tblElem.id = "data_"+demo+"_"+stall+"_"+order+"_"+elem;
              order_row.appendChild(tblElem);
            })
            demo_card_table = document.getElementById(demographic+"_table_"+demo);
            demo_card_table.appendChild(order_row);
          }
        }
      });
    });
  });
}

function advanceOrderStatus(order){
  var server_url = "https://www.myxbrewapi.com/order/";
  var dev_url = "http://10.12.254.221:11235/order/";
  let target_url = server_url + order.stall_id + '/' + order.order_id
  fetch(target_url, {
    method: 'PUT',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      'status_id': order.status_id + 1,
      'id': order.order_id,
      'uid': order.stall_id
    })
  });
}

function randElem(js_arr){
  return js_arr[Math.floor(Math.random() * js_arr.length)];
}

function dataUpdate(all_orders){
  let customer_colors = ["red", "pink", "purple", "deep-purple"]
  let stall_colors = ["indigo", "blue", "light-blue", "cyan"]
  let style_options = ["lighten"];
  let depth_options = [3,4,5];
  all_orders.forEach((order)=>{
    if(!(order.customer_id in customer_dict)){
      customer_dict[order.customer_id] = {};
      customer_color_dict[order.customer_id] = randElem(customer_colors) + " " + randElem(style_options) + "-" + randElem(depth_options);
    }
    if(!(order.stall_id in stall_dict)){
      stall_dict[order.stall_id] = {};
      stall_dict[order.stall_id][order.stall_id] = {};
      stall_color_dict[order.stall_id] = randElem(stall_colors) + " " + randElem(style_options) + "-" + randElem(depth_options);
    }
    if(!(order.stall_id in customer_dict[order.customer_id])) customer_dict[order.customer_id][order.stall_id] = {};
    if(!(order.stall_id in stall_dict[order.stall_id])) stall_dict[order.stall_id][order.stall_id] = {};
    customer_dict[order.customer_id][order.stall_id][order.order_id] = order;
    stall_dict[order.stall_id][order.stall_id][order.order_id] = order;
    if(order.status_id == 4){
      if(!(order.customer_id in completed_customer_orders)){
        completed_customer_orders[order.customer_id] = {}
      }
      if(!(order.stall_id in completed_stall_orders)){
        completed_stall_orders[order.stall_id] = {}
        completed_stall_orders[order.stall_id][order.stall_id] = {}
      }
      if(!(order.stall_id in completed_customer_orders[order.customer_id])) completed_customer_orders[order.customer_id][order.stall_id] = {}
      completed_customer_orders[order.customer_id][order.stall_id][order.order_id] = order;
      completed_stall_orders[order.stall_id][order.stall_id][order.order_id] = order;
    }
  })
}

function main(data){
  dataUpdate(data);
  customers = Object.keys(customer_dict);
  stalls = Object.keys(stall_dict);
  customers.forEach((customer)=>generateCardIfNotExists(customer, customer_color_dict[customer], "Customer"));
  stalls.forEach((stall)=>generateCardIfNotExists(stall, stall_color_dict[stall], "Stall"));
  populateCards("Customer");
  populateCards("Stall")
  cleanCards();
}

function cleanCards(){
  for(var stall in stall_dict){
    pending_orders = 0
    for(var order in stall_dict[stall][stall]){
      if(parseInt(stall_dict[stall][stall][order]['status_id']) < 4) pending_orders +=1;
    }
    if(pending_orders == 0){
      var card = document.getElementById("Stall" + "_" + stall);
      card.parentNode.removeChild(card);
    }
  }
  for(var stall in completed_stall_orders){
    for(var order in completed_stall_orders[stall][stall]){
      tblRow = document.getElementById("Stall_row_"+order);
      if(tblRow){
        tblRow.parentNode.removeChild(tblRow);
      }
    }
  }
  for(var customer in completed_customer_orders){
    for(var stall in completed_customer_orders[customer]){
      for(var order in completed_customer_orders[customer][stall]){
        tblRow = document.getElementById("Customer_row_"+stall+"_"+order);
        if(tblRow){
          tblRow.parentNode.removeChild(tblRow);
        }
      }
    }
  }
  for(var customer in customer_dict){
    var pending_orders = 0
    for(var stall in customer_dict[customer]){
      for(var order in customer_dict[customer][stall]){
        if(parseInt(customer_dict[customer][stall][order]['status_id']) < 4) pending_orders +=1;
      }
    }
    if(pending_orders == 0){
      var card = document.getElementById("Customer" + "_" + customer);
      card.parentNode.removeChild(card);
    }
  }
}
