const base_url = "https://www.myxbrewapi.com";
function resetOrder(){
  fetch(base_url + "/resetOrder",{
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({'stall_uid':stallRoom})
  })
  .then((res)=>{return res.json()})
  .then((res)=>{console.log(res)});
}

function randElem(js_arr){
  return js_arr[Math.floor(Math.random() * js_arr.length)];
}

Array.prototype.random = function () {
  return this[Math.floor((Math.random()*this.length))];
}
randint = () =>{
  return parseInt(Math.random()*5);
}

async function randomOrder(){
  let stalls = await(fetch(base_url+"/stalls"))
    .then(res=>res.json());
  let random_stall = stalls.random();
  let stall_menu = await(fetch(base_url+"/menu/"+random_stall.uid))
    .then(res=>res.json());
  console.log(stall_menu)
  let categories = Object.keys(stall_menu)
  var order_package = {
    metadata: {
      client_type: "school",
      customer_id: 104,
      total_payment: 0,
      uid: random_stall.uid,
      menu_version: stall_menu[Object.keys(stall_menu)[0]][0].menu_version,
      delivery_time: new Date()
    },
    orders: []
  }
  for(var i=0; i < randint()+1; i++){
    category_choice = categories.random();
    let items = stall_menu[category_choice]
    item = items.random()
    var item_total_price = Math.round(item.base_price*100);
    var item_package = {
      item_id: item.id,
      base_price: item.base_price,
      compulsory_options: [],
      optional_options: [],
      note: ""
    }
    if(item.compulsory_options.length > 0){
      item.compulsory_options.forEach(option_category=>{
        compulsory_choice = option_category.options.random()
        item_package.compulsory_options.push({
          name: option_category.name,
          options: [{
            name: compulsory_choice.name,
            cost: compulsory_choice.cost
          }]
        });
        item_total_price += Math.round(compulsory_choice.cost*100);
      })
    }
    if(item.optional_options.length > 0){
      item.optional_options.forEach(option_category=>{
        option_category_package = {
          name: option_category.name,
          options: []
        }
        option_category.options.forEach(optional_choice=>{
          if(Math.random() > 0.8){
            option_category_package.options.push({
              name: optional_choice.name,
              cost: optional_choice.cost
            });
            item_total_price += Math.round(optional_choice.cost*100);
          }
        })
        item_package.optional_options.push(option_category_package)
      })
    }
    item_package.total_price = Math.round(item_total_price)/100;
    order_package.orders.push(item_package)
    order_package.metadata.total_payment += Math.round(item_package.total_price*100)
  }
  order_package.metadata.total_payment = Math.round(order_package.metadata.total_payment) / 100
  console.log("ORDERING");
  console.log(order_package);
  var res = await fetch(base_url+"/order/", {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(order_package)
  })
    .then(res=>res.json())
  ;
  console.log(res);
}

document.getElementById("resetOrder").onclick = ()=>resetOrder();
document.getElementById("randomOrder").onclick = ()=>randomOrder();
