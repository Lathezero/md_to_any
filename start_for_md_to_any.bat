@echo off
:: 设置代码页为UTF-8
chcp 65001 > nul

title MD To Any - Markdown转换工具
echo [启动] 正在启动MD To Any服务...
echo [信息] 请稍候，浏览器将自动打开...

:: 启动服务
start /min node server.js

:: 等待服务启动
timeout /t 3 /nobreak > nul

:: 启动浏览器
start http://localhost:3000

echo [成功] 服务已启动！
echo [信息] 如需关闭服务，请关闭此窗口。

:: 保持窗口打开
pause > nul 