// ============================================================
// Cote Cup 2026 — Cloudflare Worker v2
// Smart schedule-aware polling — zero requests outside match windows
// One API call per cycle pulls everything: live, completed, upcoming
// ============================================================

const API_BASE  = "https://api.football-data.org/v4";

const COMPETITION = "WC";
const MATCH_DURATION_MS = 3.5 * 60 * 60 * 1000; // 3.5 hours per match window

// ── FULL TOURNAMENT SCHEDULE ──────────────────────────────────────────────────
// Each entry is [YYYY-MM-DD, kickoff_utc_hour, kickoff_utc_minute]
// Source: FIFA official schedule, verified via Al Jazeera / ESPN
const SCHEDULE = [
  ["2026-06-11", 19,  0],  // Mexico vs South Africa
  ["2026-06-12",  2,  0],  // South Korea vs Czechia
  ["2026-06-12", 19,  0],  // Canada vs Bosnia
  ["2026-06-13",  1,  0],  // USA vs Paraguay
  ["2026-06-13", 19,  0],  // Qatar vs Switzerland
  ["2026-06-13", 22,  0],  // Brazil vs Morocco
  ["2026-06-14",  1,  0],  // Haiti vs Scotland
  ["2026-06-14",  4,  0],  // Australia vs Turkiye
  ["2026-06-14", 17,  0],  // Germany vs Curacao
  ["2026-06-14", 20,  0],  // Netherlands vs Japan
  ["2026-06-14", 23,  0],  // Ivory Coast vs Ecuador
  ["2026-06-15",  2,  0],  // Sweden vs Tunisia
  ["2026-06-15", 16,  0],  // Spain vs Cape Verde
  ["2026-06-15", 19,  0],  // Belgium vs Egypt
  ["2026-06-15", 22,  0],  // Saudi Arabia vs Uruguay
  ["2026-06-16",  1,  0],  // Iran vs New Zealand
  ["2026-06-16", 19,  0],  // France vs Senegal
  ["2026-06-16", 22,  0],  // Iraq vs Norway
  ["2026-06-17",  1,  0],  // Argentina vs Algeria
  ["2026-06-17",  4,  0],  // Austria vs Jordan
  ["2026-06-17", 17,  0],  // Portugal vs DR Congo
  ["2026-06-17", 20,  0],  // England vs Croatia
  ["2026-06-17", 23,  0],  // Ghana vs Panama
  ["2026-06-18",  2,  0],  // Uzbekistan vs Colombia
  ["2026-06-18", 16,  0],  // Czechia vs South Africa
  ["2026-06-18", 19,  0],  // Switzerland vs Bosnia
  ["2026-06-18", 22,  0],  // Canada vs Qatar
  ["2026-06-19",  1,  0],  // Mexico vs South Korea
  ["2026-06-19", 19,  0],  // USA vs Australia
  ["2026-06-19", 22,  0],  // Scotland vs Morocco
  ["2026-06-20",  0, 30],  // Brazil vs Haiti
  ["2026-06-20",  4,  0],  // Turkiye vs Paraguay
  ["2026-06-20", 17,  0],  // Netherlands vs Sweden
  ["2026-06-20", 20,  0],  // Germany vs Ivory Coast
  ["2026-06-21",  0,  0],  // Ecuador vs Curacao
  ["2026-06-21",  4,  0],  // Tunisia vs Japan
  ["2026-06-21", 16,  0],  // Spain vs Saudi Arabia
  ["2026-06-21", 19,  0],  // Belgium vs Iran
  ["2026-06-21", 22,  0],  // Uruguay vs Cape Verde
  ["2026-06-22",  1,  0],  // New Zealand vs Egypt
  ["2026-06-22", 17,  0],  // Argentina vs Austria
  ["2026-06-22", 21,  0],  // France vs Iraq
  ["2026-06-23",  1,  0],  // Norway vs Senegal
  ["2026-06-23",  3,  0],  // Jordan vs Algeria
  ["2026-06-23", 17,  0],  // Portugal vs Uzbekistan
  ["2026-06-23", 20,  0],  // England vs Ghana
  ["2026-06-23", 23,  0],  // Panama vs Croatia
  ["2026-06-24",  2,  0],  // Colombia vs DR Congo
  ["2026-06-24", 19,  0],  // Switzerland vs Canada
  ["2026-06-24", 19,  0],  // Bosnia vs Qatar
  ["2026-06-24", 22,  0],  // Scotland vs Brazil
  ["2026-06-24", 22,  0],  // Morocco vs Haiti
  ["2026-06-25",  1,  0],  // Czechia vs Mexico
  ["2026-06-25",  1,  0],  // South Africa vs South Korea
  ["2026-06-25", 20,  0],  // Ecuador vs Germany
  ["2026-06-25", 20,  0],  // Curacao vs Ivory Coast
  ["2026-06-25", 23,  0],  // Japan vs Sweden
  ["2026-06-25", 23,  0],  // Tunisia vs Netherlands
  ["2026-06-26",  2,  0],  // Turkiye vs USA
  ["2026-06-26",  2,  0],  // Paraguay vs Australia
  ["2026-06-26", 19,  0],  // Norway vs France
  ["2026-06-26", 19,  0],  // Senegal vs Iraq
  ["2026-06-27",  1,  0],  // New Zealand vs Belgium
  ["2026-06-27",  1,  0],  // Egypt vs Iran
  ["2026-06-27",  3,  0],  // Cape Verde vs Saudi Arabia
  ["2026-06-27",  3,  0],  // Uruguay vs Spain
  ["2026-06-27", 21,  0],  // Panama vs England
  ["2026-06-27", 21,  0],  // Croatia vs Ghana
  ["2026-06-27", 23, 30],  // Colombia vs Portugal
  ["2026-06-27", 23, 30],  // DR Congo vs Uzbekistan
  ["2026-06-28",  2,  0],  // Algeria vs Austria
  ["2026-06-28",  2,  0],  // Jordan vs Argentina
  ["2026-06-28", 19,  0],  // R32 Match 1
  ["2026-06-29", 17,  0],  // R32 Match 2
  ["2026-06-29", 20, 30],  // R32 Match 3
  ["2026-06-30",  1,  0],  // R32 Match 4
  ["2026-06-30", 17,  0],  // R32 Match 5
  ["2026-06-30", 21,  0],  // R32 Match 6
  ["2026-07-01",  1,  0],  // R32 Match 7
  ["2026-07-01", 16,  0],  // R32 Match 8
  ["2026-07-01", 20,  0],  // R32 Match 9
  ["2026-07-02",  0,  0],  // R32 Match 10
  ["2026-07-02", 19,  0],  // R32 Match 11
  ["2026-07-02", 23,  0],  // R32 Match 12
  ["2026-07-03",  3,  0],  // R32 Match 13
  ["2026-07-03", 18,  0],  // R32 Match 14
  ["2026-07-03", 22,  0],  // R32 Match 15
  ["2026-07-04",  1, 30],  // R32 Match 16
  ["2026-07-04", 17,  0],  // R16 Match 1
  ["2026-07-04", 21,  0],  // R16 Match 2
  ["2026-07-05", 20,  0],  // R16 Match 3
  ["2026-07-06",  0,  0],  // R16 Match 4
  ["2026-07-06", 19,  0],  // R16 Match 5
  ["2026-07-07",  0,  0],  // R16 Match 6
  ["2026-07-07", 16,  0],  // R16 Match 7
  ["2026-07-07", 20,  0],  // R16 Match 8
  ["2026-07-09", 20,  0],  // QF Match 1
  ["2026-07-10", 19,  0],  // QF Match 2
  ["2026-07-11", 21,  0],  // QF Match 3
  ["2026-07-12",  1,  0],  // QF Match 4
  ["2026-07-14", 19,  0],  // Semifinal 1
  ["2026-07-15", 19,  0],  // Semifinal 2
  ["2026-07-18", 19,  0],  // Third Place
  ["2026-07-19", 19,  0],  // Final
];

