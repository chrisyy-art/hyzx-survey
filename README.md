# 数科行研中心 2026 年度用户体验问卷

一个零依赖的小网站，分为两部分：

| 地址 | 用途 | 谁能访问 |
| --- | --- | --- |
| `/` | 问卷填写页（前台） | 所有拿到链接的人 |
| `/admin` | 管理后台：查看、搜索、按题筛选、删除回复，导出 CSV | 输入管理员密码的人 |

- 只需要 Node.js 18 或以上版本，不用安装任何 npm 包，也没有数据库。
- 回复保存在 `data/responses.json` 文件里。**备份这个文件就等于备份全部数据。**
- 全站统一使用系统自带的中文黑体（苹方 / 微软雅黑），不加载外部字体，国内访问不受影响。
- 同一个浏览器再次打开问卷，会带出上次的回答，修改后提交会覆盖原回答，不会产生重复记录。

---

## 方式一：Docker 部署（推荐）

服务器需要先装好 Docker 和 Docker Compose。

1. 把整个 `hyzx-survey` 文件夹上传到服务器，例如 `/opt/hyzx-survey`。

2. 设置管理员密码：

```bash
cd /opt/hyzx-survey && cp .env.example .env && nano .env
```

3. 启动：

```bash
docker compose up -d --build
```

4. 服务现在运行在服务器本机的 3000 端口。按下面“配置 Nginx”一节对外开放。
   如果不打算用 Nginx，把 `docker-compose.yml` 里的 `"127.0.0.1:3000:3000"` 改成 `"80:3000"`，再运行一次第 3 步，就可以直接用 `http://服务器IP/` 访问。

## 方式二：直接用 Node.js 运行

```bash
cd /opt/hyzx-survey && cp .env.example .env && nano .env
```

先试运行一下（Ctrl+C 停止）：

```bash
ADMIN_PASSWORD='你的密码' node server.js
```

长期运行建议用 systemd，配置文件已经准备在 `deploy/hyzx-survey.service`：

```bash
sudo cp deploy/hyzx-survey.service /etc/systemd/system/ && sudo chown -R www-data /opt/hyzx-survey && sudo systemctl daemon-reload && sudo systemctl enable --now hyzx-survey
```

## 配置 Nginx（对外开放 + HTTPS）

1. 编辑 `deploy/nginx.conf`，把 `survey.example.com` 换成你的域名（没有域名就填服务器公网 IP）。
2. 复制并重载：

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/survey.conf && sudo nginx -t && sudo systemctl reload nginx
```

3. 有域名的话，建议加上 HTTPS（免费证书）：

```bash
sudo certbot --nginx -d survey.example.com
```

4. 别忘了在云服务商控制台的**安全组**里放行 80 和 443 端口。

> 如果使用国内云服务器并绑定域名，域名需要完成 ICP 备案才能通过 80/443 端口访问。

---

## 日常使用

- 问卷链接：`https://你的域名/`
- 后台：`https://你的域名/admin`
- 导出：在后台点“导出 CSV”，用 Excel 直接打开即可，中文不会乱码。
- 备份数据：

```bash
cp /opt/hyzx-survey/data/responses.json ~/survey-backup-$(date +%F).json
```

- 修改题目：题目在两处，需同时修改并重启服务：`public/assets/app.js` 顶部的 `QS`（前台显示）和 `server.js` 顶部的 `QUESTIONS`（后台与导出表头）。

## 可调整的环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 无（必填） | 后台密码，至少 8 位 |
| `PORT` | `3000` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `DATA_DIR` | `./data` | 数据保存目录 |
| `COOKIE_SECURE` | 不设置 | 设为 `1` 时登录 Cookie 只走 HTTPS（经 Nginx 转发时会自动判断） |

## 安全说明

- 后台登录有频率限制（15 分钟内最多 8 次），登录状态 12 小时后失效。
- 问卷提交有频率限制（同一 IP 每小时最多 10 次），每题最多 3000 字。
- 导出 CSV 时会处理以 `=`、`+`、`-`、`@` 开头的内容，防止 Excel 公式注入。
- 问卷页不需要登录，任何拿到链接的人都能填写。如果只想让内网访问，请在安全组或 Nginx 里限制来源 IP。
