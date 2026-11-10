(function(){
  var QS = [
    {t:"请描述最近一次使用行研中心的场景，包括工作任务、查阅内容及最终用途。", h:"例如：准备客户汇报，查阅行业数据和深度报告，用于制作汇报材料。"},
    {t:"过去一年，您是否遇到过行研中心内容无法满足需求的情况？请说明缺失内容及替代获取渠道。", h:"如无，可填写“没有”。"},
    {t:"您希望行研中心新增哪些行业、主题或内容形式（如专家纪要、AI日报）？为什么？", h:""},
    {t:"您希望现有报告在篇幅、深度、表现形式等方面做哪些优化？", h:""},
    {t:"您偏好行研中心采用哪些内容推送方式及频率？哪些运营活动能提升您的使用或推荐意愿？", h:""}
  ];
  var KEYS = ["q1","q2","q3","q4","q5"], MAX = 3000;
  var DRAFT = "hyzx2026-draft", TOKEN = "hyzx2026-token";
  var $ = function(id){ return document.getElementById(id); };
  var store = {
    get:function(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
    set:function(k,v){ try{ localStorage.setItem(k,v); }catch(e){} },
    del:function(k){ try{ localStorage.removeItem(k); }catch(e){} }
  };

  var box = $("questions");
  QS.forEach(function(q,i){
    var d = document.createElement("div"); d.className = "q";
    var num = document.createElement("div"); num.className = "num"; num.textContent = "第 " + (i+1) + " 题 / 共 " + QS.length + " 题";
    var body = document.createElement("div"); body.className = "body";
    var lb = document.createElement("label"); lb.htmlFor = KEYS[i]; lb.textContent = q.t; body.appendChild(lb);
    if(q.h){ var h = document.createElement("div"); h.className = "hint"; h.textContent = q.h; body.appendChild(h); }
    var ta = document.createElement("textarea"); ta.id = KEYS[i]; ta.maxLength = MAX; ta.placeholder = "请在此输入您的回答"; body.appendChild(ta);
    var c = document.createElement("span"); c.className = "count"; c.id = KEYS[i]+"-c"; body.appendChild(c);
    d.appendChild(num); d.appendChild(body); box.appendChild(d);
  });
  var inputs = KEYS.map(function(k){ return $(k); }).concat([$("name")]);
  function count(el){ var c = $(el.id+"-c"); if(c) c.textContent = el.value.length + " / " + MAX; }
  function fill(obj){ inputs.forEach(function(el){ if(obj[el.id] != null) el.value = obj[el.id]; count(el); }); }
  function values(){ var o = {}; inputs.forEach(function(el){ o[el.id] = el.value.trim(); }); return o; }

  var timer;
  inputs.forEach(function(el){ el.addEventListener("input", function(){ count(el); clearTimeout(timer); timer = setTimeout(function(){ store.set(DRAFT, JSON.stringify(values())); }, 400); }); });
  try{ var dr = JSON.parse(store.get(DRAFT) || "null"); if(dr) fill(dr); }catch(e){}
  inputs.forEach(count);

  function fmt(ts){ var d = new Date(ts); function p(n){ return String(n).padStart(2,"0"); } return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+" "+p(d.getHours())+":"+p(d.getMinutes()); }
  function status(msg, cls){ var s = $("status"); s.textContent = msg; s.className = "status " + (cls||""); }
  function notice(msg, cls){ var n = $("notice"); n.textContent = msg; n.className = "notice " + (cls||""); n.hidden = !msg; }
  function showDone(ts, updated){
    $("survey").hidden = true; $("done").hidden = false; notice("");
    $("done-text").textContent = (updated ? "您的回答已于 " : "您已于 ") + fmt(ts) + (updated ? " 更新。" : " 提交问卷。") + "如需补充，可以修改后重新提交，新回答会覆盖原回答。";
    window.scrollTo(0,0);
  }
  $("edit-again").onclick = function(){ $("done").hidden = true; $("survey").hidden = false; status(""); $("submit").textContent = "更新我的回答"; };

  // 已提交过：拉取原回答
  var token = store.get(TOKEN);
  if(token){
    fetch("/api/responses/mine?token=" + encodeURIComponent(token)).then(function(r){ return r.ok ? r.json() : null; }).then(function(rec){
      if(!rec){ store.del(TOKEN); token = null; return; }
      fill(rec); $("submit").textContent = "更新我的回答";
      notice("您已于 " + fmt(rec.submittedAt) + " 提交过问卷，下面是您之前的回答，修改后可再次提交。", "ok");
    }).catch(function(){});
  }

  $("survey").addEventListener("submit", function(e){
    e.preventDefault();
    var v = values();
    if(!KEYS.some(function(k){ return v[k]; })){ status("请至少回答一道题后再提交。", "err"); $("q1").focus(); return; }
    var btn = $("submit"); btn.disabled = true; status("正在提交…");
    if(token) v.editToken = token;
    fetch("/api/responses", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(v)})
      .then(function(r){ return r.json().then(function(j){ return {ok:r.ok, j:j}; }); })
      .then(function(res){
        if(!res.ok){ status(res.j.error || "提交失败，请稍后再试。", "err"); return; }
        token = res.j.editToken; store.set(TOKEN, token); store.del(DRAFT);
        showDone(Date.now(), res.j.updated);
      })
      .catch(function(){ status("网络连接失败，请稍后再点一次提交。您填写的内容已保存在本机。", "err"); })
      .then(function(){ btn.disabled = false; });
  });
})();
