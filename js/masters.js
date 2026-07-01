// ===================== MASTER DATA CRUD =====================

const $ = (id)=>document.getElementById(id);
function toast(msg, isErr){
  const t = $("toast");
  t.textContent = msg;
  t.style.background = isErr ? "var(--danger)" : "var(--ink)";
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(()=>t.classList.remove("show"), 2600);
}

// table config: table name -> { title, color, fields:[{key,label,type}] }
const TABLES = {
  consignors:       { title:"Consignors",  color:"m1", fields:[{key:"name",label:"Name"}] },
  consignees:       { title:"Consignees",  color:"m1", fields:[{key:"name",label:"Name"}] },
  destinations:     { title:"Destinations",color:"m1", fields:[{key:"name",label:"Name"}] },
  grades:           { title:"Grades",      color:"m1", fields:[{key:"code",label:"Code"},{key:"name",label:"Grade Name"}] },
  dca_list:         { title:"DCA",         color:"m1", fields:[{key:"name",label:"Name"}] },
  unloading_points: { title:"Unloading Points", color:"m2", fields:[{key:"name",label:"Name"}] },
  brokers:          { title:"Brokers",     color:"m4", fields:[{key:"name",label:"Broker Name"},{key:"broker_number",label:"Broker Number"}] },
  ac_holders:       { title:"A/C Holders (Advance payout)", color:"m3", fields:[
                        {key:"holder_name",label:"Holder Name"},{key:"acc_number",label:"Account Number"},{key:"ifsc_code",label:"IFSC Code"}] },
};

(async function init(){
  const session = await requireAuth();
  if (!session) return;
  $("userEmail").textContent = session.user.email;
  await renderAllTables();
})();

async function renderAllTables(){
  const grid = $("mastersGrid");
  grid.innerHTML = Object.keys(TABLES).map(t=>`
    <div class="panel ${TABLES[t].color}" style="padding:16px;">
      <h2 style="font-size:16px;">${TABLES[t].title}</h2>
      <div class="table-wrap" style="margin:10px 0;">
        <table class="sheet" id="tbl_${t}"><thead></thead><tbody></tbody></table>
      </div>
      <form id="form_${t}" style="display:flex; gap:8px; flex-wrap:wrap;" onsubmit="return addRow(event,'${t}')">
        ${TABLES[t].fields.map(f=>`<input required placeholder="${f.label}" name="${f.key}" style="flex:1; min-width:120px; padding:8px; border:1px solid var(--paper-line); border-radius:6px; font-family:var(--font-mono);">`).join("")}
        <button class="btn btn-primary btn-sm" type="submit">Add</button>
      </form>
    </div>
  `).join("");

  for (const t of Object.keys(TABLES)) await loadTable(t);
}

async function loadTable(t){
  const { data, error } = await supabaseClient.from(t).select("*").order("created_at");
  if (error){ toast(error.message, true); return; }
  const cfg = TABLES[t];
  const table = $(`tbl_${t}`);
  table.querySelector("thead").innerHTML = `<tr>${cfg.fields.map(f=>`<th>${f.label}</th>`).join("")}<th></th></tr>`;
  table.querySelector("tbody").innerHTML = (data||[]).map(row=>`
    <tr>
      ${cfg.fields.map(f=>`<td>${row[f.key]||''}</td>`).join("")}
      <td><button class="btn btn-ghost btn-sm" onclick="deleteRow('${t}','${row.id}')">Delete</button></td>
    </tr>
  `).join("") || `<tr><td colspan="${cfg.fields.length+1}" style="color:var(--ink-soft); font-family:var(--font-body);">No rows yet</td></tr>`;
}

async function addRow(evt, t){
  evt.preventDefault();
  const form = evt.target;
  const payload = {};
  TABLES[t].fields.forEach(f=>{ payload[f.key] = form[f.key].value.trim(); });
  const { error } = await supabaseClient.from(t).insert(payload);
  if (error){ toast(error.message, true); return false; }
  form.reset();
  toast("Added");
  await loadTable(t);
  return false;
}

async function deleteRow(t, id){
  if (!confirm("Delete this entry?")) return;
  const { error } = await supabaseClient.from(t).delete().eq("id", id);
  if (error){ toast(error.message, true); return; }
  toast("Deleted");
  await loadTable(t);
}
