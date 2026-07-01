// =====================================================================
// TRUCK LEDGER — app.js
// =====================================================================

let CURRENT_USER = null;
let MASTERS = {};          // cached lookup rows
let CURRENT_ENTRY = null;  // the truck_entries row currently open in the wizard
let GC_ROWS = [];          // in-memory gc rows for module 4.2

const $ = (id) => document.getElementById(id);
function toast(msg, isErr){
  const t = $("toast");
  t.textContent = msg;
  t.style.background = isErr ? "var(--danger)" : "var(--ink)";
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(()=>t.classList.remove("show"), 2600);
}

// ---------------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------------
(async function init(){
  const session = await requireAuth();
  if (!session) return;
  CURRENT_USER = session.user;
  $("userEmail").textContent = CURRENT_USER.email;

  await loadMasters();
  populateAllSelects();
  await loadEntries();
})();

// ---------------------------------------------------------------------
// MASTER DATA
// ---------------------------------------------------------------------
async function loadMasters(){
  const tables = ["consignors","consignees","destinations","grades","dca_list","unloading_points","brokers","ac_holders"];
  const results = await Promise.all(tables.map(t => supabaseClient.from(t).select("*").order("created_at")));
  tables.forEach((t,i) => { MASTERS[t] = results[i].data || []; });
}

function fillSelect(selectEl, rows, labelFn, valueField="id", placeholder="— select —"){
  selectEl.innerHTML = `<option value="">${placeholder}</option>` +
    rows.map(r => `<option value="${r[valueField]}">${labelFn(r)}</option>`).join("");
}

function populateAllSelects(){
  fillSelect($("f_consignor_id"), MASTERS.consignors, r=>r.name);
  fillSelect($("f_consignee_id"), MASTERS.consignees, r=>r.name);
  fillSelect($("f_destination_id"), MASTERS.destinations, r=>r.name);
  fillSelect($("f_grade_id"), MASTERS.grades, r=>`${r.code} — ${r.name}`);
  fillSelect($("f_dca_id"), MASTERS.dca_list, r=>r.name);
  fillSelect($("f_adv_ac_holder_id"), MASTERS.ac_holders, r=>r.holder_name);
  fillSelect($("f_broker_id"), MASTERS.brokers, r=>r.name);

  $("unloadingPointsList").innerHTML =
    MASTERS.unloading_points.map(r=>`<option value="${r.name}">`).join("");
}

// Grade auto-fill
$("f_grade_id")?.addEventListener("change", (e)=>{
  const g = MASTERS.grades.find(x=>x.id===e.target.value);
  $("f_grade_name").value = g ? g.name : "";
});
// ADV A/C holder auto-fill
$("f_adv_ac_holder_id")?.addEventListener("change", (e)=>{
  const h = MASTERS.ac_holders.find(x=>x.id===e.target.value);
  $("f_adv_ac_number").value = h ? h.acc_number : "";
  $("f_adv_ifsc_code").value = h ? h.ifsc_code : "";
});
// Broker auto-fill
$("f_broker_id")?.addEventListener("change", (e)=>{
  const b = MASTERS.brokers.find(x=>x.id===e.target.value);
  $("f_broker_number").value = b ? b.broker_number : "";
});
// C Qty live calc (Module 1)
["f_a_qty","f_c_qty_manual"].forEach(id=>{
  $(id)?.addEventListener("input", recalcCQty);
});
function recalcCQty(){
  const a = parseFloat($("f_a_qty").value)||0;
  const m = parseFloat($("f_c_qty_manual").value)||0;
  $("f_c_qty").value = (a+m).toFixed(2);
}
// GatePass Date/Time auto-fill once Get Pass No is entered
$("f_get_pass_no")?.addEventListener("blur", ()=>{
  if ($("f_get_pass_no").value.trim() && !$("f_gatepass_datetime").value){
    $("f_gatepass_datetime").value = new Date().toLocaleString();
  }
});
// Module 3 live calcs
["f_pmt_rate","f_unloading_others","f_lm","f_pm","f_un_exp","f_mrp_diesel","f_bal"].forEach(id=>{
  $(id)?.addEventListener("input", recalcModule3);
});
function recalcModule3(){
  const rate = parseFloat($("f_pmt_rate").value)||0;
  const unl  = parseFloat($("f_unloading_others").value)||0;
  const totalPmt = rate + unl;
  $("f_total_pmt").value = totalPmt.toFixed(2);

  const cQty = parseFloat(CURRENT_ENTRY?.c_qty)||0;
  const totalFreight = cQty * totalPmt;
  $("f_total_freight").value = totalFreight.toFixed(2);

  const lm=parseFloat($("f_lm").value)||0, pm=parseFloat($("f_pm").value)||0,
        un=parseFloat($("f_un_exp").value)||0, diesel=parseFloat($("f_mrp_diesel").value)||0,
        bal=parseFloat($("f_bal").value)||0;
  // NOTE: Advance = Total Freight minus all deductions.
  // Adjust this formula in recalcModule3() if your business rule differs.
  const advance = totalFreight - lm - pm - un - diesel - bal;
  $("f_advance").value = advance.toFixed(2);
}

