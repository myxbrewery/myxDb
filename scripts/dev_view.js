var stall_dict = {}
var customer_dict = {}
var customer_color_dict = {}
var stall_color_dict = {}

function generateCard(elem_id, colour, type){
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
    let interface = document.createElement("table");
    interface.className="table-responsive centered highlight";
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
    parentCard.appendChild(interface);
    interface.appendChild(mainbody);
    mainbody.appendChild(header_row);
  }
}

function populateCards(demographic){
  if(demographic === "Customer"){
    demo_dict = customer_dict;
    var order_elements = ["time", "stall_id", "receipt", "name", "price", "status"]
  }
  else {
    demo_dict = stall_dict;
    var order_elements = ["time", "customer_id", "receipt", "name", "price", "status"]
  }
  demos = Object.keys(demo_dict);
  demos.forEach((demo)=>{
    demo_orders = Object.keys(demo_dict[demo])
    demo_orders.forEach((order)=>{
      let order_row = document.getElementById(demographic+"_row_"+order);
      if(order_row){
        order_elements.forEach((elem)=>{
          tblElem = document.getElementById("data_"+demo+"_"+order+"_"+elem);
          if(elem=="time"){
            time_object = new Date(demo_dict[demo][order][elem]);
            tblElem.innerHTML = time_object.toLocaleTimeString(navigator.language, {hour: '2-digit', minute:'2-digit'});
          }
          else if(elem == "status"){
            tblElemBtn = document.getElementById("data_"+demo+"_"+order+"_"+elem+"_btn");
            tblElemBtn.innerHTML = demo_dict[demo][order][elem];
            if(demographic=="Customer"){
              tblElemBtn.onclick = (()=>{
                advanceOrderStatus(customer_dict[demo][order]);
              });
            }
            else{
              tblElemBtn.onclick = (()=>{
                advanceOrderStatus(stall_dict[demo][order]);
              });
            }
          }
          else{
            tblElem.innerHTML = demo_dict[demo][order][elem];
          }
        });
      }
      else{
        order_row = document.createElement("tr");
        order_row.id = demographic+"_row_"+order
        order_elements.forEach((elem)=>{
          tblElem = document.createElement("td");
          if(elem=="time"){
            time_object = new Date(demo_dict[demo][order][elem]);
            tblElem.innerHTML = time_object.toLocaleTimeString(navigator.language, {hour: '2-digit', minute:'2-digit'});
          }
          else if (elem == "status"){
            tblElemBtn = document.createElement("a");
            tblElemBtn.className = "btn-small waves-effect red"
            tblElemBtn.id = "data_"+demo+"_"+order+"_"+elem+"_btn";
            tblElemBtn.innerHTML = demo_dict[demo][order][elem];
            if(demographic=="Customer"){
              tblElemBtn.onclick = (()=>{
                advanceOrderStatus(customer_dict[demo][order]);
              });
            }
            else{
              tblElemBtn.onclick = (()=>{
                advanceOrderStatus(stall_dict[demo][order]);
              });
            }
            tblElem.appendChild(tblElemBtn);
          }
          else{
            tblElem.innerHTML = demo_dict[demo][order][elem];
          }
          tblElem.id = "data_"+demo+"_"+order+"_"+elem;
          order_row.appendChild(tblElem);
        })
        demo_card_table = document.getElementById(demographic+"_table_"+demo);
        demo_card_table.appendChild(order_row);
      }
    });
  });
}

function advanceOrderStatus(order){
  fetch("http://localhost:11235/order/", {
    method: 'PUT',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      'status_id': order.status + 1,
      'id': order.id
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
      stall_color_dict[order.stall_id] = randElem(stall_colors) + " " + randElem(style_options) + "-" + randElem(depth_options);
    }
    customer_dict[order.customer_id][order.id] = order;
    stall_dict[order.stall_id][order.id] = order;
  })
}

function main(data){
  dataUpdate(data);
  customers = Object.keys(customer_dict);
  stalls = Object.keys(stall_dict);
  customers.forEach((customer)=>generateCard(customer, customer_color_dict[customer], "Customer"));
  stalls.forEach((stall)=>generateCard(stall, stall_color_dict[stall], "Stall"));
  populateCards("Customer");
  populateCards("Stall")
}

setInterval(()=>{
  fetch('/allPendingOrders')
    .then((res) => {
      return res.json();
    })
    .then(res=>main(res));
}, 800)

// setInterval(populateCards("Customer"), 1000);
// setInterval(populateCards("Stall"), 1000);
