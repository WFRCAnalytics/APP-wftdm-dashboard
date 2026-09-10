function f(t){return t.raw??{}}const g=/\$(mappings|bins|sql|filters|scenario|inputs|baseline)\.([A-Za-z0-9_]+)/g;function _(t,e,n,r,s,i){let c=t.split(`
`).filter(l=>{const a=l.match(/\$(filters|inputs)\.([A-Za-z0-9_]+)/);if(!a)return!0;const[,u,p]=a;return(u==="inputs"?s?.get(p):n.get(p))!=="all"}).join(`
`);return c=c.replace(g,(l,a,u)=>{switch(a){case"mappings":return b(e,u);case"bins":return d(e,u);case"sql":return x(e,u);case"filters":return L(n,u);case"scenario":return O(r,u);case"inputs":return N(s,u);case"baseline":return A(i,u);default:return l}}),c}function o(t){throw new Error(`sqlExpander.expand: unresolved placeholder "${t}"`)}function $(t){return t.replace(/'/g,"''")}function b(t,e){const n=f(t).mappings?.[e];return n||o(`mappings.${e}`),Object.entries(n).map(([r,s])=>`WHEN '${r}' THEN '${s}'`).join(`
    `)}function d(t,e){const n=f(t).bins?.[e];switch(n||o(`bins.${e}`),n.type){case"manual_breaks":{const{column:r,breaks:s,labels:i}=n,c=[];for(let a=0;a<i.length-1;a++)c.push(`WHEN "${r}" < ${s[a+1]} THEN '${i[a]}'`);const l=i[i.length-1];return`CASE
    ${c.join(`
    `)}
    ELSE '${l}'
  END`}case"quantiles":{const{column:r,bins:s=4}=n;return`NTILE(${s}) OVER (ORDER BY "${r}")`}case"spaced_intervals":{const{column:r,interval:s,lower:i=0}=n;return`(FLOOR(("${r}" - ${i}) / ${s}) * ${s} + ${i})`}case"equal_intervals":{const{column:r,n:s=4,labels:i}=n,c=`MIN("${r}") OVER ()`,l=`MAX("${r}") OVER ()`,a=`LEAST(${s} - 1, FLOOR((("${r}" - ${c}) / NULLIF(${l} - ${c}, 0)) * ${s}))`;if(!i)return a;const u=i.map((p,E)=>`WHEN ${E} THEN '${p}'`).join(`
    `);return`CASE ${a}
    ${u}
  END`}default:return o(`bins.${e} (unknown type "${n.type}")`)}}function x(t,e){const n=f(t).sql_fragments?.[e];return n===void 0&&o(`sql.${e}`),n}function L(t,e){const n=t.get(e);return n===void 0&&o(`filters.${e}`),$(String(n))}function N(t,e){const n=t?.get(e);return n===void 0&&o(`inputs.${e}`),Array.isArray(n)?n.map(r=>`'${$(String(r))}'`).join(","):$(String(n))}function O(t,e){return(!t||t.length===0)&&o(`scenario.${e} (no active scenarios)`),t.map(n=>`SELECT *, '${n}' AS scenario FROM "${n}__${e}"`).join(`
  UNION ALL
  `)}function A(t,e){return t||o(`baseline.${e} (no baseline scenario)`),`"${t}__${e}"`}export{_ as expand};