// ---------------------------------------------------------------------
// AUDIT-LOGGED SAVE
// ---------------------------------------------------------------------
async function saveWithAudit(module, fields, nextStatus){
  const isNew = !CURRENT_ENTRY;
  let entryId = CURRENT_ENTRY?.id;

  if (!isNew){
    // diff against what we currently have in memory, log any changes
    const auditRows = [];
    Object.keys(fields).forEach(key=>{
      const oldVal = CURRENT_ENTRY[key];
      const newVal = fields[key];
      const oldStr = (oldVal===null||oldVal===undefined) ? "" : String(oldVal);
      const newStr = (newVal===null||newVal===undefined) ? "" : String(newVal);
      if (oldStr !== newStr){
        auditRows.push({
          truck_entry_id: entryId, module, field_name: key,
          old_value: oldStr, new_value: newStr, changed_by: CURRENT_USER.id
        });
      }
    });
    if (auditRows.length){
      await supabaseClient.from("audit_log").insert(auditRows);
    }
  }

  const payload = { ...fields };
  if (nextStatus) payload.status = nextStatus;

  if (isNew){
    payload.created_by = CURRENT_USER.id;
    const { data, error } = await supabaseClient.from("truck_entries").insert(payload).select().single();
    if (error){ toast(error.message, true); throw error; }
    CURRENT_ENTRY = data;
  } else {
    const { data, error } = await supabaseClient.from("truck_entries").update(payload).eq("id", entryId).select().single();
    if (error){ toast(error.message, true); throw error; }
    CURRENT_ENTRY = data;
  }
  return CURRENT_ENTRY;
}

// ---------------------------------------------------------------------
// MODULE SAVE HANDLERS
// ---------------------------------------------------------------------
async function saveModule1(){
  const grade = MASTERS.grades.find(g=>g.id===$("f_grade_id").value);
  const fields = {
    consignor_id: $("f_consignor_id").value || null,
    consignee_id: $("f_consignee_id").value || null,
    so_number: $("f_so_number").value,
    destination_id: $("f_destination_id").value || null,
    bags: parseFloat($("f_bags").value)||null,
    a_qty: parseFloat($("f_a_qty").value)||null,
    grade_id: $("f_grade_id").value || null,
    grade_name: grade ? grade.name : null,
    sold_to_party: $("f_sold_to_party").value,
    ship_to_party: $("f_ship_to_party").value,
    do_number: $("f_do_number").value,
    indent_no: $("f_indent_no").value,
    entry_date: $("f_entry_date").value || null,
    entry_time: new Date().toTimeString().split(" ")[0],
    c_qty_manual: parseFloat($("f_c_qty_manual").value)||0,
    c_qty: parseFloat($("f_c_qty").value)||0,
    unloading_point: $("f_unloading_point").value,
    dca_id: $("f_dca_id").value || null,
    m1_completed_at: new Date().toISOString(),
  };
  if (!fields.consignor_id || !fields.consignee_id){
    toast("Consignor and Consignee are required", true); return;
  }
  await saveWithAudit("module1", fields, "module2");
  toast("Module 1 saved");
  await loadEntries();
  showModulePanel("module2");
}

