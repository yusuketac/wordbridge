// Entire app, simulated DOM and fake transport. Never reads a user profile or calls the network.
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(source);
function harness(){
  const elements=new Map(),storage=new Map(),copied=[],scoped=new Map();
  const element=(id="")=>{
    const classes=new Set(),listeners={};
    return {id,value:"",textContent:"",innerHTML:"",style:{},dataset:{},checked:false,disabled:false,options:[],
      classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),
        contains:x=>classes.has(x),toggle:(x,on)=>{on=on===undefined?!classes.has(x):on;on?classes.add(x):classes.delete(x);return on;}},
      addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn),
      async fire(type){for(const fn of listeners[type]||[]) await fn.call(this,{target:this,key:"",preventDefault(){}});},
      click(){return this.fire("click");},focus(){},scrollIntoView(){},
      getAttribute(k){return this[k]||"";},setAttribute(k,v){this[k]=v;},
      appendChild(child){this.options.push(child);},querySelectorAll(){return [];}
    };
  };
  for(const m of html.matchAll(/id="([^"]+)"/g)) elements.set(m[1],element(m[1]));
  function get(id){assert.ok(elements.has(id),"Missing DOM id: "+id);return elements.get(id);}
  for(const m of html.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){
    const opts=[...m[2].matchAll(/<option(?: value="([^"]*)")?([^>]*)>([^<]*)<\/option>/g)].map(o=>({value:o[1]??o[3],textContent:o[3],selected:o[2].includes("selected")}));
    get(m[1]).options=opts;get(m[1]).value=(opts.find(o=>o.selected)||opts[0]||{}).value||"";
  }
  const icon=element(),nav=element();
  const document={getElementById:get,querySelectorAll:s=>scoped.get(s)||[],querySelector:s=>s==='link[rel="icon"]'?icon:nav,
    title:"WordBridge",body:element(),createElement:()=>element(),addEventListener(){}};
  const sandbox={document,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))},
    navigator:{clipboard:{writeText:async s=>copied.push(s)}},console,performance,structuredClone,Blob,
    URL:{createObjectURL:b=>{sandbox.lastBlob=b;return "blob:test";},revokeObjectURL(){}},
    FileReader:class{readAsText(f){this.result=f.text;this.onload();}},setTimeout:()=>0,clearTimeout(){},
    AbortController,confirm:()=>true,fetch:async()=>{throw Error("Network forbidden");}};
  sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(source,sandbox);
  return {run:js=>vm.runInContext(js,sandbox),get,storage,sandbox,copied,scoped,element};
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log("PASS "+name);}
const p={before:"ご確認していただけますか",after:"ご確認いただけますか",reason:"敬語を簡潔にする",key:"keigo"};
function seed(h){h.sandbox.p=p;h.sandbox.fixture={type:"整える",input:p.before,output:p.after,d:"2026-09-14T10:00:00Z",learning:{points:[p],tip:"敬語を簡潔に",next:"敬語を一つにする"}};}
(async()=>{
  await test("full script initialization and 40 examples",()=>{const h=harness();assert.match(h.get("coHistoryReport").innerHTML,/対象の履歴がありません/);assert.equal(h.run("MANNER_LIBRARY.length"),40);assert.equal(h.run("STOCK_LIMIT"),500);});
  await test("existing conversions and empty lines",()=>{const h=harness();for(const [mode,input,expected] of [["snake","a b\n\nC_D","a_b\n\nc_d"],["title","wHEEL_front","Wheel_Front"],["upper","aB","AB"],["lower","aB","ab"]]){h.sandbox.caseInput=input;h.sandbox.mode=mode;assert.equal(h.run("convertCase(caseInput,mode)"),expected);}});
  await test("quote validation rejects fabricated and unchanged examples",()=>{const h=harness();seed(h);assert.equal(h.run("cleanLearning({points:[p]},p.before,p.after,'添削').points.length"),1);assert.equal(h.run("cleanLearning({points:[p]},'存在しない','存在しない','添削').points.length"),0);assert.equal(h.run("cleanLearning({points:[{...p,after:p.before}]},p.before,p.before,'添削').points.length"),0);});
  await test("compose teaches without mistake attribution",()=>{const h=harness();seed(h);assert.equal(h.run("cleanLearning({points:[p]},p.before,p.after,'文書作成').points[0].key"),"");assert.equal(h.run("historyCoachData([{...fixture,type:'文書作成'}],'all').total"),0);});
  await test("rich notes deduplicate identical actions but preserve different originals",()=>{const h=harness();seed(h);for(let i=0;i<2;i++)h.run("recordHistoryResult({type:'整える',input:fixture.input,output:r=>r.output,learn:true},{...fixture.learning,output:fixture.output})");assert.equal(h.run("LS.notes.length"),1);assert.equal(h.run("LS.notes[0].input"),p.before);h.run("addNote('敬語を簡潔に','その他',{input:'別の原文',output:'別の結果',source:'整える'})");assert.equal(h.run("LS.notes.length"),2);});
  await test("history counts distinct originals and dates, respects period",()=>{const h=harness();seed(h);assert.equal(h.run("historyCoachData([fixture,{...fixture,d:'2026-09-15'}],'all').total"),1);const r=h.run("historyCoachData([fixture,{...fixture,input:fixture.input+'。お願いします',d:'2026-09-15'}],'all')");assert.equal(r.groups[0].count,2);assert.equal(r.groups[0].days,2);assert.equal(h.run("historyCoachData([fixture],'30',Date.parse('2026-11-01')).total"),0);});
  await test("legacy detection requires actual change",()=>{const h=harness();seed(h);h.run("delete fixture.learning");assert.equal(h.run("historyCoachData([fixture],'all').groups.length"),1);assert.equal(h.run("historyCoachData([{...fixture,output:fixture.input}],'all').groups.length"),0);});
  await test("old note stays visible with honest missing-example notice",()=>{const h=harness();h.run("LS.notes=[{d:'2026-01-01',tip:'短く書く'}];renderNotes()");assert.match(h.get("ntList").innerHTML,/旧形式/);assert.match(h.get("ntList").innerHTML,/短く書く/);});
  await test("search covers reasons and rendering escapes HTML",()=>{const h=harness();seed(h);h.run("LS.notes=[{d:'2026-09-14',tip:'<img src=x onerror=alert(1)>',input:fixture.input,output:fixture.output,learning:fixture.learning}];renderNotes()");assert.ok(!h.get("ntList").innerHTML.includes("<img"));assert.match(h.get("ntList").innerHTML,/&lt;img/);h.get("ntSearch").value="簡潔にする";h.run("renderNotes()");assert.match(h.get("ntList").innerHTML,/ご確認して/);});
  await test("manner situation + audience + search filters",()=>{const h=harness();assert.equal(h.run("filteredManners('','断り・調整','同僚・チャット').length"),1);assert.equal(h.run("filteredManners('不存在XYZ','催促','社外').length"),0);assert.equal(h.run("filteredManners('','日程調整','社外')[0].audience"),"社外");});
  await test("manner favorites persist, filter, and reject unknown IDs",()=>{const h=harness();h.run("toggleMannerFavorite('manner-1')");assert.equal(h.run("JSON.stringify(LS.mannerFavorites)"),'["manner-1"]');assert.equal(h.run("filteredManners('','','',LS.mannerFavorites).length"),1);h.run("toggleMannerFavorite('unknown')");assert.equal(h.run("JSON.stringify(LS.mannerFavorites)"),'["manner-1"]');h.get("mnFavoriteOnly").value="favorite";h.run("renderManners()");assert.match(h.get("mnList").innerHTML,/★ お気に入り/);h.run("toggleMannerFavorite('manner-1')");assert.equal(h.run("LS.mannerFavorites.length"),0);});
  await test("stock stays local, supports filtering, copying, and history save",async()=>{const h=harness();seed(h);assert.equal(h.run("saveStock({title:'参考',text:'結論を先に共有します。',owner:'参考',category:'構成',tags:'共有, 社内',note:'順番が分かりやすい'}).ok"),true);assert.equal(h.run("LS.stock.length"),1);assert.equal(h.run("LS.stock[0].tags.length"),2);h.get("skSearch").value="分かりやすい";h.run("renderStock()");assert.match(h.get("skList").innerHTML,/結論を先に/);const b=h.element();b.dataset.id=h.run("LS.stock[0].id");h.scoped.set("#skList .sk-copy",[b]);h.run("renderStock()");await b.fire("click");assert.equal(h.copied[0],"結論を先に共有します。");assert.equal(h.run("LS.stock[0].n"),1);h.run("LS.history=[{...fixture,id:'history-a'}]");assert.equal(h.run("stockFromHistory('history-a').ok"),true);assert.equal(h.run("LS.stock.length"),2);assert.equal(h.run("stockFromHistory('history-a').duplicate"),true);assert.equal(h.run("saveStock({text:'x'.repeat(10001)}).ok"),false);});
  await test("CSV and text exports preserve examples and neutralize formula input",async()=>{const h=harness();seed(h);h.run("LS.notes=[{d:'2026-09-14',tip:'=1+1',input:fixture.input,output:fixture.output,learning:fixture.learning}]");await h.get("ntCsv").fire("click");const csv=await h.sandbox.lastBlob.text();assert.match(csv,/"'=1\+1"/);assert.match(csv,/ご確認していただ/);assert.match(csv,/敬語を簡潔にする/);await h.get("ntCopyAll").fire("click");assert.match(h.copied[0],/原文:/);});
  await test("backup round-trip, deduplication and legacy import",async()=>{
    const h=harness();seed(h);h.run("LS.notes=[{d:'2026-09-14',tip:'敬語を簡潔に',source:'整える',input:fixture.input,output:fixture.output,learning:fixture.learning}];LS.history=[{...fixture,id:'a'}]");
    h.run("LS.mannerFavorites=['manner-1'];LS.stock=[{id:'stock-a',title:'参考',text:'保存した文章',owner:'参考',category:'言い回し',tags:['表現'],d:'2026-09-15'}]");await h.get("bkExport").fire("click");const json=await h.sandbox.lastBlob.text();assert.equal(JSON.parse(json).ver,7);assert.equal(JSON.stringify(JSON.parse(json).mannerFavorites),'["manner-1"]');assert.equal(JSON.parse(json).stock[0].text,'保存した文章');
    const r=harness();for(let i=0;i<2;i++){r.get("bkFile").files=[{text:json}];await r.get("bkFile").fire("change");}
    assert.equal(r.run("LS.notes[0].learning.points[0].reason"),p.reason);assert.equal(r.run("LS.history[0].learning.points[0].before"),p.before);assert.equal(r.run("LS.notes.length"),1);assert.equal(r.run("LS.history.length"),1);assert.equal(r.run("JSON.stringify(LS.mannerFavorites)"),'["manner-1"]');assert.equal(r.run("LS.stock[0].text"),'保存した文章');
    r.get("bkFile").files=[{text:JSON.stringify({app:"kotoba-desk",ver:1,notes:[{d:"2025-01-01",tip:"旧ノート"}]})}];await r.get("bkFile").fire("change");assert.equal(r.run("LS.notes.length"),2);
  });
  await test("quota error preserves stored data and does not fail result handling",()=>{const h=harness();seed(h);h.run("LS.history=[{...fixture,id:'existing'}]");h.sandbox.localStorage.setItem=()=>{throw Error("quota");};assert.doesNotThrow(()=>h.run("recordHistoryResult({type:'整える',input:'別入力',output:r=>r.revised,learn:true},{revised:'結果',tip:'学び'})"));assert.equal(h.run("LS.history[0].id"),"existing");assert.match(h.get("saveWarning").textContent,/保存できません/);});
  await test("real Gemini path with fake transport verifies masks, cache, and learning",async()=>{
    const h=harness();seed(h);h.run("LS.k='dummy';LS.masks=[{r:'テスト人名',m:'nameA',t:'name'}];LS.maskOn=true");h.sandbox.requests=[];
    h.run("fetchWithTimeout=async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({revised:'nameA様、ご確認いただけますか',tip:'敬語を簡潔に',points:[p],next:'敬語を一つにする'})}]}}]})}}");
    const call="callGemini('system','テスト人名様、ご確認していただけますか',null,{history:{type:'整える',input:'テスト人名様、ご確認していただけますか',output:r=>r.revised,learn:true},maxOutputTokens:900})";
    const r=await h.run(call);assert.match(r.revised,/テスト人名/);assert.ok(!JSON.stringify(h.sandbox.requests).includes("テスト人名"));assert.match(h.sandbox.requests[0].body.system_instruction.parts[0].text,/実例で学ぶ/);
    await h.run(call);assert.equal(h.sandbox.requests.length,1);assert.equal(h.run("LS.notes.length"),1);assert.match(h.run("LS.notes[0].input"),/テスト人名/);
  });
  await test("review and compose button handlers save examples and show coaching",async()=>{
    for(const [button,inputId,outputField,sourceType,resultId] of [
      ["kjBtn","kjInput","revised","整える","kjResultText"],
      ["prBtn","kjInput","revised","添削","prResultText"],
      ["cmBtn","cmInput","draft","文書作成","cmResultText"]]){
      const h=harness();seed(h);h.run("LS.k='dummy'");h.get(inputId).value=p.before;
      h.sandbox.payload={[outputField]:p.after,tip:"敬語を簡潔に",tipTag:"敬語・配慮",points:[p],good:"依頼対象が明確",next:"敬語を一つにする",structure:"依頼を先に"};
      h.run("fetchWithTimeout=async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]})})");
      await h.get(button).fire("click");
      assert.equal(h.get(resultId).textContent,p.after);
      assert.equal(h.run("LS.notes[0].source"),sourceType);assert.equal(h.run("LS.notes[0].learning.points.length"),1);
      assert.equal(h.get(button).disabled,false);
      assert.equal(h.run("LS.coach.length"),sourceType==="文書作成"?0:1);
    }
  });
  await test("structure review keeps recipient-specific controls out and records a neutral example",async()=>{
    const h=harness();seed(h);h.run("LS.k='dummy';selectTone('structure');requests=[]");
    h.get("kjInput").value="この内容をChatGPTに相談したいのですが何から確認すればよいですか";
    h.sandbox.payload={revised:"確認したい内容を整理します。まず、何から確認すればよいかを教えてください。",tip:"質問は目的を先に置く",tipTag:"構成",points:[{before:"この内容を",after:"確認したい内容を整理します",reason:"目的を先に示す"}],next:"質問の目的を冒頭に置く"};
    h.run("fetchWithTimeout=async(url,opts)=>{requests.push(JSON.parse(opts.body));return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]})}}");
    await h.get("prBtn").fire("click");
    const sys=h.sandbox.requests[0].system_instruction.parts[0].text;
    assert.match(sys,/宛先を想定しない文章/);assert.match(sys,/宛名、あいさつ、結び、敬語、依頼や約束を追加せず/);
    assert.equal(h.get("kjIntentRow").classList.contains("hidden"),true);assert.equal(h.get("prepOption").classList.contains("hidden"),true);
    assert.equal(h.get("prPrepWrap").classList.contains("hidden"),true);assert.equal(h.run("LS.history[0].context.startsWith('構成・表現')"),true);
    assert.equal(h.get("cmTone").value,"casual");assert.equal(h.get("prToneLabel").textContent,"構成・表現");
  });
  await test("failed API request leaves history and notes unchanged",async()=>{
    const h=harness();h.run("LS.k='dummy';fetchWithTimeout=async()=>({ok:false,status:403,json:async()=>({error:{message:'denied'}})})");
    h.get("kjInput").value="テスト";await h.get("kjBtn").fire("click");
    assert.equal(h.run("LS.notes.length"),0);assert.equal(h.run("LS.history.length"),0);assert.equal(h.get("kjBtn").disabled,false);
  });
  await test("local history analysis performs no fetch",async()=>{
    const h=harness();seed(h);h.run("LS.history=[fixture]");h.get("coHistoryPeriod").value="all";
    await h.get("coHistoryRefresh").fire("click");assert.match(h.get("coHistoryReport").innerHTML,/敬語を簡潔にする/);
  });
  await test("filtered example copy uses correct library entry and reports clipboard failure",async()=>{
    const h=harness();const chosen=h.run("filteredManners('','断り・調整','同僚・チャット')[0]");
    const b=h.element();b.dataset.i=String(chosen.i);h.scoped.set("#mnList .mn-copy",[b]);
    h.get("mnCategory").value="断り・調整";h.get("mnAudience").value="同僚・チャット";h.run("renderManners()");
    assert.ok(h.get("mnList").innerHTML.includes('data-i="'+chosen.i+'"'));
    await b.fire("click");assert.equal(h.copied[0],chosen.example);
    h.sandbox.navigator.clipboard.writeText=async()=>{throw Error("denied");};await b.fire("click");assert.match(b.textContent,/コピー不可/);
  });
  await test("note deletion stays scoped and preserves phrases",async()=>{
    const h=harness();h.run("LS.notes=[{d:'2026-01-01',tip:'テスト'}];LS.phrases=[{t:'残すフレーズ'}]");
    const b=h.element();b.dataset.i="0";h.scoped.set("#ntList .note-del",[b]);h.run("renderNotes()");
    // The event rerenders; detach this simulated node to avoid accumulating callbacks.
    h.scoped.delete("#ntList .note-del");await b.fire("click");assert.equal(h.run("LS.notes.length"),0);assert.equal(h.run("LS.phrases[0].t"),"残すフレーズ");
  });
  console.log(passed+" tests passed. Simulated DOM only; no browser rendering or live Gemini calls.");
})().catch(e=>{console.error(e);process.exitCode=1;});
