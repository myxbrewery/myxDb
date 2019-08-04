function resetOrder(){
  fetch("/resetOrder",{
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  })
  .then((res)=>{return res.json()})
  .then((res)=>{console.log(res)});
}

function randElem(js_arr){
  return js_arr[Math.floor(Math.random() * js_arr.length)];
}

function randomOrder(){
  fetch("/locations")
    .then((res)=>{return res.json()})
    .then((res)=>{
      // let rand_location = randElem(res).id;
      rand_location = 1;
      fetch("/stalls/" + rand_location)
        .then((resp)=>{return resp.json()})
        .then((resp)=>{
          rand_stall = randElem(resp).id;
          while(rand_stall == 6 || rand_stall == 2 || rand_stall == 4) {
            rand_stall = randElem(resp).id;
          }
          fetch("/stallMenu/" + rand_location + "/" + rand_stall)
            .then((respo)=>{return respo.json()})
            .then((respo)=>{
              // Between 1 to 5 items ordered
              num_to_order = Math.floor(Math.random()*5)+1;
              customer_id = randElem([100, 101, 102, 103, 104, 105]);
              order_payload = {
                "metadata":{
                  "location_id": rand_location,
                  "stall_id": rand_stall,
                  "client_type": "school",
                  "customer_id": customer_id
                },
                "orders":[]
              }

              let total_payment = 0;
              for(let i=0;i<num_to_order;i++){
                randItem = randElem(respo);
                order = {
                  "stall_id": rand_stall,
                  "item_id": randItem.item_id,
                  "name": randItem.name
                }
                base_cost = parseFloat(parseFloat(randItem["school_price"]).toPrecision(7));
                add_cost = 0;
                compulsory_options = Object.keys(randItem["compulsory_options"]);
                // Choose one compulsory option for each compulsory category if exists
                var compulsory_option = {}
                if(compulsory_options.length!=0){
                  compulsory_options.forEach((category)=>{
                    compulsory_option[category] = {}
                    let possible_category_choices = Object.keys(randItem["compulsory_options"][category]);
                    let category_item_choice = randElem(possible_category_choices);
                    compulsory_option[category][category_item_choice]  = randItem["compulsory_options"][category][category_item_choice];
                    add_cost += parseFloat(parseFloat(randItem["compulsory_options"][category][category_item_choice]["cost"]).toPrecision(7));
                  })
                }

                // choose up to n optional options
                var optional_option = {};
                optional_options = Object.keys(randItem["optional_options"]);
                if(optional_options.length!=0){
                  for(var j=0;j<Math.floor(Math.random()*optional_options.length+1);j++){
                    let chosen_category = randElem(optional_options);
                    if(!(chosen_category in optional_option)){
                      // Chosen category has several options; pick n
                      optional_option[chosen_category] = {}
                      let category_options = Object.keys(randItem["optional_options"][chosen_category])
                      let used_options = {};
                      var chosen_num_of_options = Math.floor(Math.random()*2)
                      for(var k=0;k<chosen_num_of_options+1;k++){
                        let random_elem_idx = Math.floor(Math.random()*category_options.length);
                        if(!(random_elem_idx in used_options)){
                          used_options[random_elem_idx] = true;
                          optional_option[chosen_category][category_options[random_elem_idx]] = randItem["optional_options"][chosen_category][category_options[random_elem_idx]]
                          add_cost += parseFloat(parseFloat(randItem["optional_options"][chosen_category][category_options[random_elem_idx]]["cost"]).toPrecision(7));
                        }
                      }
                    }
                  }
                }
                order["base_price"] = base_cost;
                total_price = parseFloat(parseFloat(base_cost + add_cost).toPrecision(7));
                order["total_price"] = total_price;
                order["compulsory_options"] = compulsory_option;
                order["optional_options"] = optional_option;
                order["note"] = "Hi"

                order_payload["orders"].push(order);
                total_payment += total_price;
              }
              order_payload["metadata"]["total_payment"] = parseFloat(parseFloat(total_payment).toPrecision(7));

              console.log(order_payload);

              fetch("/order/", {
                method: 'POST',
                headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(order_payload)
              });
            });
        });
      });
}

document.getElementById("resetOrder").onclick = ()=>resetOrder();
document.getElementById("randomOrder").onclick = ()=>randomOrder();