async function saveModule2(){
  const fields = {
    lorry_no: $("f_lorry_no").value,
    mobile_no: $("f_mobile_no").value,
    remarks: $("f_remarks").value,
    get_pass_no: $("f_get_pass_no").value,
    gatepass_datetime: $("f_gatepass_datetime").value ? new Date($("f_gatepass_datetime").value).toISOString() : null,
    final_gatepass_no: $("f_final_gatepass_no").value,
    m2_completed_at: new Date().toISOString(),
  };
  await saveWithAudit("module2", fields, "module3");
  toast("Module 2 saved");
  await loadEntries();
  showModulePanel("module3");
}

async function saveModule3(){
  recalcModule3();
  const holder = MASTERS.ac_holders.find(h=>h.id===$("f_adv_ac_holder_id").value);
  const fields = {
    pmt_rate: parseFloat($("f_pmt_rate").value)||0,
    unloading_others: parseFloat($("f_unloading_others").value)||0,
    total_pmt: parseFloat($("f_total_pmt").value)||0,
    total_freight: parseFloat($("f_total_freight").value)||0,
    lm: parseFloat($("f_lm").value)||0,
    pm: parseFloat($("f_pm").value)||0,
    un_exp: parseFloat($("f_un_exp").value)||0,
    mrp_diesel: parseFloat($("f_mrp_diesel").value)||0,
    bal: parseFloat($("f_bal").value)||0,
    advance: parseFloat($("f_advance").value)||0,
    adv_ac_holder_id: $("f_adv_ac_holder_id").value || null,
    adv_ac_number: holder ? holder.acc_number : null,
    adv_ifsc_code: holder ? holder.ifsc_code : null,
    bal_ac_holder: $("f_bal_ac_holder").value,
    bal_acc_no: $("f_bal_acc_no").value,
    bal_ifsc: $("f_bal_ifsc").value,
    m3_completed_at: new Date().toISOString(),
  };
  await saveWithAudit("module3", fields, "module4");
  toast("Module 3 saved");
  await loadEntries();
  showModulePanel("module4");
}

async function saveModule4(){
  const broker = MASTERS.brokers.find(b=>b.id===$("f_broker_id").value);
  const fields = {
    eway_bill_no: $("f_eway_bill_no").value,
    eway_bill_expiry: $("f_eway_bill_expiry").value || null,
    broker_id: $("f_broker_id").value || null,
    broker_number: broker ? broker.broker_number : null,
    mf: $("f_mf").value,
    total_invoice_value: parseFloat($("f_total_invoice_value").value)||null,
    invoice_no: $("f_invoice_no").value,
    invoice_date: $("f_invoice_date").value || null,
    multiple_gc: GC_ROWS.length>0,
    m4_completed_at: new Date().toISOString(),
  };
  await saveWithAudit("module4", fields, "completed");
  await saveGCRows();
  toast("Truck entry completed ✓");
  await loadEntries();
  showModulePanel("completed");
}

