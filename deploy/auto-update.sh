#!/bin/sh
# 每隔几分钟由定时任务调用：GitHub 上有新代码就拉取并重启，没有则什么都不做。
# 回复数据（data/）和密码（.env）不在 Git 里，不会被覆盖。
DIR=/opt/hyzx-survey
GIT="git -C $DIR -c safe.directory=$DIR"
$GIT fetch -q origin main || exit 0
[ "$($GIT rev-parse HEAD)" = "$($GIT rev-parse origin/main)" ] && exit 0
$GIT reset -q --hard origin/main
chown -R www-data "$DIR"
systemctl restart hyzx-survey
echo "$(date '+%F %T') 已更新到 $($GIT log -1 --format='%h %s')"
