(function(){
  var $ = function(id){ return document.getElementById(id); };
  var KEYS = ["q1","q2","q3","q4","q5"];
  var data = [], questions = [];
  function fmt(ts){ var d = new Date(ts); function p(n){ return String(n).padStart(2,"0"); } return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+" "+p(d.getHours())+":"+p(d.getMinutes()); }
  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }

  function highlight(node, text, kw){
    if(!kw){ node.textContent = text; return; }
    var low = text.toLowerCase(), k = kw.toLowerCase(), i = 0, j;
    while((j = low.indexOf(k, i)) >= 0){
      node.appendChild(document.createTextNode(text.slice(i, j)));
      node.appendChild(el("mark", null, text.slice(j, j + k.length)));
      i = j + k.length;
    }
    node.appendChild(document.createTextNode(text.slice(i)));
  }

  function load(){
    $("list-status").textContent = "正在加载…";
    return fetch("/api/admin/responses").then(function(r){
      if(r.status === 401){ showLogin(); return; }
      return r.json().then(function(j){
        questions = j.questions; data = j.responses;
        var sel = $("qsel");
        if(sel.options.length === 1) questions.forEach(function(q,i){ var o = el("option", null, "第 " + (i+1) + " 题：" + q.slice(0, 22) + "…"); o.value = KEYS[i]; sel.appendChild(o); });
        $("app").hidden = false; $("login").hidden = true;
        render();
      });
    }).catch(function(){ $("list-status").textContent = "加载失败，请检查网络后点击刷新。"; });
  }

  function render(){
    var kw = $("kw").value.trim(), q = $("qsel").value;
    var start = new Date(); start.setHours(0,0,0,0);
    $("s-total").textContent = data.length;
    $("s-today").textContent = data.filter(function(r){ return r.submittedAt >= start.getTime(); }).length;
    $("s-dept").textContent = data.filter(function(r){ return r.dept; }).length;
    $("s-last").textContent = data.length ? fmt(Math.max.apply(null, data.map(function(r){ return r.submittedAt; }))) : "—";

    var keys = q === "all" ? KEYS : [q];
    var shown = data.filter(function(r){
      if(q !== "all" && !r[q]) return false;
      if(!kw) return true;
      var hay = [r.name, r.dept].concat(keys.map(function(k){ return r[k]; })).join("\n").toLowerCase();
      return hay.indexOf(kw.toLowerCase()) >= 0;
    });
    $("list-status").textContent = (kw || q !== "all") ? "筛选后显示 " + shown.length + " / " + data.length + " 份" : "";
    var list = $("list"); list.innerHTML = "";
    if(!data.length){ list.appendChild(el("div", "empty-state", "还没有回复。把问卷链接发给同事后，提交的内容会出现在这里。")); return; }
    if(!shown.length){ list.appendChild(el("div", "empty-state", "没有符合条件的回复，换个关键词试试。")); return; }

    shown.forEach(function(r){
      var card = el("article", "resp");
      var head = el("div", "head");
      var nm = el("span", "name"); highlight(nm, r.name || "匿名", kw); head.appendChild(nm);
      if(r.dept){ var dp = el("span", "sub"); highlight(dp, r.dept, kw); head.appendChild(dp); }
      head.appendChild(el("span", "sub", "提交于 " + fmt(r.submittedAt) + (fmt(r.updatedAt) !== fmt(r.submittedAt) ? " · 更新于 " + fmt(r.updatedAt) : "")));
      head.appendChild(el("span", "sp"));
      var del = el("button", "btn danger sm", "删除"); del.type = "button";
      del.onclick = function(){
        var c = el("span", "confirm", "确定删除这份回复？");
        var yes = el("button", "btn danger sm", "删除"); yes.type = "button";
        var no = el("button", "btn ghost sm", "取消"); no.type = "button";
        c.appendChild(yes); c.appendChild(no); del.replaceWith(c);
        no.onclick = function(){ c.replaceWith(del); };
        yes.onclick = function(){
          yes.disabled = true;
          fetch("/api/admin/responses/" + r.id, {method:"DELETE"}).then(function(res){
            if(res.ok){ data = data.filter(function(x){ return x.id !== r.id; }); render(); }
            else { c.textContent = "删除失败，请刷新后重试。"; }
          });
        };
      };
      head.appendChild(del);
      card.appendChild(head);
      keys.forEach(function(k){
        var i = KEYS.indexOf(k), a = el("div", "ans");
        a.appendChild(el("span", "n", String(i+1).padStart(2,"0")));
        a.appendChild(el("span", "qt", questions[i]));
        var p = el("p");
        if(r[k]) highlight(p, r[k], kw); else { p.textContent = "未作答"; p.className = "empty"; }
        a.appendChild(p); card.appendChild(a);
      });
      list.appendChild(card);
    });
  }

  function showLogin(){ $("app").hidden = true; $("login").hidden = false; $("pw").focus(); }
  $("login").addEventListener("submit", function(e){
    e.preventDefault();
    var s = $("login-status"); s.textContent = "正在登录…"; s.className = "status";
    fetch("/api/admin/login", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({password:$("pw").value})})
      .then(function(r){ return r.json().then(function(j){ return {ok:r.ok, j:j}; }); })
      .then(function(res){ if(res.ok){ $("pw").value = ""; s.textContent = ""; load(); } else { s.textContent = res.j.error || "登录失败。"; s.className = "status err"; } })
      .catch(function(){ s.textContent = "网络连接失败。"; s.className = "status err"; });
  });
  $("logout").onclick = function(){ fetch("/api/admin/logout", {method:"POST"}).then(showLogin); };
  $("refresh").onclick = load;
  $("kw").addEventListener("input", render);
  $("qsel").addEventListener("change", render);
  load();
})();