// ---------------------------------------------------------------------
// GC ROWS (Sub Module 4.2)
// ---------------------------------------------------------------------
function setMultipleGC(on){
  $("gcYesBtn").classList.toggle("on", on);
  $("gcNoBtn").classList.toggle("on", !on);
  $("gcSection").classList.toggle("hidden", !on);
  if (on && GC_ROWS.length===0) addGCRow();
  if (!on) { GC_ROWS = []; renderGCRows(); }
}
function addGCRow(){
  GC_ROWS.push({ gc_number:"", weight:0, amount:0 });
  renderGCRows();
}
function removeGCRow(i){ GC_ROWS.splice(i,1); renderGCRows(); }
function updateGCRow(i, key, val){
  GC_ROWS[i][key] = key==="weight" ? (parseFloat(val)||0) : val;
  recalcGCAmounts();
}
function recalcGCAmounts(){
  const totalFreight = parseFloat(CURRENT_ENTRY?.total_freight)||0;
  const totalWeight = GC_ROWS.reduce((s,r)=>s+(parseFloat(r.weight)||0),0);
  GC_ROWS.forEach(r=>{
    r.amount = totalWeight>0 ? (totalFreight * (r.weight/totalWeight)) : 0;
  });
  $("gcFreightTotal").textContent = totalFreight.toFixed(2);
  renderGCRows(true);
}
function renderGCRows(skipRebuildInputs){
  const wrap = $("gcRows");
  wrap.innerHTML = GC_ROWS.map((r,i)=>`
    <div class="gc-row">
      <input placeholder="GC Number" value="${r.gc_number||''}" onchange="updateGCRow(${i},'gc_number',this.value)">
      <input placeholder="Weight" type="number" step="any" value="${r.weight||''}" oninput="updateGCRow(${i},'weight',this.value)">
      <input placeholder="Amount (auto)" value="${(r.amount||0).toFixed(2)}" readonly>
      <button type="button" class="btn btn-ghost btn-sm" onclick="removeGCRow(${i})">✕</button>
    </div>`).join("");
}
async function saveGCRows(){
  if (!CURRENT_ENTRY) return;
  await supabaseClient.from("gc_details").delete().eq("truck_entry_id", CURRENT_ENTRY.id);
  if (GC_ROWS.length){
    const rows = GC_ROWS.map(r=>({ truck_entry_id: CURRENT_ENTRY.id, gc_number:r.gc_number, weight:r.weight, amount:r.amount }));
    await supabaseClient.from("gc_details").insert(rows);
  }
}

// ---------------------------------------------------------------------
// CANCEL / BACK FLOW
// ---------------------------------------------------------------------
async function cancelModule(prevStatus){
  if (!CURRENT_ENTRY) { showModulePanel(prevStatus); return; }
  const { data, error } = await supabaseClient.from("truck_entries")
    .update({ status: prevStatus }).eq("id", CURRENT_ENTRY.id).select().single();
  if (error){ toast(error.message, true); return; }
  CURRENT_ENTRY = data;
  toast(`Back to ${prevStatus.replace('module','Module ')}`);
  await loadEntries();
  showModulePanel(prevStatus);
}

async function cancelTruckEntirely(){
  if (!CURRENT_ENTRY){ backToDashboard(); return; }
  if (!confirm("Cancel this entire truck entry? This can be done at any module.")) return;
  const { error } = await supabaseClient.from("truck_entries")
    .update({ status:"cancelled", cancelled:true, cancelled_at:new Date().toISOString() })
    .eq("id", CURRENT_ENTRY.id);
  if (error){ toast(error.message, true); return; }
  toast("Truck entry cancelled");
  await loadEntries();
  backToDashboard();
}

// ---------------------------------------------------------------------
// NAVIGATION / RENDERING
// ---------------------------------------------------------------------
function backToDashboard(){
  CURRENT_ENTRY = null;
  $("entryView").classList.add("hidden");
  $("dashboardView").classList.remove("hidden");
}

function openNewEntry(){
  CURRENT_ENTRY = null;
  GC_ROWS = [];
  clearAllFields();
  $("f_entry_time").value = new Date().toLocaleTimeString();
  $("dashboardView").classList.add("hidden");
  $("entryView").classList.remove("hidden");
  showModulePanel("module1");
}

