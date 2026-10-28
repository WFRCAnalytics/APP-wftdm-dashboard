import{r as i,j as l}from"./react-vendor-hk5JyWcx.js";import{T as L}from"./graphic-walker-DIRsdfIh.js";import{query as H,queryArrow as B}from"./duckdb-NqufzdO3.js";import{as as J,bP as W,bQ as U,bR as V,bi as Y,c as P,bS as Q,a8 as Z,C as X,G as ee,J as te,e as q,a1 as re,W as ae,V as se,bT as oe,bU as ne}from"./index-Pdxqqtzi.js";import{get as le}from"./appState-p9MC4igz.js";import{expand as ie}from"./sqlExpander-Bv6wpbkr.js";import{D as F}from"./flowmap-deck-CYevdWoo.js";import"./duckdb-Bjlci3X6.js";import"./app-shared-B6XQkMz5.js";import"./yamlLoader-g5rlyxj_.js";import"./compareState-Di80v-JG.js";import"./filterState-RCplXVNu.js";import"./observable-plot-ChjjNQx1.js";import"./d3-shared-CP51Q0kv.js";import"./maps-L2vCIGha.js";const ce=["--chart-1","--chart-2","--chart-3","--chart-4","--chart-5"],de=["#3358be","#ba7f00","#cc4330","#008029","#914edc"];function d(t,e,s){return t.getPropertyValue(e).trim()||s}function _(t){const e=/^#([0-9a-f]{3,8})$/i.exec(t);if(!e)return null;let s=e[1];if((s.length===3||s.length===4)&&(s=[...s].map(a=>a+a).join("")),s.length!==6&&s.length!==8)return null;const r=a=>parseInt(s.slice(a,a+2),16);return[r(0),r(2),r(4),s.length===8?r(6)/255:1]}function G(t,e){const s=_(t),r=_(e);if(!s||!r||s[3]===1)return t;const a=n=>Math.round(s[n]*s[3]+r[n]*(1-s[3]));return`#${[a(0),a(1),a(2)].map(n=>n.toString(16).padStart(2,"0")).join("")}`}function ue(t,e,s){const r=_(t),a=_(e);if(!r||!a)return e;const n=u=>Math.round(r[u]+(a[u]-r[u])*s);return`#${[n(0),n(1),n(2)].map(u=>u.toString(16).padStart(2,"0")).join("")}`}function I(t=document.documentElement){const e=getComputedStyle(t),s=d(e,"--background","#ffffff"),r=d(e,"--card",s),a=d(e,"--foreground","#000000"),n=d(e,"--muted","#f5f5f5"),u=d(e,"--muted-foreground","#737373"),f=G(d(e,"--border","#e5e5e5"),r),m=G(d(e,"--input","#e5e5e5"),r),p=d(e,"--font-body","sans-serif"),g=J(t,ce,de),k={background:r,foreground:a,card:r,"card-foreground":d(e,"--card-foreground",a),popover:d(e,"--popover",r),"popover-foreground":d(e,"--popover-foreground",a),primary:d(e,"--primary",a),"primary-foreground":d(e,"--primary-foreground",s),secondary:d(e,"--secondary",n),"secondary-foreground":d(e,"--secondary-foreground",a),muted:n,"muted-foreground":u,accent:d(e,"--accent",n),"accent-foreground":d(e,"--accent-foreground",a),destructive:d(e,"--destructive","#e7000b"),"destructive-foreground":d(e,"--destructive-foreground","#fafafa"),dimension:g[0],measure:g[4]??g[1],border:f,input:m,ring:d(e,"--ring","#a1a1a1")},x=[.12,.35,.6,.8,1].map(h=>ue(r,g[0],h)),A={background:"transparent",font:p,view:{stroke:"transparent"},range:{category:g,ramp:x,heatmap:x},scale:{continuous:{range:x}},axis:{labelColor:u,titleColor:a,domainColor:f,tickColor:f,gridColor:f,labelFont:p,titleFont:p,titleFontWeight:500},legend:{labelColor:u,titleColor:a,labelFont:p,titleFont:p,titleFontWeight:500},header:{labelColor:u,titleColor:a,labelFont:p,titleFont:p},title:{color:a,font:p},text:{color:a,font:p}};return{uiTheme:{light:k,dark:k},vizThemeConfig:{light:A,dark:A}}}function pe(){const[t,e]=i.useState(()=>I());return i.useEffect(()=>{let s=0;const r=()=>{cancelAnimationFrame(s),s=requestAnimationFrame(()=>{const n=I();e(u=>JSON.stringify(u)===JSON.stringify(n)?u:n)})},a=new MutationObserver(r);return a.observe(document.documentElement,{attributes:!0,attributeFilter:["class","style"]}),r(),()=>{a.disconnect(),cancelAnimationFrame(s)}},[]),t}const K="data-wftdm-gw-style",fe=`
.App,
.App button,
.App input,
.App select,
.App textarea {
  font-family: var(--font-body);
}

.App * {
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

/* ── Main frame (the bordered box around the toolbar + shelves) ─────────── */
.App [class~="p-4"][class~="border-border"][class~="rounded-md"] {
  border-color: var(--glass-line);
  border-radius: 16px;
}

/* ── Data / Visualization tabs: a segmented pill, like the app's Segmented ── */
.App [class~="border-b"][class~="h-9"][class~="space-x-8"] {
  width: fit-content;
  height: auto;
  margin: 12px 16px 4px;
  padding: 3px;
  gap: 2px;
  border-bottom: 0;
  border-radius: 9999px;
  background: var(--pill-track);
}
/* colours carry !important: Graphic Walker's own utility classes set text colour with higher specificity */
.App [class~="border-b"][class~="h-9"][class~="space-x-8"] > button {
  margin: 0;
  padding: 4px 14px;
  border: 0;
  border-radius: 9999px;
  font-size: 13px;
  color: var(--pill-off-fg) !important;
}
.App [class~="border-b"][class~="h-9"][class~="space-x-8"] > button:hover {
  color: var(--pill-hover-fg) !important;
}
.App [class~="border-b"][class~="h-9"][class~="space-x-8"] > button[data-state="active"] {
  /* same look as .pill-on in tokens.css */
  color: var(--pill-on-fg) !important;
  background: var(--pill-on-bg);
  box-shadow: var(--pill-on-shadow);
}

/* ── Chart tabs ("Chart 1", "+ New"): pills instead of folder tabs ───────── */
.App nav[role="tablist"][aria-label="Tabs"] {
  height: auto;
  margin-bottom: 8px;
  gap: 6px;
}
.App nav[role="tablist"][aria-label="Tabs"] > [role="tab"] {
  align-items: center;
  padding: 3px 12px;
  border-radius: 9999px;
  font-size: 13px;
  color: var(--pill-off-fg);
}
.App nav[role="tablist"][aria-label="Tabs"] > [role="tab"][class~="border"] {
  border: 1px solid transparent;
  background: var(--pill-on-bg);
  box-shadow: var(--pill-on-shadow);
  color: var(--pill-on-fg) !important;
}
.App nav[role="tablist"][aria-label="Tabs"] > [role="tab"]:not([class~="border"]):hover {
  background: var(--pill-track);
  color: var(--pill-hover-fg);
}

/* ── Toolbar: one soft rounded bar with round buttons ────────────────────── */
.App [class~="flex-wrap"][class~="border"][class~="my-1"][class~="rounded"] {
  padding: 4px;
  border-color: var(--glass-line);
  border-radius: 14px;
  background: var(--tile-hi);
}
.App [class~="flex-wrap"][class~="border"][class~="my-1"][class~="rounded"] button {
  border-radius: 9999px;
}

/* ── Shelves, field list and canvas: softer, rounder, with room between ──── */
.App [class~="my-0.5"][class~="border"] {
  margin: 4px;
  border-color: var(--glass-line);
  border-radius: 14px;
  overflow: hidden;
  background: var(--tile-hi);
}
.App [class~="my-0.5"][class~="border"][class~="flex-1"] {
  background: transparent;
}

/* Shelf titles: the app's small muted label style */
.App [class~="border-b"][class~="p-2"][class~="select-none"] {
  border-color: var(--glass-line);
  padding: 8px 12px;
}
.App .fl-header {
  border-color: var(--glass-line);
}
.App [class~="border-b"][class~="p-2"][class~="select-none"] h4,
.App .fl-header h4,
.App h4[class~="text-xs"] {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--mute);
}

/* Empty drop targets: dashed and quiet instead of a grey slab */
.App [class~="bg-muted"][class~="border"][class~="grow"] {
  border: 1px dashed var(--glass-line);
  border-radius: 10px;
  background: transparent;
  color: var(--mute);
}

/* Field pills in the lists and shelves */
.App [data-rbd-draggable-id] {
  border-radius: 8px;
}
`;function me(t){const e=t.shadowRoot;if(!e||e.querySelector(`style[${K}]`))return;const s=document.createElement("style");s.setAttribute(K,""),s.textContent=fe,e.appendChild(s)}function he(t){let e=0,s=0;const r=()=>{const n=t.firstElementChild;if(n?.shadowRoot){me(n);return}s++<60&&(e=requestAnimationFrame(r))},a=new MutationObserver(()=>{s=0,cancelAnimationFrame(e),r()});return a.observe(t,{childList:!0}),r(),()=>{a.disconnect(),cancelAnimationFrame(e)}}function be(t,e=[]){const s=new Map(e.map(r=>[r.fid,r]));return t.map(r=>{const a=s.get(r.name);return a?{fid:a.fid,name:a.name??r.name,semanticType:a.semanticType,analyticType:a.analyticType}:{fid:r.name,name:r.name,...ge(r.type)}})}function ge(t){return F.isInt(t)||F.isFloat(t)?{semanticType:"quantitative",analyticType:"measure"}:F.isDate(t)||F.isTimestamp(t)?{semanticType:"temporal",analyticType:"dimension"}:{semanticType:"nominal",analyticType:"dimension"}}function xe(t,e){if(e.length===0)return[];let s;for(const r of e){const a=new Set(t.get(r)??[]);if(s=s===void 0?a:new Set([...s].filter(n=>a.has(n))),s.size===0)break}return[...s??[]].sort((r,a)=>r.localeCompare(a))}function ve(t,e,s){return e.length<=1?[...t]:t.filter(r=>{const a=e.map(n=>s.get(n)?.get(r));return a.every(n=>n!==void 0&&n===a[0])})}function ye({current:t,options:e,onSelect:s}){const[r,a]=i.useState(!1),[n,u]=i.useState(""),[f,m]=i.useState(0),p=i.useRef(null),g=i.useRef(null),k=i.useRef(null),x=i.useRef(!1),A=i.useRef("");x.current=r;const h=i.useMemo(()=>{const o=b=>b.toLowerCase().replace(/[\s_]+/g," "),c=o(n.trim());return c?e.filter(b=>o(b).includes(c)):e},[e,n]);i.useEffect(()=>{m(0)},[n]),i.useEffect(()=>{if(!r)return;const o=A.current;A.current="",u(o),m(o?0:Math.max(0,e.indexOf(t)))},[r]),i.useEffect(()=>{p.current?.querySelector('[data-active="true"]')?.scrollIntoView({block:"nearest"})},[f,r,h]);function S(o){o!==t&&s(o),a(!1)}function C(o){if(!(o.ctrlKey||o.metaKey||o.altKey)){if(o.key.length===1&&o.key!==" ")o.preventDefault(),x.current?u(c=>c+o.key):(A.current=o.key,a(!0));else if(o.key==="Enter"&&x.current){o.preventDefault();const c=h[f];c&&S(c)}}}function D(o){if(o.key==="ArrowDown")o.preventDefault(),m(c=>Math.min(c+1,h.length-1));else if(o.key==="ArrowUp")o.preventDefault(),m(c=>Math.max(c-1,0));else if(o.key==="Home")o.preventDefault(),m(0);else if(o.key==="End")o.preventDefault(),m(Math.max(h.length-1,0));else if(o.key==="Enter"){o.preventDefault();const c=h[f];c&&S(c)}}if(e.length===0)return l.jsx("div",{className:"mb-3",children:l.jsxs("div",{className:"inline-flex h-[38px] items-center gap-2 rounded-full border border-dashed border-[var(--glass-line)] px-[14px] font-body text-sm text-[var(--mute)]",children:[l.jsx(W,{className:"h-4 w-4"}),"No dataset available to explore"]})});const E="gw-dataset-list";return l.jsx("div",{className:"mb-3",children:l.jsxs(U,{open:r,onOpenChange:a,children:[l.jsx(V,{asChild:!0,children:l.jsxs("button",{ref:g,type:"button",onKeyDown:C,"aria-label":"Choose dataset to explore","aria-haspopup":"listbox","aria-expanded":r,className:"inline-flex h-[38px] max-w-full items-center gap-2 rounded-full border border-[var(--glass-line)] bg-[var(--tile-hi)] pl-[14px] pr-3 font-body shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:border-[var(--mute)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]",children:[l.jsx(W,{className:"h-4 w-4 shrink-0 text-[var(--mute)]"}),l.jsx("span",{className:"text-xs text-[var(--mute)]",children:"Table"}),l.jsx("span",{className:"truncate text-sm font-medium text-[var(--ink)]",children:t}),l.jsx(Y,{className:P("h-4 w-4 shrink-0 text-[var(--mute)] transition-transform",r&&"rotate-180")})]})}),l.jsxs(Q,{align:"start",className:"w-[min(22rem,var(--radix-popover-content-available-width))] p-0",onOpenAutoFocus:o=>{o.preventDefault(),k.current?.focus()},onCloseAutoFocus:o=>{o.preventDefault(),x.current||g.current?.focus()},children:[l.jsxs("div",{className:"flex items-center gap-2 border-b border-border px-3",children:[l.jsx(Z,{className:"h-4 w-4 shrink-0 text-muted-foreground"}),l.jsx("input",{ref:k,type:"text",role:"combobox","aria-expanded":"true","aria-controls":E,"aria-activedescendant":h[f]?`${E}-${f}`:void 0,"aria-label":"Search tables",placeholder:`Search ${e.length} tables…`,value:n,onChange:o=>u(o.target.value),onKeyDown:D,className:"h-10 w-full bg-transparent font-body text-sm text-foreground outline-none placeholder:text-muted-foreground"})]}),l.jsx("ul",{ref:p,id:E,role:"listbox","aria-label":"Tables",className:"scrollbar-thin max-h-72 overflow-y-auto p-1",children:h.length===0?l.jsxs("li",{className:"px-3 py-6 text-center font-body text-sm text-muted-foreground",children:["No tables match “",n,"”"]}):h.map((o,c)=>{const b=o===t;return l.jsxs("li",{id:`${E}-${c}`,role:"option","aria-selected":b,"data-active":c===f,onMouseMove:()=>m(c),onClick:()=>S(o),className:P("flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 font-body text-sm text-foreground",c===f&&"bg-accent text-accent-foreground"),children:[l.jsx(X,{className:P("h-4 w-4 shrink-0",b?"opacity-100":"opacity-0")}),l.jsx("span",{className:"truncate",children:o})]},o)})})]})]})})}const we={get:()=>{}};function $e({config:t}){const[e,s]=i.useState("loading"),[r,a]=i.useState([]),[n,u]=i.useState([]),f=ee(),m=pe(),p=i.useRef(null),g=i.useRef(null),k=i.useRef(void 0),[x,A]=i.useState(0),h=i.useRef(!0);i.useEffect(()=>{if(h.current){h.current=!1;return}k.current=g.current?.exportCode(),A(v=>v+1)},[m]),i.useEffect(()=>{k.current=void 0},[x]);const S=te();i.useEffect(()=>{const v=p.current;return v?he(v):void 0},[]);const[C,D]=i.useState(t.dataset),[E,o]=i.useState([]);i.useEffect(()=>{let v=!1;if(!t.dataset_picker){o([]);return}const T=t.scenario?[t.scenario]:S,M=new Map(T.map(y=>[y,le(y)?.availableMetrics??[]])),j=xe(M,T);if(T.length<=1||j.length===0){o(j);return}return q(T.flatMap(y=>j.map(w=>({scenario:y,metric:w})))).catch(()=>{}).then(()=>Promise.all(T.map(async y=>{const w=`${y}__`,R=j.map(N=>`${w}${N}`),O=await H(`SELECT table_name, string_agg(column_name, ',' ORDER BY ordinal_position) AS cols FROM information_schema.columns WHERE table_name IN (${R.map(N=>`'${N}'`).join(", ")}) GROUP BY table_name`),$=new Map;for(const N of O){const z=N.table_name;$.set(z.slice(w.length),N.cols)}return[y,$]}))).then(y=>{v||o(ve(j,T,new Map(y)))}),()=>{v=!0}},[t.dataset_picker,t.scenario,S]),i.useEffect(()=>{let v=!1;s("loading");const T={...t,dataset:C},M=ne(T),j=ie(M,re,we,S),y=t.scenario?[t.scenario]:S;return q(y.map(w=>({scenario:w,metric:C}))).then(()=>B(j)).then(w=>{if(v)return;const R=w.toArray().map(O=>O.toJSON());if(R.length===0){s("empty");return}a(R),u(be(w.schema.fields,t.fields)),s("ready")}).catch(w=>{v||(console.error("GraphicWalkerPanel: failed to load panel data",w),s("error"))}),()=>{v=!0}},[C,t.scenario,t.limit,t,S]);const c=t.dataset_picker?l.jsx(ye,{current:C,options:E,onSelect:D}):null;let b;return e==="error"?b=l.jsx(ae,{message:`Failed to load "${C}"`}):e==="empty"?b=l.jsx(se,{icon:oe,message:"No data available to explore"}):e==="loading"?b=l.jsxs("div",{className:"flex gap-3",style:{height:t.height??700},"aria-hidden":"true",children:[l.jsx("div",{className:"h-full w-48 shrink-0 animate-pulse rounded-md bg-muted"}),l.jsx("div",{className:"h-full flex-1 animate-pulse rounded-md bg-muted"})]}):b=l.jsx(L,{storeRef:g,chart:k.current,data:r,fields:n,appearance:f,uiTheme:m.uiTheme,vizThemeConfig:m.vizThemeConfig},x),l.jsxs("div",{className:"graphic-walker-panel-host",style:{height:"100%"},children:[c,l.jsx("div",{className:"graphic-walker-panel-content",ref:p,children:b})]})}export{$e as GraphicWalkerPanel};
