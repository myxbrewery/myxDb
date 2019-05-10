function resetOrder(){
  fetch("http://localhost:11235/resetOrder",{
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
  fetch("http://localhost:11235/locations")
    .then((res)=>{return res.json()})
    .then((res)=>{
      rand_location = randElem(res).id;
      fetch("http://localhost:11235/stalls/" + rand_location)
        .then((resp)=>{return resp.json()})
        .then((resp)=>{
          rand_stall = randElem(resp).id;
          fetch("http://localhost:11235/stalls/" + rand_location + "/" + rand_stall)
            .then((respo)=>{return respo.json()})
            .then((respo)=>{
              // Between 1 to 5 items ordered
              num_to_order = Math.floor(Math.random()*5)+1;
              order_payload = {
                "metadata":{},
                "orders":[]
              }
              for(let i=0;i<num_to_order;i++){
                randItem = randElem(respo);
                base_cost = randItem["school_price"];
                compulsory_options = Object.keys(randItem["compulsory_options"]);
                optional_options = Object.keys(randItem["optional_options"]);
                // Choose one compulsory option for each compulsory category if exists
                var compulsory_option = {}
                if(compulsory_options.length!=0){
                  compulsory_options.forEach((category)=>{
                    possible_category_choices = Object.keys(randItem["compulsory_options"][category]);
                    category_item_choice = randElem(possible_category_choices);
                    compulsory_option[category] = {
                      category_item_choice: randItem["compulsory_options"][category][category_item_choice]
                    }
                    base_cost += randItem["compulsory_options"][category][category_item_choice]["cost"];
                  })
                }
                // choose up to n optional options
                var optional_option = {}
                if(optional_options.length!=0){
                  for(var j=0;j<Math.floor(optional_options.length);j++){
                    let chosen_category = randElem(optional_options);
                    if(!(chosen_category in optional_option)){
                      // Chosen category has several options; pick n
                      optional_option[chosen_category] = {}
                      category_options = Object.keys(optional_options[chosen_category])
                      let used_options = new Set();
                      for(var k=0;k<Math.floor(category_options.length);k++){
                        random_elem_idx = Math.floor(Math.random()*category_options.length);
                        if(!(random_elem_idx in used_options)){
                          optional_option[chosen_category] = optional_options[chosen_category][category_options[random_elem_idx]];
                          used_options.add(random_elem_idx);
                        }
                      }
                      optional_option[chosen_category] = randItem["optional_options"][chosen_key];
                      base_cost += randItem["optional_options"][chosen_key]["cost"];
                    }
                  }
                }
              }
            });
        });
      });
}

document.getElementById("resetOrder").onclick = ()=>resetOrder();
document.getElementById("randomOrder").onclick = ()=>randomOrder();