async function openEntry(id){
  const { data, error } = await supabaseClient.from("truck_entries").select("*").eq("id", id).single();
  if (error){ toast(error.message, true); return; }
  CURRENT_ENTRY = data;
  await loadFieldsFromEntry(data);
  $("dashboardView").classList.add("hidden");
  $("entryView").classList.remove("hidden");
  showModulePanel(data.status);
}

function clearAllFields(){
  document.querySelectorAll(".panel input, .panel select").forEach(el=>{
    if (el.tagName==="SELECT") el.value=""; else if (el.type!=="button") el.value="";
  });
  $("f_c_qty_manual").value = 0;
  ["f_lm","f_pm","f_un_exp","f_mrp_diesel","f_bal"].forEach(id=>$(id).value=0);
  setMultipleGC(false);
}

async function loadFieldsFromEntry(e){
  clearAllFields();
  // Module 1
  $("f_consignor_id").value = e.consignor_id||"";
  $("f_consignee_id").value = e.consignee_id||"";
  $("f_so_number").value = e.so_number||"";
  $("f_destination_id").value = e.destination_id||"";
  $("f_bags").value = e.bags ?? "";
  $("f_a_qty").value = e.a_qty ?? "";
  $("f_grade_id").value = e.grade_id||"";
  $("f_grade_name").value = e.grade_name||"";
  $("f_sold_to_party").value = e.sold_to_party||"";
  $("f_ship_to_party").value = e.ship_to_party||"";
  $("f_do_number").value = e.do_number||"";
  $("f_indent_no").value = e.indent_no||"";
  $("f_entry_date").value = e.entry_date||"";
  $("f_entry_time").value = e.entry_time||"";
  $("f_c_qty_manual").value = e.c_qty_manual ?? 0;
  $("f_c_qty").value = e.c_qty ?? "";
  $("f_unloading_point").value = e.unloading_point||"";
  $("f_dca_id").value = e.dca_id||"";
  // Module 2
  $("f_lorry_no").value = e.lorry_no||"";
  $("f_mobile_no").value = e.mobile_no||"";
  $("f_remarks").value = e.remarks||"";
  $("f_get_pass_no").value = e.get_pass_no||"";
  $("f_gatepass_datetime").value = e.gatepass_datetime ? new Date(e.gatepass_datetime).toLocaleString() : "";
  $("f_final_gatepass_no").value = e.final_gatepass_no||"";
  // Module 3
  $("f_pmt_rate").value = e.pmt_rate ?? "";
  $("f_unloading_others").value = e.unloading_others ?? "";
  $("f_total_pmt").value = e.total_pmt ?? "";
  $("f_total_freight").value = e.total_freight ?? "";
  $("f_lm").value = e.lm ?? 0;
  $("f_pm").value = e.pm ?? 0;
  $("f_un_exp").value = e.un_exp ?? 0;
  $("f_mrp_diesel").value = e.mrp_diesel ?? 0;
  $("f_bal").value = e.bal ?? 0;
  $("f_advance").value = e.advance ?? "";
  $("f_adv_ac_holder_id").value = e.adv_ac_holder_id||"";
  $("f_adv_ac_number").value = e.adv_ac_number||"";
  $("f_adv_ifsc_code").value = e.adv_ifsc_code||"";
  $("f_bal_ac_holder").value = e.bal_ac_holder||"";
  $("f_bal_acc_no").value = e.bal_acc_no||"";
  $("f_bal_ifsc").value = e.bal_ifsc||"";
  // Module 4
  $("f_eway_bill_no").value = e.eway_bill_no||"";
  $("f_eway_bill_expiry").value = e.eway_bill_expiry||"";
  $("f_broker_id").value = e.broker_id||"";
  $("f_broker_number").value = e.broker_number||"";
  $("f_mf").value = e.mf||"";
  $("f_total_invoice_value").value = e.total_invoice_value ?? "";
  $("f_invoice_no").value = e.invoice_no||"";
  $("f_invoice_date").value = e.invoice_date||"";

  if (e.multiple_gc){
    const { data } = await supabaseClient.from("gc_details").select("*").eq("truck_entry_id", e.id);
    GC_ROWS = (data||[]).map(r=>({ gc_number:r.gc_number, weight:r.weight, amount:r.amount }));
    setMultipleGC(true);
    recalcGCAmounts();
  } else {
    setMultipleGC(false);
  }

  renderContextGrids(e);
}