// ── CORS ─────────────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};




// ── REPORT HTML ───────────────────────────────────────────────────────────────
const REPORT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cote Cup — Visitor Report</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
<style>
:root{--bg:#080c14;--panel:#0f1623;--panel2:#141d2e;--panel3:#1a2540;--border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.13);--gold:#e8b84b;--green:#3ecf74;--blue:#4a9eff;--red:#e05252;--text:#eef2f7;--muted:#7a8ba8;}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;min-height:100vh}
.header{background:var(--panel);border-bottom:1px solid var(--border2);padding:.9rem 1.5rem;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
.title{font-size:1.2rem;font-weight:800;letter-spacing:-.02em}.title span{color:var(--gold)}
.sub{font-size:.62rem;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-top:2px}
.hdr-r{display:flex;align-items:center;gap:.75rem}
.meta{font-size:.7rem;color:var(--muted)}
.btn{background:none;border:1px solid var(--border2);color:var(--muted);font-size:.72rem;padding:5px 14px;border-radius:6px;cursor:pointer;transition:all .15s}.btn:hover{color:var(--text);border-color:var(--gold)}
.page{padding:1.25rem 1.5rem;max-width:1300px;margin:0 auto}
.stats-row{display:grid;grid-template-columns:repeat(5,1fr);gap:.75rem;margin-bottom:1.25rem}
.stat{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:.85rem 1rem}
.stat-lbl{font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}
.stat-val{font-size:1.6rem;font-weight:900;color:var(--gold);line-height:1}
.stat-sub{font-size:.68rem;color:var(--muted);margin-top:3px}
.tabs{display:flex;gap:4px;background:var(--panel2);padding:3px;border-radius:8px;width:fit-content;margin-bottom:1rem}
.tab{background:none;border:none;color:var(--muted);font-size:.75rem;padding:5px 16px;border-radius:6px;cursor:pointer;transition:all .15s}
.tab.active{background:var(--panel3);color:var(--text);font-weight:600}
.main-row{display:grid;grid-template-columns:1fr 270px;gap:1.25rem;margin-bottom:1.25rem;align-items:start}
.main-row.expanded{grid-template-columns:1fr 400px}
.panel{background:var(--panel);border:1px solid var(--border);border-radius:14px;overflow:hidden}
.phdr{padding:.7rem 1rem;border-bottom:1px solid var(--border);font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);display:flex;align-items:center;justify-content:space-between}
.back-btn{font-size:.68rem;color:var(--gold);cursor:pointer;font-weight:600;text-transform:none;letter-spacing:0;opacity:.8;transition:opacity .15s}.back-btn:hover{opacity:1}
.hint{font-size:.62rem;color:var(--muted);text-transform:none;letter-spacing:0;font-weight:400}
#mapWrap{padding:.75rem;overflow:hidden}
svg.map{width:100%;display:block}
.spath{cursor:pointer;transition:opacity .12s}.spath:hover{opacity:.75}
.spath.selected{stroke:var(--gold)!important;stroke-width:2.5px}
.cpath{cursor:pointer;transition:opacity .12s}.cpath:hover{opacity:.8}
.cpath.selected{stroke:var(--gold)!important;stroke-width:1.5px}
.drill{display:flex;flex-direction:column}
.drow{display:flex;align-items:center;padding:6px 1rem;border-bottom:1px solid var(--border);font-size:.82rem}
.drow:last-child{border-bottom:none}
.drow.clickable{cursor:pointer;transition:background .12s}.drow.clickable:hover{background:var(--panel2)}
.drank{font-size:.7rem;color:var(--muted);min-width:22px;text-align:right}
.dname{flex:1;margin:0 .6rem}
.dbar-w{flex:1;background:rgba(255,255,255,0.05);border-radius:3px;height:5px;overflow:hidden;margin-right:.5rem}
.dbar{height:5px;border-radius:3px;background:var(--gold)}
.dcnt{font-weight:700;color:var(--gold);min-width:28px;text-align:right}
.dsub{font-size:.65rem;color:var(--muted);margin-left:4px}
.drill-cols{display:flex;gap:0;align-items:start}
.drill-col{flex:1;display:flex;flex-direction:column;min-width:0}
.drill-col:first-child{border-right:1px solid var(--border)}
.empty{padding:2rem 1rem;text-align:center;color:var(--muted);font-size:.82rem}
.bottom-row{display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem}
.chart-wrap{padding:1rem;height:220px;position:relative}
.intl-grid{display:grid;grid-template-columns:1fr 1fr}
.icell{padding:7px 1rem;border-bottom:1px solid var(--border);border-right:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:background .12s}
.icell:nth-child(even){border-right:none}
.icell:hover{background:var(--panel2)}
.icell.active{background:var(--panel3);border-left:2px solid var(--gold)}
.iname{font-size:.82rem}.icnt{font-weight:700;color:var(--gold);font-size:.82rem}
#tip{position:fixed;background:var(--panel3);border:1px solid var(--border2);border-radius:8px;padding:6px 12px;font-size:.78rem;pointer-events:none;display:none;z-index:100;white-space:nowrap}
#tip strong{color:var(--gold)}
.zoom-group{transition:transform .5s ease}
@media(max-width:800px){.stats-row{grid-template-columns:1fr 1fr}.main-row{grid-template-columns:1fr}.bottom-row{grid-template-columns:1fr}}
</style>
</head>
<body>
<div id="tip"></div>
<div class="header">
  <div><div class="title">The <span>Cote Cup</span> 2026</div><div class="sub">Visitor Report</div></div>
  <div class="hdr-r"><span class="meta" id="meta">Loading...</span><button class="btn" onclick="load()">Refresh</button></div>
</div>
<div class="page">
  <div class="stats-row" id="statsRow">
    <div class="stat"><div class="stat-lbl">Total visits</div><div class="stat-val">—</div></div>
    <div class="stat"><div class="stat-lbl">Countries</div><div class="stat-val">—</div></div>
    <div class="stat"><div class="stat-lbl">US States</div><div class="stat-val">—</div></div>
    <div class="stat"><div class="stat-lbl">Top state</div><div class="stat-val" style="font-size:1rem">—</div></div>
    <div class="stat"><div class="stat-lbl">Top city</div><div class="stat-val" style="font-size:1rem">—</div></div>
  </div>
  <div class="tabs">
    <button class="tab active" id="tabWorld" onclick="switchTab('world')">🌍 World</button>
    <button class="tab" id="tabUS" onclick="switchTab('us')">🇺🇸 United States</button>
  </div>
  <div class="main-row" id="mainRow">
    <div class="panel">
      <div class="phdr">
        <span id="mapTitle">World</span>
        <span id="mapBack" class="back-btn" style="display:none" onclick="resetView()">← Back to World</span>
        <span class="hint" id="mapHint">Click a country</span>
      </div>
      <div id="mapWrap"><svg class="map" id="mapSvg"></svg></div>
    </div>
    <div class="panel drill" id="drillPanel">
      <div class="phdr">
        <span id="drillTitle">Visitors</span>
        <span id="drillBack" class="back-btn" style="display:none" onclick="drillBack()"></span>
      </div>
      <div class="empty" id="drillEmpty">Click a country or state on the map</div>
      <div id="drillList"></div>
    </div>
  </div>
  <div class="bottom-row">
    <div class="panel"><div class="phdr">Daily visits — last 14 days</div><div class="chart-wrap"><canvas id="trendChart"></canvas></div></div>
    <div class="panel"><div class="phdr">All Countries</div><div class="intl-grid" id="intlGrid"><div class="empty">No data yet</div></div></div>
  </div>
</div>

<script>
const WORKER = "https://cotecup-worker.yeti-f3c.workers.dev/visitors";
let vData=null, trendInst=null, currentTab="world";
let worldTopo=null, usTopo=null;
let worldSvg=null, worldPath=null, worldFeatures=null, zoomBehavior=null;
let activeCountryCode=null, drillStack=[];

const STATE_NAMES={AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",DC:"Washington D.C."};
const N2C={4:"AF",8:"AL",12:"DZ",20:"AD",24:"AO",28:"AG",32:"AR",36:"AU",40:"AT",44:"BS",48:"BH",50:"BD",52:"BB",56:"BE",64:"BT",68:"BO",72:"BW",76:"BR",84:"BZ",100:"BG",104:"MM",116:"KH",120:"CM",124:"CA",140:"CF",144:"LK",148:"TD",152:"CL",156:"CN",170:"CO",180:"CD",188:"CR",191:"HR",192:"CU",196:"CY",203:"CZ",208:"DK",218:"EC",231:"ET",246:"FI",250:"FR",266:"GA",276:"DE",288:"GH",300:"GR",320:"GT",324:"GN",328:"GY",332:"HT",340:"HN",348:"HU",356:"IN",360:"ID",364:"IR",368:"IQ",372:"IE",376:"IL",380:"IT",388:"JM",392:"JP",400:"JO",404:"KE",410:"KR",414:"KW",418:"LA",422:"LB",430:"LR",434:"LY",450:"MG",454:"MW",458:"MY",466:"ML",478:"MR",484:"MX",496:"MN",504:"MA",508:"MZ",516:"NA",524:"NP",528:"NL",554:"NZ",558:"NI",562:"NE",566:"NG",578:"NO",586:"PK",591:"PA",600:"PY",604:"PE",608:"PH",616:"PL",620:"PT",634:"QA",642:"RO",643:"RU",646:"RW",682:"SA",686:"SN",703:"SK",704:"VN",706:"SO",710:"ZA",716:"ZW",724:"ES",740:"SR",752:"SE",756:"CH",760:"SY",764:"TH",788:"TN",792:"TR",800:"UG",804:"UA",784:"AE",818:"EG",826:"GB",834:"TZ",840:"US",858:"UY",860:"UZ",862:"VE",887:"YE",894:"ZM",275:"PS",222:"SV",108:"BI",630:"PR",344:"HK",158:"TW",702:"SG",214:"DO",316:"GU",850:"VI"};
const CNAMES={US:"United States",MX:"Mexico",CA:"Canada",GB:"United Kingdom",AR:"Argentina",BR:"Brazil",ES:"Spain",FR:"France",DE:"Germany",AU:"Australia",JP:"Japan",IT:"Italy",PT:"Portugal",NL:"Netherlands",CO:"Colombia",VE:"Venezuela",CL:"Chile",PE:"Peru",UY:"Uruguay",EC:"Ecuador",PA:"Panama",GT:"Guatemala",CR:"Costa Rica",DO:"Dominican Republic",PR:"Puerto Rico",CU:"Cuba",IE:"Ireland",SE:"Sweden",NO:"Norway",DK:"Denmark",FI:"Finland",NZ:"New Zealand",ZA:"South Africa",IN:"India",CN:"China",KR:"South Korea",PH:"Philippines",NG:"Nigeria",KE:"Kenya",EG:"Egypt",MA:"Morocco",TN:"Tunisia",GH:"Ghana",HK:"Hong Kong",TW:"Taiwan",SG:"Singapore",GU:"Guam",VI:"U.S. Virgin Islands",XX:"Unknown"};
const cname=c=>CNAMES[c]||c;
const NAME2CODE={};Object.entries(STATE_NAMES).forEach(([k,v])=>{NAME2CODE[v]=k;});

// ── LOAD ─────────────────────────────────────────────────────────────────────
async function load(){
  document.getElementById("meta").textContent="Refreshing...";
  try{
    const r=await fetch(WORKER);
    if(!r.ok) throw new Error("HTTP "+r.status);
    vData=await r.json();
    render(vData);
    document.getElementById("meta").textContent="Updated "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  }catch(e){document.getElementById("meta").textContent="Error: "+e.message;}
}

// ── TABS ──────────────────────────────────────────────────────────────────────
function switchTab(t){
  currentTab=t;
  document.getElementById("tabWorld").classList.toggle("active",t==="world");
  document.getElementById("tabUS").classList.toggle("active",t==="us");
  clearDrill();
  resetMapControls();
  if(t==="world") renderWorldMap(vData?.geo||{});
  else renderUSMap(vData?.geo||{});
}

function resetMapControls(){
  document.getElementById("mapBack").style.display="none";
  document.getElementById("mapHint").style.display="";
  document.getElementById("mapTitle").textContent=currentTab==="world"?"World":"United States";
  activeCountryCode=null;
  document.querySelectorAll(".icell").forEach(el=>el.classList.remove("active"));
}

function clearDrill(){
  drillStack=[];
  document.getElementById("drillTitle").textContent="Visitors";
  document.getElementById("drillBack").style.display="none";
  document.getElementById("drillEmpty").style.display="block";
  document.getElementById("drillList").innerHTML="";
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function render(data){
  const geo=data.geo||{}, daily=data.daily||{};
  const usGeo=geo["US"]||{};
  let total=0;
  Object.values(daily).forEach(v=>total+=v);

  const stateData={};
  let topState=null,topSC=0,topCity=null,topCC=0;
  Object.entries(usGeo).forEach(([k,v])=>{
    if(k==="_t") return;
    const fn=STATE_NAMES[k]||k;
    stateData[fn]=v._t||0;
    if((v._t||0)>topSC){topSC=v._t;topState=fn;}
    Object.entries(v).forEach(([city,cnt])=>{
      if(city==="_t") return;
      if(cnt>topCC){topCC=cnt;topCity=city;}
    });
  });

  const usTotal=usGeo._t||0;
  const countries=Object.keys(geo).length;
  const stateCount=Object.keys(stateData).length;

  document.getElementById("statsRow").innerHTML=\`
    <div class="stat"><div class="stat-lbl">Total visits</div><div class="stat-val">\${total.toLocaleString()}</div></div>
    <div class="stat"><div class="stat-lbl">Countries</div><div class="stat-val">\${countries}</div></div>
    <div class="stat"><div class="stat-lbl">US States</div><div class="stat-val">\${stateCount}</div><div class="stat-sub">\${total?Math.round(usTotal/total*100):0}% from US</div></div>
    <div class="stat"><div class="stat-lbl">Top state</div><div class="stat-val" style="font-size:1rem">\${topState||"—"}</div>\${topState?\`<div class="stat-sub">\${topSC} visits</div>\`:""}</div>
    <div class="stat"><div class="stat-lbl">Top city</div><div class="stat-val" style="font-size:1rem">\${topCity||"—"}</div>\${topCity?\`<div class="stat-sub">\${topCC} visits</div>\`:""}</div>\`;

  renderTrend(daily);
  renderIntl(geo);
  if(currentTab==="world") renderWorldMap(geo);
  else renderUSMap(geo);
}

// ── WORLD MAP ────────────────────────────────────────────────────────────────
async function renderWorldMap(geo){
  document.getElementById("mapTitle").textContent="World";
  document.getElementById("mapHint").textContent="Click a country";
  document.getElementById("mapHint").style.display="";
  document.getElementById("mapBack").style.display="none";

  const countryTotals={};
  Object.entries(geo).forEach(([c,v])=>{ countryTotals[c]=v._t||0; });
  const maxVal=Math.max(...Object.values(countryTotals),1);
  const color=d3.scaleSequential([0,maxVal],["#1a2540","#e8b84b"]);

  if(!worldTopo) worldTopo=await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");

  const W=960, H=500;
  const proj=d3.geoNaturalEarth1().scale(153).translate([W/2,H/2]);
  worldPath=d3.geoPath(proj);
  worldFeatures=topojson.feature(worldTopo,worldTopo.objects.countries).features;

  const svg=d3.select("#mapSvg").attr("viewBox",\`0 0 \${W} \${H}\`);
  svg.selectAll("*").remove();
  worldSvg=svg;

  // Zoom setup
  zoomBehavior=d3.zoom().scaleExtent([1,12]).on("zoom",e=>{
    g.attr("transform",e.transform);
  });
  svg.call(zoomBehavior);

  const g=svg.append("g").attr("class","zoom-group");

  g.append("path").datum(d3.geoGraticule()()).attr("d",worldPath)
    .attr("fill","none").attr("stroke","rgba(255,255,255,0.04)").attr("stroke-width",".5");
  g.append("path").datum({type:"Sphere"}).attr("d",worldPath)
    .attr("fill","none").attr("stroke","rgba(255,255,255,0.1)").attr("stroke-width","1");

  const tip=document.getElementById("tip");
  g.selectAll(".cpath")
    .data(worldFeatures)
    .join("path")
    .attr("class","cpath")
    .attr("d",worldPath)
    .attr("fill",d=>{const code=N2C[+d.id];return color(code?countryTotals[code]||0:0);})
    .attr("stroke","#0f1623").attr("stroke-width","0.4")
    .on("mousemove",function(ev,d){
      const code=N2C[+d.id];
      const count=code?countryTotals[code]||0:0;
      const name=code?cname(code):"Unknown";
      tip.style.display="block";
      tip.style.left=(ev.clientX+14)+"px";
      tip.style.top=(ev.clientY-28)+"px";
      tip.innerHTML=\`<strong>\${name}</strong> — \${count} visit\${count!==1?"s":""}\`;
    })
    .on("mouseleave",()=>{tip.style.display="none";})
    .on("click",function(ev,d){
      const code=N2C[+d.id];
      if(!code) return;
      selectCountry(code, d);
    });
}

function selectCountry(code, feature){
  activeCountryCode=code;

  // Highlight on map
  if(worldSvg){
    worldSvg.selectAll(".cpath").classed("selected",d=>N2C[+d.id]===code);
  }

  // Highlight in All Countries list
  document.querySelectorAll(".icell").forEach(el=>{
    el.classList.toggle("active", el.dataset.code===code);
  });

  if(code==="US"){
    switchTab("us");
    return;
  }

  // Zoom to country on map
  if(worldSvg && worldPath && worldFeatures && zoomBehavior){
    const feat=feature||worldFeatures.find(f=>N2C[+f.id]===code);
    if(feat){
      try{
        const [[x0,y0],[x1,y1]]=worldPath.bounds(feat);
        const W=960, H=500, pad=40;
        const dx=x1-x0, dy=y1-y0;
        const cx=(x0+x1)/2, cy=(y0+y1)/2;
        const scale=Math.max(1, Math.min(10, 0.85/Math.max(dx/W, dy/H)));
        const tx=W/2-scale*cx, ty=H/2-scale*cy;
        worldSvg.transition().duration(650).call(
          zoomBehavior.transform,
          d3.zoomIdentity.translate(tx,ty).scale(scale)
        );
        document.getElementById("mapBack").style.display="";
        document.getElementById("mapHint").style.display="none";
        document.getElementById("mapTitle").textContent=cname(code);
      }catch(e){}
    }
  }

  // Show drill
  const geo=vData?.geo||{};
  const countryObj=geo[code]||{};
  drillStack=[{title:cname(code), obj:countryObj, mode:"region"}];
  renderDrill();
}

function resetView(){
  activeCountryCode=null;
  clearDrill();
  resetMapControls();
  if(worldSvg && zoomBehavior){
    worldSvg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity);
    worldSvg.selectAll(".cpath").classed("selected",false);
  }
  document.querySelectorAll(".icell").forEach(el=>el.classList.remove("active"));
}

// ── US MAP ───────────────────────────────────────────────────────────────────
async function renderUSMap(geo){
  document.getElementById("mapTitle").textContent="United States";
  document.getElementById("mapHint").textContent="Click a state for cities";
  document.getElementById("mapHint").style.display="";
  document.getElementById("mapBack").style.display="none";

  const usGeo=geo["US"]||{};
  const stateData={};
  Object.entries(usGeo).forEach(([k,v])=>{
    if(k==="_t") return;
    const fn=STATE_NAMES[k]||k;
    stateData[fn]=v._t||0;
  });

  const maxVal=Math.max(...Object.values(stateData),1);
  const color=d3.scaleSequential([0,maxVal],["#1a2540","#e8b84b"]);
  if(!usTopo) usTopo=await d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json");

  const proj=d3.geoAlbersUsa().scale(1100).translate([480,290]);
  const path=d3.geoPath(proj);
  const features=topojson.feature(usTopo,usTopo.objects.states).features;
  const tip=document.getElementById("tip");

  const svg=d3.select("#mapSvg").attr("viewBox","0 0 960 580");
  svg.selectAll("*").remove();

  svg.selectAll(".spath")
    .data(features)
    .join("path")
    .attr("class","spath")
    .attr("d",path)
    .attr("fill",d=>color(stateData[d.properties.name]||0))
    .attr("stroke","#0f1623").attr("stroke-width","0.5")
    .on("mousemove",function(ev,d){
      const count=stateData[d.properties.name]||0;
      tip.style.display="block";
      tip.style.left=(ev.clientX+14)+"px";
      tip.style.top=(ev.clientY-28)+"px";
      tip.innerHTML=\`<strong>\${d.properties.name}</strong> — \${count} visit\${count!==1?"s":""}\`;
    })
    .on("mouseleave",()=>{tip.style.display="none";})
    .on("click",function(ev,d){
      svg.selectAll(".spath").classed("selected",false);
      d3.select(this).classed("selected",true);
      const name=d.properties.name;
      const code=NAME2CODE[name];
      const stObj=code?(usGeo[name]||usGeo[code]||{}):(usGeo[name]||{});
      // Keep states as level 1 so back button works
      drillStack=[
        {title:"United States — States", obj:usGeo, mode:"region"},
        {title:\`\${name} — Cities\`, obj:stObj, mode:"city"}
      ];
      renderDrill();
    });

  // Auto-populate right panel with state list on load
  const hasStates = Object.keys(usGeo).filter(k=>k!=="_t").length > 0;
  if(hasStates && (drillStack.length===0 || drillStack[0].title!=="United States — States")){
    drillStack=[{title:"United States — States", obj:usGeo, mode:"region"}];
    renderDrill();
  }

  svg.selectAll("text")
    .data(features.filter(d=>(stateData[d.properties.name]||0)>0))
    .join("text")
    .attr("transform",d=>{const c=path.centroid(d);return c?\`translate(\${c})\`:null;})
    .attr("text-anchor","middle").attr("dominant-baseline","middle")
    .attr("font-size","8").attr("fill","rgba(255,255,255,0.7)").attr("pointer-events","none")
    .text(d=>NAME2CODE[d.properties.name]||"");
}

// ── DRILL PANEL ───────────────────────────────────────────────────────────────
function renderDrill(){
  const frame=drillStack[drillStack.length-1];
  if(!frame) return;
  const {title, obj, mode}=frame;

  document.getElementById("drillTitle").textContent=title;
  document.getElementById("drillEmpty").style.display="none";

  // Back button — only show if we're deeper than level 1
  const backEl=document.getElementById("drillBack");
  if(drillStack.length>1){
    backEl.style.display="";
    backEl.textContent="← "+drillStack[drillStack.length-2].title.split(" —")[0];
  } else {
    backEl.style.display="none";
  }

  let entries;
  if(mode==="city"){
    // Values are plain numbers
    entries=Object.entries(obj)
      .filter(([k])=>k!=="_t")
      .map(([k,v])=>({name:k, count:typeof v==="object"?(v._t||0):v, sub:null}))
      .sort((a,b)=>b.count-a.count);
  } else {
    // mode="region" — values are objects with _t + cities
    entries=Object.entries(obj)
      .filter(([k])=>k!=="_t")
      .map(([k,v])=>{
        const count=typeof v==="object"?(v._t||0):v;
        // Check if there are city-level entries
        const hasCities=typeof v==="object" && Object.keys(v).filter(k=>k!=="_t").length>0;
        return {name:k, count, sub:hasCities?v:null};
      })
      .sort((a,b)=>b.count-a.count);
  }

  const maxV=entries[0]?.count||1;
  const mainRow=document.getElementById('mainRow');
  if(entries.length>18){
    mainRow.classList.add('expanded');
    document.getElementById('drillList').className='';
    const half=Math.ceil(entries.length/2);
    const col1=entries.slice(0,half);
    const col2=entries.slice(half);
    const cRow=(e,idx)=>'<div class="drow '+(e.sub?'clickable':'')+'" '+(e.sub?'onclick="drillInto(\\''+e.name.replace(/\\'/g,'\\\\\\'')+'\\')"':'')+'>'
      +'<div class="drank">'+idx+'</div>'
      +'<div class="dname" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e.name+(e.sub?' <span class="dsub">›</span>':'')+'</div>'
      +'<div class="dcnt">'+e.count+'</div></div>';
    document.getElementById('drillList').innerHTML=
      '<div class="drill-cols">'
      +'<div class="drill-col">'+col1.map((e,i)=>cRow(e,i+1)).join('')+'</div>'
      +'<div class="drill-col">'+col2.map((e,i)=>cRow(e,i+half+1)).join('')+'</div>'
      +'</div>';
  } else {
    mainRow.classList.remove('expanded');
    document.getElementById('drillList').className='';
    document.getElementById('drillList').innerHTML=entries.map((e,i)=>\`
    <div class="drow \${e.sub?'clickable':''}" \${e.sub?\`onclick="drillInto('\${e.name.replace(/'/g,"\\\\'")}')"\`:''}>
      <div class="drank">\${i+1}</div>
      <div class="dname">\${e.name}\${e.sub?\` <span class="dsub">›</span>\`:''}</div>
      <div class="dbar-w"><div class="dbar" style="width:\${Math.round(e.count/maxV*100)}%"></div></div>
      <div class="dcnt">\${e.count}</div>
    </div>\`).join('');
  }
}

function drillInto(regionName){
  const frame=drillStack[drillStack.length-1];
  if(!frame) return;
  const regionObj=frame.obj[regionName];
  if(!regionObj || typeof regionObj!=="object") return;
  drillStack.push({title:\`\${regionName} — Cities\`, obj:regionObj, mode:"city"});
  renderDrill();
}

function drillBack(){
  if(drillStack.length>1){
    drillStack.pop();
    renderDrill();
  }
}

// ── TREND ─────────────────────────────────────────────────────────────────────
function renderTrend(daily){
  const today=new Date(), labels=[], values=[];
  for(let i=13;i>=0;i--){
    const d=new Date(+today-i*86400000).toISOString().slice(0,10);
    labels.push(d.slice(5)); values.push(daily[d]||0);
  }
  if(trendInst) trendInst.destroy();
  trendInst=new Chart(document.getElementById("trendChart"),{
    type:"line",
    data:{labels,datasets:[{label:"Visits",data:values,borderColor:"#e8b84b",backgroundColor:"rgba(232,184,75,0.12)",borderWidth:2,pointRadius:4,pointBackgroundColor:"#e8b84b",fill:true,tension:0.3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:"#7a8ba8",font:{size:10}},grid:{color:"rgba(255,255,255,0.04)"}},
        y:{ticks:{color:"#7a8ba8",font:{size:10},stepSize:1},grid:{color:"rgba(255,255,255,0.04)"},beginAtZero:true}
      }}
  });
}

// ── INTL (clickable) ──────────────────────────────────────────────────────────
function renderIntl(geo){
  const sorted=Object.entries(geo).sort((a,b)=>(b[1]._t||0)-(a[1]._t||0));
  const el=document.getElementById("intlGrid");
  if(!sorted.length){el.innerHTML='<div class="empty">No data yet</div>';return;}
  el.innerHTML=sorted.map(([code,v])=>\`
    <div class="icell" data-code="\${code}" onclick="clickCountry('\${code}')">
      <span class="iname">\${cname(code)}</span>
      <span class="icnt">\${v._t||0}</span>
    </div>\`).join("");
}

function clickCountry(code){
  if(code==="US"){
    switchTab("us");
    return;
  }
  // Switch to world tab if needed
  if(currentTab!=="world"){
    currentTab="world";
    document.getElementById("tabWorld").classList.add("active");
    document.getElementById("tabUS").classList.remove("active");
    renderWorldMap(vData?.geo||{}).then(()=>selectCountry(code));
    return;
  }
  selectCountry(code);
}

load();
</script>
</body>
</html>
`;

// ── HELPERS ───────────────────────────────────────────────────────────────────

// Convert schedule entry to UTC timestamp in ms
function kickoffToMs(dateStr, hour, minute) {
  return Date.UTC(
    parseInt(dateStr.slice(0, 4)),
    parseInt(dateStr.slice(5, 7)) - 1,
    parseInt(dateStr.slice(8, 10)),
    hour,
    minute,
    0
  );
}

// Is right now inside any match window?
// A window = kickoff time to kickoff + MATCH_DURATION_MS
function isMatchWindow(nowMs) {
  for (const [date, h, m] of SCHEDULE) {
    const ko = kickoffToMs(date, h, m);
    if (nowMs >= ko && nowMs <= ko + MATCH_DURATION_MS) {
      return true;
    }
  }
  return false;
}

// How many ms until the next match window opens?
function msUntilNextWindow(nowMs) {
  let nearest = Infinity;
  for (const [date, h, m] of SCHEDULE) {
    const ko = kickoffToMs(date, h, m);
    if (ko > nowMs) {
      nearest = Math.min(nearest, ko - nowMs);
    }
  }
  return nearest;
}

// ── API FETCH ─────────────────────────────────────────────────────────────────
async function fetchAllFixtures(env) {
  const url = `${API_BASE}/competitions/${COMPETITION}/matches`;
  const res = await fetch(url, {
    headers: { "X-Auth-Token": env.FOOTBALL_DATA_KEY, "X-Api-Version": "v4.1" },
  });
  const raw = await res.text();
  console.log("API status:", res.status, "body:", raw.slice(0, 500));
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = JSON.parse(raw);
  const all = data.matches || [];

  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  const yd    = new Date(now - 86400000).toISOString().slice(0, 10);
  const tm    = new Date(+now + 86400000).toISOString().slice(0, 10);

  return {
    live:      all.filter(f => ["IN_PLAY","PAUSED","LIVE"].includes(f.status)),
    today:     all.filter(f => f.utcDate.slice(0, 10) === today),
    yesterday: all.filter(f => f.utcDate.slice(0, 10) === yd),
    tomorrow:  all.filter(f => f.utcDate.slice(0, 10) === tm),
    completed: all.filter(f => f.status === "FINISHED"),
    all:       all,  // Full fixture list for client-side date bucketing
  };
}


// ── VISITOR GEO LOGGING ───────────────────────────────────────────────────────
async function logVisitor(env, request) {
  try {
    const cf      = request.cf || {};
    const country = cf.country    || "XX";
    const state   = cf.region     || cf.regionCode || "??";  // full name e.g. "Georgia"
    const city    = cf.city       || "??";
    const today   = new Date().toISOString().slice(0, 10);

    const key  = "visitor_stats_v2";
    const data = await env.COTECUP_CACHE.get(key, "json") || { daily: {}, geo: {} };

    // Daily count
    data.daily[today] = (data.daily[today] || 0) + 1;

    // Geo: country → state → city
    if (!data.geo[country])        data.geo[country]        = { _t: 0 };
    data.geo[country]._t++;

    if (!data.geo[country][state]) data.geo[country][state] = { _t: 0 };
    data.geo[country][state]._t++;

    if (city !== "??") {
      data.geo[country][state][city] = (data.geo[country][state][city] || 0) + 1;
    }

    await env.COTECUP_CACHE.put(key, JSON.stringify(data));
  } catch (_) {}
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), { headers: CORS });
    }

    if (url.pathname === "/debug") {
      const nowMs = Date.now();
      return new Response(JSON.stringify({
        hasKey: !!env.FOOTBALL_DATA_KEY,
        keyLength: (env.FOOTBALL_DATA_KEY||"").length,
        inWindow: isMatchWindow(nowMs),
        nowUTC: new Date(nowMs).toISOString()
      }), { headers: CORS });
    }

    // Manual refresh — forces a fresh API call regardless of window
    if (url.pathname === "/refresh") {
      try {
        const fixtures = await fetchAllFixtures(env);
        const payload  = { updated: new Date().toISOString(), fixtures };
        await env.COTECUP_CACHE.put("payload", JSON.stringify(payload), { expirationTtl: 3600 });
        return new Response(JSON.stringify({
          ok: true, updated: payload.updated,
          counts: { live: fixtures.live.length, today: fixtures.today.length, completed: fixtures.completed.length }
        }), { headers: CORS });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
      }
    }

    if (url.pathname === "/report") {
      const key = url.searchParams.get("key");
      if (!env.REPORT_KEY || key !== env.REPORT_KEY) {
        return new Response("Not found", { status: 404 });
      }
      // Inject the key into the dashboard's /visitors fetch URL
      const reportHtml = REPORT_HTML.replace(
        "https://cotecup-worker.yeti-f3c.workers.dev/visitors",
        `https://cotecup-worker.yeti-f3c.workers.dev/visitors?key=${env.REPORT_KEY}`
      );
      return new Response(reportHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

        if (url.pathname === "/visitors") {
      const key = url.searchParams.get("key");
      if (!env.REPORT_KEY || key !== env.REPORT_KEY) {
        return new Response("Not found", { status: 404 });
      }
      const stats = await env.COTECUP_CACHE.get("visitor_stats_v2", "json") || { daily: {}, geo: {} };
      return new Response(JSON.stringify(stats), { headers: CORS });
    }

        if (url.pathname === "/data") {
      try {
        const nowMs    = Date.now();
        const inWindow = isMatchWindow(nowMs);

        // Try cache first
        let cached = null;
        try { cached = await env.COTECUP_CACHE.get("payload", "json"); } catch (_) {}

        // Log visitor geo — skip if notrack param set (admin/producer devices)
        if (!url.searchParams.has("notrack")) {
          ctx.waitUntil(logVisitor(env, request));
        }

                // In window with no cache — fetch fresh
        if (inWindow && !cached) {
          const fixtures = await fetchAllFixtures(env);
          const payload  = { updated: new Date().toISOString(), fixtures };
          try { await env.COTECUP_CACHE.put("payload", JSON.stringify(payload), { expirationTtl: 60 }); } catch (_) {}
          return new Response(JSON.stringify(payload), { headers: CORS });
        }

        // Have cache — serve it
        if (cached) {
          return new Response(JSON.stringify(cached), { headers: CORS });
        }

        // Outside window, no cache — fetch once and store for 12 hours
        // This prevents the site going blank between match windows
        try {
          const fixtures = await fetchAllFixtures(env);
          const payload  = { updated: new Date().toISOString(), fixtures };
          await env.COTECUP_CACHE.put("payload", JSON.stringify(payload), { expirationTtl: 43200 });
          return new Response(JSON.stringify(payload), { headers: CORS });
        } catch (err) {
          return new Response(JSON.stringify({
            updated: new Date().toISOString(),
            fixtures: { live: [], today: [], yesterday: [], tomorrow: [], completed: [] },
            idle: true,
            nextWindow: msUntilNextWindow(nowMs),
          }), { headers: CORS });
        }

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
      }
    }

    return new Response("Not found", { status: 404 });
  },

  // Scheduled handler — the only thing that ever calls the API
  // Two modes:
  // 1. During match windows (cron */6 * * * *): live polling every 6 minutes
  // 2. Daily catch-up at 06:00 UTC: one fetch to store all completed results
  async scheduled(event, env, ctx) {
    const nowMs = Date.now();
    const nowUTC = new Date(nowMs);
    const hour = nowUTC.getUTCHours();
    const minute = nowUTC.getUTCMinutes();

    // Daily catch-up: runs at 06:00 UTC regardless of match window
    // This ensures completed results from overnight matches are always stored
    const isCatchUp = (hour === 6 && minute < 10);

    if (!isMatchWindow(nowMs) && !isCatchUp) {
      console.log(`Outside match window — skipping. Next window in ${Math.round(msUntilNextWindow(nowMs) / 60000)} min`);
      return;
    }

    try {
      const fixtures = await fetchAllFixtures(env);
      const payload  = { updated: new Date().toISOString(), fixtures };
      // During catch-up, use longer TTL so results persist all day
      const ttl = isCatchUp ? 3600 * 12 : 60;
      await env.COTECUP_CACHE.put("payload", JSON.stringify(payload), {
        expirationTtl: ttl,
      });
      console.log(`Cache refreshed at ${payload.updated} — mode: ${isCatchUp ? "catch-up" : "live"} — completed: ${fixtures.completed.length}, live: ${fixtures.live.length}`);
    } catch (err) {
      console.error("Scheduled refresh failed:", err.message);
    }
  },
};