function contextLabel(e){
  const consignee = MASTERS.consignees.find(c=>c.id===e.consignee_id);
  return `
    <div class="cell readonly"><label>Consignee</label><input readonly value="${consignee?consignee.name:''}"></div>
    <div class="cell readonly"><label>Do Number</label><input readonly value="${e.do_number||''}"></div>
    <div class="cell readonly"><label>C Qty</label><input readonly value="${e.c_qty??''}"></div>
    <div class="cell readonly"><label>Unloading Point</label><input readonly value="${e.unloading_point||''}"></div>
  `;
}
function renderContextGrids(e){
  $("m2Context").innerHTML = contextLabel(e);
  $("m3Context").innerHTML = contextLabel(e);
  $("m4Context").innerHTML = contextLabel(e);
}

function showModulePanel(status){
  ["panelModule1","panelModule2","panelModule3","panelModule4","panelCompleted"].forEach(p=>$(p).classList.add("hidden"));
  document.querySelectorAll(".ledger-tab").forEach(t=>t.classList.remove("active","done"));

  const order = ["module1","module2","module3","module4","completed"];
  const idx = order.indexOf(status);

  ["module1","module2","module3","module4"].forEach((m,i)=>{
    const tab = document.querySelector(`.ledger-tab[data-m="${m}"]`);
    if (i < idx) tab.classList.add("done");
    if (i === idx) tab.classList.add("active");
  });

  if (status==="completed"){
    $("panelCompleted").classList.remove("hidden");
    renderCompletedSummary();
  } else {
    const map = { module1:"panelModule1", module2:"panelModule2", module3:"panelModule3", module4:"panelModule4" };
    $(map[status]).classList.remove("hidden");
  }
  if (status==="module1" && CURRENT_ENTRY) recalcCQty();
  if (status==="module3") recalcModule3();
}

function renderCompletedSummary(){
  const e = CURRENT_ENTRY;
  if (!e) return;
  const consignor = MASTERS.consignors.find(c=>c.id===e.consignor_id);
  const consignee = MASTERS.consignees.find(c=>c.id===e.consignee_id);
  $("completedSummary").innerHTML = `
    <div class="grid">
      <div class="cell readonly"><label>Consignor</label><input readonly value="${consignor?consignor.name:''}"></div>
      <div class="cell readonly"><label>Consignee</label><input readonly value="${consignee?consignee.name:''}"></div>
      <div class="cell readonly"><label>Lorry No</label><input readonly value="${e.lorry_no||''}"></div>
      <div class="cell readonly"><label>C Qty</label><input readonly value="${e.c_qty??''}"></div>
      <div class="cell readonly"><label>Total Freight</label><input readonly value="${e.total_freight??''}"></div>
      <div class="cell readonly"><label>Advance</label><input readonly value="${e.advance??''}"></div>
      <div class="cell readonly"><label>Invoice No</label><input readonly value="${e.invoice_no||''}"></div>
      <div class="cell readonly"><label>Eway Bill No</label><input readonly value="${e.eway_bill_no||''}"></div>
    </div>`;
}

// ---------------------------------------------------------------------
// DASHBOARD LIST — server-side pagination + search + status filter
// (needed once the table has thousands / lakhs of rows — never pull
// the whole table into the browser)
// ---------------------------------------------------------------------
const PAGE_SIZE = 50;
let CURRENT_PAGE = 0;      // 0-based
let HAS_NEXT_PAGE = false;
let SEARCH_TERM = "";
let STATUS_FILTER = "";
let SEARCH_DEBOUNCE;

$("searchBox")?.addEventListener("input", (e)=>{
  clearTimeout(SEARCH_DEBOUNCE);
  SEARCH_DEBOUNCE = setTimeout(()=>{
    SEARCH_TERM = e.target.value.trim();
    CURRENT_PAGE = 0;
    loadEntries();
  }, 350); // debounce so we don't hit the DB on every keystroke
});
$("statusFilter")?.addEventListener("change", (e)=>{
  STATUS_FILTER = e.target.value;
  CURRENT_PAGE = 0;
  loadEntries();
});
function resetFilters(){
  $("searchBox").value = "";
  $("statusFilter").value = "";
  SEARCH_TERM = ""; STATUS_FILTER = ""; CURRENT_PAGE = 0;
  loadEntries();
}
function nextPage(){ if (HAS_NEXT_PAGE){ CURRENT_PAGE++; loadEntries(); } }
function prevPage(){ if (CURRENT_PAGE>0){ CURRENT_PAGE--; loadEntries(); } }

async function loadEntries(){
  const from = CURRENT_PAGE * PAGE_SIZE;
  // fetch one extra row past the page to know if there's a next page,
  // without running a slow exact COUNT(*) on a huge table
  const to = from + PAGE_SIZE; // inclusive range of PAGE_SIZE+1 rows

  let query = supabaseClient.from("truck_entries")
    .select("*")
    .order("created_at", { ascending:false })
    .range(from, to);

  if (STATUS_FILTER){
    query = query.eq("status", STATUS_FILTER);
  }
  if (SEARCH_TERM){
    const term = SEARCH_TERM.replace(/[%,()]/g, ""); // strip characters that break the OR filter syntax
    query = query.or(
      `do_number.ilike.%${term}%,lorry_no.ilike.%${term}%,invoice_no.ilike.%${term}%,` +
      `eway_bill_no.ilike.%${term}%,get_pass_no.ilike.%${term}%,indent_no.ilike.%${term}%,so_number.ilike.%${term}%`
    );
  }

  const { data, error } = await query;
  if (error){ toast(error.message, true); return; }

  HAS_NEXT_PAGE = (data||[]).length > PAGE_SIZE;
  const pageRows = (data||[]).slice(0, PAGE_SIZE);
  renderEntriesTable(pageRows);

  $("pageInfo").textContent = `Page ${CURRENT_PAGE+1}${pageRows.length===0 ? " — no results" : ""}`;
  $("prevPageBtn").disabled = CURRENT_PAGE===0;
  $("nextPageBtn").disabled = !HAS_NEXT_PAGE;
}

function renderEntriesTable(rows){
  const body = $("entriesBody");
  if (!rows.length){
    body.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:26px; font-family:var(--font-body); color:var(--ink-soft);">No truck entries yet — click “New Truck Entry” to start one.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(r=>{
    const consignor = MASTERS.consignors.find(c=>c.id===r.consignor_id);
    const consignee = MASTERS.consignees.find(c=>c.id===r.consignee_id);
    const statusLabel = r.status==="cancelled" ? "cancelled" : r.status;
    return `
      <tr>
        <td>${r.entry_no}</td>
        <td><span class="badge ${statusLabel}">${statusLabel.replace('module','Module ')}</span></td>
        <td>${consignor?consignor.name:'—'}</td>
        <td>${consignee?consignee.name:'—'}</td>
        <td>${r.do_number||'—'}</td>
        <td>${r.lorry_no||'—'}</td>
        <td>${r.c_qty??'—'}</td>
        <td>${r.total_freight??'—'}</td>
        <td>${r.invoice_no||'—'}</td>
        <td>${new Date(r.created_at).toLocaleDateString()}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="openEntry('${r.id}')">${r.status==='cancelled'?'View':'Open'}</button></td>
      </tr>`;
  }).join("");
}
